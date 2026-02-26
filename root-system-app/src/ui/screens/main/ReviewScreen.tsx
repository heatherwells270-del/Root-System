// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Review Screen
//
// The community moderates itself here. Three sections:
//   Flagged  — posts with 1+ flags, community can pile on or clear
//   Removed  — auto-removed posts; author can appeal, community votes
//   Signals  — behavior patterns derived from the local ledger;
//              not accusations — just what the data shows
//
// No platform editors. No admins. The community decides together.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  StyleSheet, ActivityIndicator, Alert, TextInput, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius, CardShadow } from '../../theme/index';
import { getIdentity } from '../../../db/identity';
import { flagPost } from '../../../db/posts';
import {
  getFlaggedPosts, getRemovedPosts, getCommunitySignals,
  getAppealForPost, upsertAppeal, voteOnAppeal,
  type MemberSignal, type SignalPattern,
} from '../../../db/review';
import { hashFlagIdentity, hashVoteIdentity } from '../../../crypto/encrypt';
import { sign } from '../../../crypto/keypair';
import type { Post, Appeal } from '../../../models/types';
import * as Crypto from 'expo-crypto';

// ─── HELPERS ────────────────────────────────────────────────────────────────

const SIGNAL_LABELS: Record<SignalPattern, { title: string; detail: string }> = {
  'always-receiver': {
    title: 'Receives more than gives',
    detail: "This member has received significantly more time-bank hours than they've given back.",
  },
  'ghost-logger': {
    title: 'Unconfirmed exchanges',
    detail: 'This member logged exchanges that the other party never confirmed.',
  },
  'flag-accumulator': {
    title: 'Multiple flagged posts',
    detail: "Two or more of this member's posts have been flagged by the community.",
  },
  'high-velocity': {
    title: 'High posting rate, new account',
    detail: 'This member posted many times very quickly after joining.',
  },
};

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── COMPONENT ──────────────────────────────────────────────────────────────

type Tab = 'flagged' | 'removed' | 'signals';

export default function ReviewScreen() {
  const [tab, setTab]              = useState<Tab>('flagged');
  const [loading, setLoading]      = useState(true);
  const [identity, setIdentity]    = useState<Awaited<ReturnType<typeof getIdentity>>>(null);
  const [flagged,  setFlagged]     = useState<Post[]>([]);
  const [removed,  setRemoved]     = useState<Post[]>([]);
  const [signals,  setSignals]     = useState<MemberSignal[]>([]);
  const [appeals,  setAppeals]     = useState<Map<string, Appeal | null>>(new Map());

  // Appeal form state
  const [appealingPostId,  setAppealingPostId]  = useState<string | null>(null);
  const [appealText,       setAppealText]        = useState('');
  const [appealSubmitting, setAppealSubmitting]  = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadData() {
    try {
      const id = await getIdentity();
      setIdentity(id);
      const communityId = id?.communityIds[0];
      if (!communityId) { setLoading(false); return; }

      const [f, r, s] = await Promise.all([
        getFlaggedPosts(communityId),
        getRemovedPosts(communityId),
        getCommunitySignals(communityId),
      ]);
      setFlagged(f);
      setRemoved(r);
      setSignals(s);

      // Load appeals for removed posts in parallel
      const appealEntries = await Promise.all(
        r.map(async post => [post.id, await getAppealForPost(post.id)] as const)
      );
      setAppeals(new Map(appealEntries));
      setLoadError(null);
      setLoading(false);
    } catch (e) {
      console.error('[ReviewScreen] load failed', e);
      setLoadError('Could not load. Pull to refresh.');
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void loadData();
  }, []));

  async function onRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  // ── Flag a post ─────────────────────────────────────────────────────────

  async function handleFlag(post: Post) {
    if (!identity) return;
    const flagHash = hashFlagIdentity(identity.publicKey, post.id);
    if (post.flaggedBy.includes(flagHash)) {
      Alert.alert('Already flagged', "You've already flagged this post.");
      return;
    }
    Alert.alert(
      'Flag this post?',
      "Flagging signals to the community that something's off. Three flags from different members removes a post automatically.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Flag it',
          onPress: async () => {
            try {
              await flagPost(post.id, flagHash);
              void loadData();
            } catch (e) {
              Alert.alert('Error', 'Could not flag post. Try again.');
              console.error('[ReviewScreen] flag failed', e);
            }
          },
        },
      ]
    );
  }

  // ── Submit appeal ────────────────────────────────────────────────────────

  async function handleAppeal(postId: string) {
    if (!identity || !appealText.trim()) return;
    setAppealSubmitting(true);
    try {
      const now     = new Date().toISOString();
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const communityId = identity.communityIds[0] ?? 'local';
      const appealId = Crypto.randomUUID();

      const appeal: Appeal = {
        id: appealId,
        communityId,
        postId,
        appellantKey:  identity.publicKey,
        appealText:    appealText.trim(),
        restoreVotes:  0,
        upholdVotes:   0,
        voterHashes:   [],
        status:        'pending',
        createdAt:     now,
        expiresAt:     expires,
        _sig:          '',
        _version:      1,
        _updatedAt:    now,
      };

      appeal._sig = await sign(
        `appeal:${appeal.id}:${appeal.postId}:${appeal.appellantKey}`
      );
      await upsertAppeal(appeal);
      setAppealingPostId(null);
      setAppealText('');
      void loadData();
      Alert.alert('Appeal submitted', 'The community will vote. 5 restore votes brings it back; 5 uphold votes closes the appeal.');
    } catch (err) {
      Alert.alert('Error', 'Could not submit appeal.');
    } finally {
      setAppealSubmitting(false);
    }
  }

  // ── Vote on appeal ───────────────────────────────────────────────────────

  async function handleVote(appeal: Appeal, vote: 'restore' | 'uphold') {
    if (!identity) return;
    const voterHash = hashVoteIdentity(identity.publicKey, appeal.id);
    if (appeal.voterHashes.includes(voterHash)) {
      Alert.alert('Already voted', "You've already voted on this appeal.");
      return;
    }
    // Own post's appeal — can't vote on your own
    if (appeal.appellantKey === identity.publicKey) {
      Alert.alert("Can't vote", "You can't vote on your own appeal.");
      return;
    }
    try {
      await voteOnAppeal(appeal.id, vote, voterHash);
      void loadData();
    } catch (e) {
      Alert.alert('Error', 'Could not cast vote. Try again.');
      console.error('[ReviewScreen] vote failed', e);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  const communityId = identity?.communityIds[0];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {loadError && (
        <Text style={styles.loadError}>{loadError}</Text>
      )}
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Community Review</Text>
        <Text style={styles.headerSub}>
          No admins. The community decides together.
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, tab === 'flagged' && styles.tabActive]}
          onPress={() => setTab('flagged')}
        >
          <Text style={[styles.tabText, tab === 'flagged' && styles.tabTextActive]}>
            Flagged{flagged.length > 0 ? ` (${flagged.length})` : ''}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'removed' && styles.tabActive]}
          onPress={() => setTab('removed')}
        >
          <Text style={[styles.tabText, tab === 'removed' && styles.tabTextActive]}>
            Removed{removed.length > 0 ? ` (${removed.length})` : ''}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'signals' && styles.tabActive]}
          onPress={() => setTab('signals')}
        >
          <Text style={[styles.tabText, tab === 'signals' && styles.tabTextActive]}>
            Signals{signals.length > 0 ? ` (${signals.length})` : ''}
          </Text>
        </Pressable>
      </View>

      {/* ── No community ──────────────────────────────────────────────── */}
      {!communityId && (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>⚖</Text>
          <Text style={styles.emptyText}>Join a community to participate in review.</Text>
        </View>
      )}

      {/* ── FLAGGED ──────────────────────────────────────────────────── */}
      {communityId && tab === 'flagged' && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
          <Text style={styles.sectionNote}>
            Posts with one or more community flags. Three flags from different members
            removes a post automatically. Review and flag if something's wrong —
            or scroll past if it looks fine.
          </Text>

          {flagged.length === 0 && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>✦</Text>
              <Text style={styles.emptyText}>Nothing flagged right now. The community is clean.</Text>
            </View>
          )}

          {flagged.map(post => {
            const alreadyFlagged = identity
              ? false // we'd need async check — simplified: show flag count only
              : false;
            return (
              <View key={post.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.typeDot, {
                    backgroundColor: post.type === 'offer' ? Colors.primaryMid
                      : post.type === 'need' ? Colors.error : Colors.primary,
                  }]} />
                  <Text style={styles.cardType}>
                    {post.type === 'offer' ? 'Offering' : post.type === 'need' ? 'Seeking' : 'Free'}
                  </Text>
                  <View style={styles.flagBadge}>
                    <Text style={styles.flagBadgeText}>
                      {post.flags} flag{post.flags !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <Text style={styles.cardDate}>{relativeDate(post.createdAt)}</Text>
                </View>

                <Text style={styles.cardTitle}>{post.title}</Text>
                <Text style={styles.cardBody}>{post.body}</Text>

                <View style={styles.cardMeta}>
                  <Text style={styles.cardHandle}>{post.handle || 'Anonymous'}</Text>
                  {post.zone !== 'Any / Network-wide' && (
                    <Text style={styles.cardZone}>{post.zone}</Text>
                  )}
                </View>

                <View style={styles.cardActions}>
                  <Pressable
                    style={styles.flagBtn}
                    onPress={() => handleFlag(post)}
                  >
                    <Text style={styles.flagBtnText}>Flag this too</Text>
                  </Pressable>
                  <View style={styles.thresholdNote}>
                    <Text style={styles.thresholdText}>
                      {3 - post.flags} more flag{3 - post.flags !== 1 ? 's' : ''} to remove
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* ── REMOVED ──────────────────────────────────────────────────── */}
      {communityId && tab === 'removed' && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
          <Text style={styles.sectionNote}>
            Posts removed by the community's flag threshold.
            Authors can appeal — 5 restore votes brings a post back.
            5 uphold votes closes the appeal.
          </Text>

          {removed.length === 0 && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>⚖</Text>
              <Text style={styles.emptyText}>No removed posts.</Text>
            </View>
          )}

          {removed.map(post => {
            const appeal = appeals.get(post.id) ?? null;
            const isOwn  = identity?.publicKey === post.authorPublicKey;

            return (
              <View key={post.id} style={[styles.card, styles.cardRemoved]}>
                <View style={styles.cardTop}>
                  <View style={styles.removedBadge}>
                    <Text style={styles.removedBadgeText}>Removed</Text>
                  </View>
                  <Text style={styles.cardDate}>{relativeDate(post._updatedAt ?? post.createdAt)}</Text>
                </View>

                <Text style={styles.cardTitle}>{post.title}</Text>
                <Text style={styles.cardBody} numberOfLines={2}>{post.body}</Text>
                <Text style={styles.cardHandle}>{post.handle || 'Anonymous'}</Text>

                {/* No appeal yet */}
                {!appeal && isOwn && appealingPostId !== post.id && (
                  <Pressable
                    style={styles.appealBtn}
                    onPress={() => { setAppealingPostId(post.id); setAppealText(''); }}
                  >
                    <Text style={styles.appealBtnText}>Appeal this removal</Text>
                  </Pressable>
                )}

                {/* Appeal form */}
                {!appeal && isOwn && appealingPostId === post.id && (
                  <View style={styles.appealForm}>
                    <Text style={styles.appealFormLabel}>
                      Tell the community why this should be restored.
                    </Text>
                    <TextInput
                      style={[styles.input, styles.textarea]}
                      value={appealText}
                      onChangeText={setAppealText}
                      placeholder="What did this post contain? Why was it appropriate?"
                      placeholderTextColor={Colors.dim}
                      multiline
                      numberOfLines={4}
                      maxLength={500}
                      textAlignVertical="top"
                    />
                    <View style={styles.appealFormActions}>
                      <Pressable
                        style={[styles.submitSmall, appealSubmitting && styles.submitSmallDisabled]}
                        onPress={() => handleAppeal(post.id)}
                        disabled={appealSubmitting}
                      >
                        {appealSubmitting
                          ? <ActivityIndicator color={Colors.textOnDark} size="small" />
                          : <Text style={styles.submitSmallText}>Submit appeal</Text>
                        }
                      </Pressable>
                      <Pressable
                        style={styles.cancelSmall}
                        onPress={() => { setAppealingPostId(null); setAppealText(''); }}
                      >
                        <Text style={styles.cancelSmallText}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* Active appeal — show vote buttons */}
                {appeal && appeal.status === 'pending' && (
                  <View style={styles.appealVote}>
                    <Text style={styles.appealVoteLabel}>Appeal pending</Text>
                    <Text style={styles.appealReason}>{appeal.appealText}</Text>
                    <View style={styles.voteBar}>
                      <Text style={styles.voteCount}>
                        {appeal.restoreVotes} restore · {appeal.upholdVotes} uphold
                      </Text>
                    </View>
                    {!isOwn && (
                      <View style={styles.voteActions}>
                        <Pressable
                          style={styles.restoreBtn}
                          onPress={() => handleVote(appeal, 'restore')}
                        >
                          <Text style={styles.restoreBtnText}>Restore</Text>
                        </Pressable>
                        <Pressable
                          style={styles.upholdBtn}
                          onPress={() => handleVote(appeal, 'uphold')}
                        >
                          <Text style={styles.upholdBtnText}>Uphold removal</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                )}

                {/* Resolved appeal */}
                {appeal && appeal.status !== 'pending' && (
                  <View style={styles.appealResolved}>
                    <Text style={[
                      styles.appealResolvedText,
                      { color: appeal.status === 'restored' ? Colors.greenMid : Colors.dim },
                    ]}>
                      Appeal {appeal.status === 'restored' ? 'resolved: post restored' : 'closed: removal upheld'}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* ── SIGNALS ──────────────────────────────────────────────────── */}
      {communityId && tab === 'signals' && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
          <Text style={styles.sectionNote}>
            Patterns derived from the community's shared exchange and post history.
            These are observations, not verdicts. Review them together and decide
            what, if anything, to do. Flagging a post is always an option.
          </Text>

          {signals.length === 0 && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>🌿</Text>
              <Text style={styles.emptyText}>
                No patterns to flag right now. The community is operating in good faith.
              </Text>
            </View>
          )}

          {signals.map(member => (
            <View key={member.publicKey} style={styles.signalCard}>
              <View style={styles.signalHeader}>
                <Text style={styles.signalHandle}>{member.handle || 'Anonymous'}</Text>
                <View style={styles.signalBadges}>
                  {member.patterns.map(p => (
                    <View key={p} style={styles.patternBadge}>
                      <Text style={styles.patternBadgeText}>
                        {p === 'always-receiver' ? 'imbalanced'
                         : p === 'ghost-logger'   ? 'unconfirmed'
                         : p === 'flag-accumulator' ? 'flagged'
                         : 'high-velocity'}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Stats grid */}
              <View style={styles.statsGrid}>
                <View style={styles.statCell}>
                  <Text style={styles.statNum}>{member.postCount}</Text>
                  <Text style={styles.statLabel}>posts</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={[styles.statNum, member.flaggedPostCount > 0 && { color: Colors.wine }]}>
                    {member.flaggedPostCount}
                  </Text>
                  <Text style={styles.statLabel}>flagged</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statNum}>{member.hoursGiven.toFixed(1)}</Text>
                  <Text style={styles.statLabel}>hrs given</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={[styles.statNum, member.hoursReceived > member.hoursGiven * 3 && { color: Colors.wine }]}>
                    {member.hoursReceived.toFixed(1)}
                  </Text>
                  <Text style={styles.statLabel}>hrs received</Text>
                </View>
              </View>

              {/* Pattern details */}
              {member.patterns.map(p => (
                <View key={p} style={styles.patternDetail}>
                  <Text style={styles.patternDetailTitle}>{SIGNAL_LABELS[p].title}</Text>
                  <Text style={styles.patternDetailText}>{SIGNAL_LABELS[p].detail}</Text>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── STYLES ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },

  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontFamily: Typography.serif,
    fontWeight: 'bold',
    fontSize: Typography.xl,
    color: Colors.text,
  },
  headerSub: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },

  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontFamily: Typography.body, fontSize: Typography.xs, color: Colors.textMuted },
  tabTextActive: { color: Colors.primary },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },

  sectionNote: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.sm,
    color: Colors.textMuted,
    lineHeight: 22,
    marginBottom: Spacing.xs,
  },

  emptyBox: { alignItems: 'center', paddingTop: Spacing.xxl, gap: Spacing.sm },
  emptyIcon: { fontSize: 28, color: Colors.primary },
  emptyText: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.base,
    color: Colors.textMuted,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 24,
  },

  // Flagged / removed post cards
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    ...CardShadow,
  },
  cardRemoved: {
    opacity: 0.85,
    borderColor: 'rgba(138,37,53,0.3)',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.sm },
  typeDot: { width: 8, height: 8, borderRadius: 4 },
  cardType: { fontFamily: Typography.body, fontWeight: '600', fontSize: Typography.xs, color: Colors.textMuted, flex: 1 },
  cardDate: { fontFamily: Typography.body, fontStyle: 'italic', fontSize: Typography.xs, color: Colors.textMuted },

  flagBadge: {
    backgroundColor: 'rgba(138,37,53,0.12)',
    borderWidth: 1,
    borderColor: Colors.error,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  flagBadgeText: { fontFamily: Typography.body, fontWeight: '600', fontSize: 10, color: Colors.error },

  removedBadge: {
    flex: 1,
    backgroundColor: 'rgba(138,37,53,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(138,37,53,0.3)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
  },
  removedBadgeText: { fontFamily: Typography.body, fontWeight: '600', fontSize: 10, color: Colors.error },

  cardTitle: {
    fontFamily: Typography.serif,
    fontWeight: 'bold',
    fontSize: Typography.md,
    color: Colors.text,
    marginBottom: 4,
  },
  cardBody: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.textMuted,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  cardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  cardHandle: { fontFamily: Typography.body, fontStyle: 'italic', fontSize: Typography.xs, color: Colors.textMuted },
  cardZone:   { fontFamily: Typography.body, fontStyle: 'italic', fontSize: Typography.xs, color: Colors.textMuted },

  cardActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  flagBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.error,
    backgroundColor: 'rgba(138,37,53,0.06)',
  },
  flagBtnText: { fontFamily: Typography.body, fontWeight: '600', fontSize: Typography.xs, color: Colors.error },
  thresholdNote: { flex: 1 },
  thresholdText: { fontFamily: Typography.body, fontStyle: 'italic', fontSize: Typography.xs, color: Colors.textMuted },

  // Appeal UI
  appealBtn: {
    marginTop: Spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
  },
  appealBtnText: { fontFamily: Typography.body, fontWeight: '600', fontSize: Typography.xs, color: Colors.primary },

  appealForm: { marginTop: Spacing.sm, gap: Spacing.sm },
  appealFormLabel: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.sm,
    color: Colors.textMuted,
    lineHeight: 20,
  },
  input: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.text,
    minHeight: 44,
  },
  textarea: { minHeight: 90, paddingTop: 10 },
  appealFormActions: { flexDirection: 'row', gap: Spacing.sm },
  submitSmall: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: Radius.sm,
    backgroundColor: Colors.primary,
  },
  submitSmallDisabled: { backgroundColor: Colors.primaryLight },
  submitSmallText: { fontFamily: Typography.body, fontWeight: '600', fontSize: Typography.xs, color: Colors.textOnDark },
  cancelSmall: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelSmallText: { fontFamily: Typography.body, fontWeight: '600', fontSize: Typography.xs, color: Colors.textMuted },

  appealVote: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    gap: 6,
  },
  appealVoteLabel: { fontFamily: Typography.body, fontWeight: '600', fontSize: Typography.xs, color: Colors.primary },
  appealReason: { fontFamily: Typography.body, fontStyle: 'italic', fontSize: Typography.sm, color: Colors.textMuted, lineHeight: 20 },
  voteBar: { flexDirection: 'row' },
  voteCount: { fontFamily: Typography.body, fontSize: Typography.xs, color: Colors.textMuted },
  voteActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: 4 },
  restoreBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.primaryMid,
    backgroundColor: Colors.primaryLight,
  },
  restoreBtnText: { fontFamily: Typography.body, fontWeight: '600', fontSize: Typography.xs, color: Colors.primaryMid },
  upholdBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  upholdBtnText: { fontFamily: Typography.body, fontWeight: '600', fontSize: Typography.xs, color: Colors.textMuted },

  appealResolved: { marginTop: Spacing.sm },
  appealResolvedText: { fontFamily: Typography.body, fontStyle: 'italic', fontSize: Typography.xs },

  // Signal cards
  signalCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    ...CardShadow,
  },
  signalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  signalHandle: {
    fontFamily: Typography.serif,
    fontWeight: 'bold',
    fontSize: Typography.md,
    color: Colors.text,
    flex: 1,
  },
  signalBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, flexShrink: 1 },
  patternBadge: {
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.borderMid,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  patternBadgeText: { fontFamily: Typography.body, fontWeight: '600', fontSize: 9, color: Colors.primary },

  statsGrid: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  statCell: {
    flex: 1,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    padding: Spacing.xs,
    alignItems: 'center',
  },
  statNum: {
    fontFamily: Typography.serif,
    fontWeight: 'bold',
    fontSize: Typography.lg,
    color: Colors.text,
  },
  statLabel: { fontFamily: Typography.body, fontStyle: 'italic', fontSize: 10, color: Colors.textMuted },

  patternDetail: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.xs,
    marginTop: Spacing.xs,
  },
  patternDetailTitle: {
    fontFamily: Typography.body,
    fontWeight: '600',
    fontSize: Typography.xs,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  patternDetailText: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  loadError: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.error,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
} as const);
