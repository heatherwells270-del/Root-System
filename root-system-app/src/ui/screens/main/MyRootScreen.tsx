// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — My Root Screen
//
// Profile, your posts, settings, data export, nuclear delete.
// Everything here is your data. You own it. You can take it or destroy it.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  StyleSheet, ActivityIndicator, Alert, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius, CardShadow } from '../../theme/index';
import { getIdentity, updateIdentityProfile } from '../../../db/identity';
import { getMyCommunity } from '../../../db/communities';
import { getMyPosts, tombstonePost, renewPost, getCommunityPostStats } from '../../../db/posts';
import { getExchangesForKey, getTimebankStats, getCommunityExchangeStats, getConfirmedExchangeCount } from '../../../db/exchanges';
import type { TimebankStats } from '../../../db/exchanges';
import { getKnowledgeEntries } from '../../../db/knowledge';
import { getCoalitionsForCommunity } from '../../../db/coalitions';
import { sign, canonicalTombstone } from '../../../crypto/keypair';
import { encryptCommunityKeyFor } from '../../../crypto/encrypt';
import {
  onKeyRequestPending, approveCommunityKey, getCommunityKey,
  onContactRequestPending, approveContactRequest, declineContactRequest,
  type IncomingContactRequest,
} from '../../../sync/index';
import { getContactInfo } from '../../../db/contact_info';
import { nukeLocalData } from '../../../db/nuke';
import { isSeeded, seedDemoData } from '../../../db/seed';
import { getBlockedHandles, unblockHandle } from '../../../db/blocks';
import { emitAppEvent } from '../../appEvents';
import { Linking } from 'react-native';
import type { Post, Community } from '../../../models/types';

// ─── HELPERS ────────────────────────────────────────────────────────────────

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysUntil(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

// ─── COMPONENT ──────────────────────────────────────────────────────────────

type Tab = 'posts' | 'profile' | 'settings';

export default function MyRootScreen() {
  const navigation = useNavigation();
  const [tab, setTab]           = useState<Tab>('posts');
  const [loading, setLoading]   = useState(true);
  const [identity, setIdentity] = useState<Awaited<ReturnType<typeof getIdentity>>>(null);
  const [community, setCommunity] = useState<Community | null>(null);
  const [myPosts, setMyPosts]   = useState<Post[]>([]);
  const [tbStats, setTbStats]           = useState<TimebankStats>({ given: 0, received: 0 });
  const [exchangeCount, setExchangeCount] = useState(0);
  const [communityPulse, setCommunityPulse] = useState<{
    activePosts: number; postsThisWeek: number;
    confirmedThisWeek: number; hoursThisWeek: number;
  } | null>(null);
  const [pendingKeyReqs, setPendingKeyReqs] =
    useState<Array<{ communityId: string; requesterPublicKey: string }>>([]);
  const [pendingContactReqs, setPendingContactReqs] =
    useState<IncomingContactRequest[]>([]);
  const [seeded,         setSeeded]         = useState(false);
  const [seedLoading,    setSeedLoading]    = useState(false);
  const [blockedHandles, setBlockedHandles] = useState<string[]>([]);

  // Profile edit form
  const [editHandle, setEditHandle] = useState('');
  const [editBio, setEditBio]       = useState('');
  const [editZip, setEditZip]       = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editSaved, setEditSaved]   = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadData() {
    const [id, comm] = await Promise.all([getIdentity(), getMyCommunity()]);
    setIdentity(id);
    setCommunity(comm);
    if (id) {
      const [posts, stats, exCount] = await Promise.all([
        getMyPosts(id.publicKey),
        getTimebankStats(id.publicKey),
        getConfirmedExchangeCount(id.publicKey),
      ]);
      setMyPosts(posts);
      setTbStats(stats);
      setExchangeCount(exCount);
      setEditHandle(id.handle ?? '');
      setEditBio(id.bio ?? '');
      setEditZip(id.location?.zip ?? '');

      // Community pulse — what's been happening in the commons this week
      const cid = id.communityIds[0];
      if (cid) {
        const [postStats, exStats] = await Promise.all([
          getCommunityPostStats(cid),
          getCommunityExchangeStats(cid),
        ]);
        setCommunityPulse({
          activePosts:       postStats.activePosts,
          postsThisWeek:     postStats.postsThisWeek,
          confirmedThisWeek: exStats.confirmedThisWeek,
          hoursThisWeek:     exStats.hoursThisWeek,
        });
      }
    }
    const [alreadySeeded, blocked] = await Promise.all([isSeeded(), getBlockedHandles()]);
    setSeeded(alreadySeeded);
    setBlockedHandles(blocked);
    setLoading(false);
  }

  useFocusEffect(useCallback(() => {
    setLoading(true);
    loadData();
  }, []));

  // Subscribe to key requests from the relay (planter only).
  // This runs once — key requests queue up until the planter acts.
  useEffect(() => {
    const unsub = onKeyRequestPending((communityId, requesterPublicKey) => {
      setPendingKeyReqs(prev => {
        const already = prev.some(r => r.requesterPublicKey === requesterPublicKey);
        if (already) return prev;
        return [...prev, { communityId, requesterPublicKey }];
      });
    });
    return unsub;
  }, []);

  // Subscribe to incoming contact requests (author of the post receives these).
  useEffect(() => {
    const unsub = onContactRequestPending((req) => {
      setPendingContactReqs(prev => {
        const already = prev.some(r => r.requestId === req.requestId);
        if (already) return prev;
        return [...prev, req];
      });
    });
    return unsub;
  }, []);

  // ── Planter: approve key request ────────────────────────────────────────

  async function handleApproveKey(req: { communityId: string; requesterPublicKey: string }) {
    const communityKey = await getCommunityKey(req.communityId);
    if (!communityKey) {
      Alert.alert('No community key', 'Your device doesn\'t have the community key yet.');
      return;
    }
    try {
      await approveCommunityKey(
        req.communityId,
        req.requesterPublicKey,
        communityKey,
        encryptCommunityKeyFor,
      );
      setPendingKeyReqs(prev => prev.filter(r => r.requesterPublicKey !== req.requesterPublicKey));
    } catch {
      Alert.alert('Error', 'Could not approve the key request. Try again when connected.');
    }
  }

  // ── Contact request: approve ─────────────────────────────────────────────

  async function handleApproveContact(req: IncomingContactRequest) {
    const contact = await getContactInfo(req.postId);
    if (!contact) {
      Alert.alert('No contact info', 'You haven\'t saved contact info for this post. Edit the post to add it.');
      return;
    }
    try {
      await approveContactRequest(req.postId, req.requestId, req.requesterPublicKey, req.communityId, contact);
      setPendingContactReqs(prev => prev.filter(r => r.requestId !== req.requestId));
    } catch {
      Alert.alert('Error', 'Could not send contact info. Try again when connected.');
    }
  }

  // ── Contact request: decline ──────────────────────────────────────────────

  function handleDeclineContact(req: IncomingContactRequest) {
    Alert.alert(
      'Decline contact request?',
      `${req.requesterHandle || 'Someone'} asked for your contact info on "${req.postTitle}".`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: () => {
            declineContactRequest(req.postId, req.requestId, req.requesterPublicKey, req.communityId);
            setPendingContactReqs(prev => prev.filter(r => r.requestId !== req.requestId));
          },
        },
      ]
    );
  }

  // ── Planter: share invite code ───────────────────────────────────────────

  async function handleShareInvite() {
    if (!community) return;
    const raw = `${community.id}:${community.planterPublicKey}`;
    const code = btoa(raw);
    await Share.share({
      message: `Join my community on Root System. Invite code:\n\n${code}`,
      title: 'Root System invite',
    });
  }

  // ── Profile save ────────────────────────────────────────────────────────

  async function handleSaveProfile() {
    setEditSaving(true);
    try {
      await updateIdentityProfile(
        editHandle.trim() || null,
        editBio.trim() || null,
        editZip.trim() ? { zip: editZip.trim(), city: null, state: null, lat: null, lng: null } : null
      );
      setEditSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setEditSaved(false), 2000);
      loadData();
    } catch (err) {
      Alert.alert('Error', 'Could not save profile.');
    } finally {
      setEditSaving(false);
    }
  }

  // ── Post actions ────────────────────────────────────────────────────────

  async function handleWithdraw(postId: string) {
    Alert.alert(
      'Withdraw post?',
      'This removes it from the community. The record is kept internally (tombstone) so deletions sync correctly, but the content disappears.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            if (!identity) return;
            const sig = await sign(canonicalTombstone(postId, identity.publicKey));
            await tombstonePost(postId, sig);
            loadData();
          },
        },
      ]
    );
  }

  async function handleRenew(postId: string) {
    const newExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    await renewPost(postId, newExpiry);
    loadData();
    Alert.alert('Renewed', 'Post is live for another 14 days.');
  }

  // ── Sample data ──────────────────────────────────────────────────────────

  async function handleSeed() {
    setSeedLoading(true);
    try {
      await seedDemoData();
      await loadData();
      Alert.alert('Done', 'Ixidor and Maren are in the root. Check Browse, Time Bank, Knowledge, and Coalitions.');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not load sample data.');
    } finally {
      setSeedLoading(false);
    }
  }

  // ── Unblock a handle ────────────────────────────────────────────────────

  async function handleUnblock(handle: string) {
    await unblockHandle(handle);
    setBlockedHandles(prev => prev.filter(h => h !== handle));
  }

  // ── Data export ─────────────────────────────────────────────────────────

  async function handleExport() {
    if (!identity) return;
    const communityId = identity.communityIds[0] ?? '';
    const [exchanges, knowledge, coalitions] = await Promise.all([
      getExchangesForKey(identity.publicKey),
      communityId ? getKnowledgeEntries(communityId) : Promise.resolve([]),
      communityId ? getCoalitionsForCommunity(communityId) : Promise.resolve([]),
    ]);
    const myKnowledge  = knowledge.filter(e => e.authorPublicKey === identity.publicKey);
    const myCoalitions = coalitions.filter(c => c.memberKeys.includes(identity.publicKey));
    const data = {
      exportedAt: new Date().toISOString(),
      identity: {
        publicKey: identity.publicKey,
        handle:    identity.handle,
        bio:       identity.bio,
        location:  identity.location,
        createdAt: identity.createdAt,
      },
      posts:      myPosts,
      exchanges,
      knowledge:  myKnowledge,
      coalitions: myCoalitions,
    };
    const json = JSON.stringify(data, null, 2);
    await Share.share({ message: json, title: 'Root System data export' });
  }

  // ── Nuclear delete ──────────────────────────────────────────────────────

  async function handleDelete() {
    Alert.alert(
      'Delete everything?',
      'This permanently wipes all local data — your identity, posts, and exchanges. It cannot be undone. If you set up recovery, your keypair can be restored, but no other data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Last chance',
              'All local data will be gone. Are you absolutely sure?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, wipe everything',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await nukeLocalData();
                      // Signal App.tsx to reset navigation to Covenant
                      emitAppEvent('data-nuked');
                    } catch {
                      Alert.alert('Error', 'Could not delete all data. Try again, or uninstall the app to remove all data.');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }

  // ── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  const activePosts    = myPosts.filter(p => p.status === 'active' && !p._tombstone);
  const expiringSoon   = activePosts.filter(p => daysUntil(p.expiresAt) <= 3);
  const withdrawnPosts = myPosts.filter(p => p._tombstone || p.status === 'withdrawn');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Identity header */}
      <View style={styles.header}>
        <Text style={styles.handle}>{identity?.handle || 'A neighbor'}</Text>
        {identity?.bio && <Text style={styles.headerBio}>{identity.bio}</Text>}
        <View style={styles.headerStats}>
          {identity?.createdAt && (
            <Text style={styles.headerSince}>
              in the root since {new Date(identity.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </Text>
          )}
          <View style={styles.headerStatRow}>
            {exchangeCount > 0 && (
              <Text style={styles.headerStatChip}>
                {exchangeCount} exchange{exchangeCount !== 1 ? 's' : ''}
              </Text>
            )}
            {(tbStats.given > 0 || tbStats.received > 0) && (
              <Text style={styles.headerStatChip}>
                {tbStats.given.toFixed(1)}g · {tbStats.received.toFixed(1)}r hrs
              </Text>
            )}
            {activePosts.length > 0 && (
              <Text style={styles.headerStatChip}>
                {activePosts.length} post{activePosts.length !== 1 ? 's' : ''} live
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['posts', 'profile', 'settings'] as Tab[]).map(t => (
          <Pressable
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'posts' ? 'My Posts' : t === 'profile' ? 'Profile' : 'Settings'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── MY POSTS ──────────────────────────────────────────────────────── */}
      {tab === 'posts' && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          {/* Planter: pending join requests */}
          {pendingKeyReqs.length > 0 && (
            <View style={styles.keyReqBanner}>
              <Text style={styles.keyReqTitle}>
                {pendingKeyReqs.length} member{pendingKeyReqs.length > 1 ? 's' : ''} requesting to join
              </Text>
              {pendingKeyReqs.map((req, i) => (
                <View key={i} style={styles.keyReqRow}>
                  <Text style={styles.keyReqKey} numberOfLines={1}>
                    {req.requesterPublicKey.slice(0, 20)}…
                  </Text>
                  <Pressable style={styles.approveBtn} onPress={() => handleApproveKey(req)}>
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {/* Contact requests — incoming for posts you authored */}
          {pendingContactReqs.length > 0 && (
            <View style={styles.contactReqBanner}>
              <Text style={styles.contactReqTitle}>
                {pendingContactReqs.length} contact request{pendingContactReqs.length > 1 ? 's' : ''}
              </Text>
              {pendingContactReqs.map(req => (
                <View key={req.requestId} style={styles.contactReqRow}>
                  <View style={styles.contactReqInfo}>
                    <Text style={styles.contactReqHandle} numberOfLines={1}>
                      {req.requesterHandle || req.requesterPublicKey.slice(0, 16) + '…'}
                    </Text>
                    <Text style={styles.contactReqPost} numberOfLines={1}>
                      on "{req.postTitle}"
                    </Text>
                  </View>
                  <View style={styles.contactReqActions}>
                    <Pressable
                      style={[styles.approveBtn, styles.contactDeclineBtn]}
                      onPress={() => handleDeclineContact(req)}
                    >
                      <Text style={styles.contactDeclineBtnText}>Decline</Text>
                    </Pressable>
                    <Pressable style={styles.approveBtn} onPress={() => handleApproveContact(req)}>
                      <Text style={styles.approveBtnText}>Share</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Community pulse */}
          {communityPulse && (communityPulse.activePosts > 0 || communityPulse.confirmedThisWeek > 0) && (
            <View style={styles.pulseCard}>
              <Text style={styles.pulseTitle}>Your community this week</Text>
              <View style={styles.pulseRow}>
                {communityPulse.activePosts > 0 && (
                  <View style={styles.pulseStat}>
                    <Text style={styles.pulseNumber}>{communityPulse.activePosts}</Text>
                    <Text style={styles.pulseLabel}>posts in{'\n'}the community</Text>
                  </View>
                )}
                {communityPulse.confirmedThisWeek > 0 && (
                  <View style={styles.pulseStat}>
                    <Text style={styles.pulseNumber}>{communityPulse.confirmedThisWeek}</Text>
                    <Text style={styles.pulseLabel}>exchange{communityPulse.confirmedThisWeek !== 1 ? 's' : ''}{'\n'}confirmed</Text>
                  </View>
                )}
                {communityPulse.hoursThisWeek > 0 && (
                  <View style={styles.pulseStat}>
                    <Text style={styles.pulseNumber}>{communityPulse.hoursThisWeek % 1 === 0 ? communityPulse.hoursThisWeek : communityPulse.hoursThisWeek.toFixed(1)}</Text>
                    <Text style={styles.pulseLabel}>hours in{'\n'}circulation</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {activePosts.length === 0 && withdrawnPosts.length === 0 && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>🌿</Text>
              <Text style={styles.emptyText}>The community is waiting for your first post.</Text>
            </View>
          )}

          {expiringSoon.length > 0 && (
            <View style={styles.expiryNotice}>
              <Text style={styles.expiryNoticeText}>
                {expiringSoon.length} post{expiringSoon.length > 1 ? 's' : ''} expiring within 3 days
              </Text>
            </View>
          )}

          {activePosts.map(p => {
            const daysLeft = daysUntil(p.expiresAt);
            return (
              <View key={p.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.typeDot, { backgroundColor: p.type === 'offer' ? Colors.primaryMid : p.type === 'need' ? Colors.error : Colors.primary }]} />
                  <Text style={styles.cardType}>
                    {p.type === 'offer' ? 'Offering' : p.type === 'need' ? 'Seeking' : 'Free'}
                  </Text>
                  <Text style={[styles.cardExpiry, daysLeft <= 3 && { color: Colors.wine }]}>
                    {daysLeft === 0 ? 'Expires today' : `${daysLeft}d left`}
                  </Text>
                </View>
                <Text style={styles.cardTitle}>{p.title}</Text>
                <Text style={styles.cardBody} numberOfLines={2}>{p.body}</Text>
                {p.flags > 0 && (
                  <Text style={styles.flagNote}>{p.flags} flag{p.flags > 1 ? 's' : ''}</Text>
                )}
                <View style={styles.cardActions}>
                  <Pressable style={styles.renewBtn} onPress={() => handleRenew(p.id)}>
                    <Text style={styles.renewBtnText}>Renew 14d</Text>
                  </Pressable>
                  <Pressable style={styles.withdrawBtn} onPress={() => handleWithdraw(p.id)}>
                    <Text style={styles.withdrawBtnText}>Withdraw</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

          {withdrawnPosts.length > 0 && (
            <Text style={styles.sectionDivider}>Withdrawn</Text>
          )}
          {withdrawnPosts.map(p => (
            <View key={p.id} style={[styles.card, styles.cardWithdrawn]}>
              <Text style={styles.cardTitle}>{p.title}</Text>
              <Text style={styles.cardDate}>Withdrawn {relativeDate(p._updatedAt)}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {/* ── PROFILE ──────────────────────────────────────────────────────── */}
      {tab === 'profile' && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={styles.profileNote}>
            Your handle and bio appear on your posts. Your location is used to show you nearby
            posts — it's stored as an approximate area, not your exact address.
            All of this is optional.
          </Text>

          <Text style={styles.fieldLabel}>Handle</Text>
          <TextInput
            style={styles.input}
            value={editHandle}
            onChangeText={setEditHandle}
            placeholder="How people address you"
            placeholderTextColor={Colors.dim}
            maxLength={40}
            autoCorrect={false}
          />

          <Text style={styles.fieldLabel}>
            Bio <Text style={styles.fieldHint}>(max 280)</Text>
          </Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={editBio}
            onChangeText={v => setEditBio(v.slice(0, 280))}
            placeholder="Who you are in this community"
            placeholderTextColor={Colors.dim}
            multiline
            numberOfLines={4}
            maxLength={280}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{editBio.length}/280</Text>

          <Text style={styles.fieldLabel}>
            ZIP code <Text style={styles.fieldHint}>(used for local filtering only)</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={editZip}
            onChangeText={setEditZip}
            placeholder="e.g. 20001"
            placeholderTextColor={Colors.dim}
            keyboardType="number-pad"
            maxLength={10}
          />

          <Pressable
            style={[styles.saveBtn, editSaving && styles.saveBtnDisabled]}
            onPress={handleSaveProfile}
            disabled={editSaving}
          >
            {editSaving
              ? <ActivityIndicator color={Colors.textOnDark} />
              : <Text style={styles.saveBtnText}>{editSaved ? 'Saved ✓' : 'Save Profile'}</Text>
            }
          </Pressable>
        </ScrollView>
      )}

      {/* ── SETTINGS ─────────────────────────────────────────────────────── */}
      {tab === 'settings' && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          <Text style={styles.settingsSectionTitle}>Your Identity</Text>
          <View style={styles.settingsCard}>
            <Text style={styles.settingsRow}>
              <Text style={styles.settingsKey}>Public key{'\n'}</Text>
              <Text style={styles.settingsVal}>{identity?.publicKey ?? '—'}</Text>
            </Text>
            <Text style={[styles.settingsRow, { marginTop: Spacing.sm }]}>
              <Text style={styles.settingsKey}>Device ID{'\n'}</Text>
              <Text style={styles.settingsVal}>{identity?.deviceId ?? '—'}</Text>
            </Text>
            <Text style={[styles.settingsRow, { marginTop: Spacing.sm }]}>
              <Text style={styles.settingsKey}>Created{'\n'}</Text>
              <Text style={styles.settingsVal}>{identity?.createdAt ? new Date(identity.createdAt).toLocaleDateString() : '—'}</Text>
            </Text>
          </View>
          <Text style={styles.settingsNote}>
            Your private key is stored in your device's secure enclave. It never leaves your device
            unless you explicitly set up recovery.
          </Text>

          <Text style={styles.settingsSectionTitle}>Community</Text>
          {community ? (
            <>
              <View style={styles.settingsCard}>
                <Text style={styles.settingsRow}>
                  <Text style={styles.settingsKey}>Name{'\n'}</Text>
                  <Text style={styles.settingsVal}>{community.name}</Text>
                </Text>
                <Text style={[styles.settingsRow, { marginTop: Spacing.sm }]}>
                  <Text style={styles.settingsKey}>Community ID{'\n'}</Text>
                  <Text style={styles.settingsVal}>{community.id}</Text>
                </Text>
                <Text style={[styles.settingsRow, { marginTop: Spacing.sm }]}>
                  <Text style={styles.settingsKey}>Role{'\n'}</Text>
                  <Text style={styles.settingsVal}>
                    {identity?.publicKey === community.planterPublicKey ? 'Organizer' : 'Member'}
                  </Text>
                </Text>
              </View>
              <Pressable style={styles.settingsAction} onPress={handleShareInvite}>
                <Text style={styles.settingsActionText}>Share invite code</Text>
                <Text style={styles.settingsActionSub}>
                  Send this to someone who wants to join your community.
                  They'll enter it on the Join screen.
                </Text>
              </Pressable>
              <Pressable
                style={styles.settingsAction}
                onPress={() => (navigation.getParent() ?? navigation).navigate('ReviewQueue' as never)}
              >
                <Text style={styles.settingsActionText}>Review queue</Text>
                <Text style={styles.settingsActionSub}>
                  Flagged posts and moderation signals for your community.
                </Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.settingsNote}>No community yet.</Text>
          )}

          <Text style={styles.settingsSectionTitle}>Data</Text>
          <Pressable style={styles.settingsAction} onPress={handleExport}>
            <Text style={styles.settingsActionText}>Export all my data</Text>
            <Text style={styles.settingsActionSub}>
              Downloads your identity, posts, and exchanges as JSON.
              You can import this into another Root System instance.
            </Text>
          </Pressable>

          <Text style={styles.settingsSectionTitle}>Blocked Neighbors</Text>
          {blockedHandles.length === 0 ? (
            <Text style={styles.settingsNote}>
              No one blocked. Block a neighbor from their post in Browse.
            </Text>
          ) : (
            <View style={styles.settingsCard}>
              {blockedHandles.map(handle => (
                <View key={handle} style={styles.blockedRow}>
                  <Text style={styles.blockedHandle}>{handle}</Text>
                  <Pressable
                    style={styles.unblockBtn}
                    onPress={() => handleUnblock(handle)}
                    accessibilityRole="button"
                    accessibilityLabel={`Unblock ${handle}`}
                  >
                    <Text style={styles.unblockBtnText}>Unblock</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.settingsSectionTitle}>Sample Data</Text>
          {seeded ? (
            <View style={[styles.settingsCard, { opacity: 0.65 }]}>
              <Text style={styles.settingsActionText}>Sample community loaded</Text>
              <Text style={styles.settingsActionSub}>
                Ixidor and Maren are in Khelavastars keep with posts, exchanges, knowledge entries, and a coalition.
              </Text>
            </View>
          ) : (
            <Pressable
              style={[styles.settingsAction, seedLoading && { opacity: 0.6 }]}
              onPress={handleSeed}
              disabled={seedLoading}
            >
              {seedLoading && (
                <ActivityIndicator color={Colors.primary} style={{ marginBottom: 6 }} />
              )}
              <Text style={styles.settingsActionText}>Load sample community</Text>
              <Text style={styles.settingsActionSub}>
                Adds two fictional neighbors — Ixidor and Maren — with posts, exchanges,
                knowledge entries, and a coalition. Shows how a lived-in community looks.
              </Text>
            </Pressable>
          )}

          <Text style={styles.settingsSectionTitle}>Crisis Resources</Text>
          <View style={styles.settingsCard}>
            <Text style={styles.crisisNote}>
              Always available — no sign-in required.
            </Text>
            {[
              { label: '988 Suicide & Crisis Lifeline', value: '988', uri: 'tel:988' },
              { label: 'Crisis Text Line', value: 'Text HOME to 741741', uri: 'sms:741741' },
              { label: 'Domestic Violence Hotline', value: '1-800-799-7233', uri: 'tel:18007997233' },
              { label: '211 Local Services', value: '211', uri: 'tel:211' },
              { label: 'thehotline.org', value: 'thehotline.org', uri: 'https://www.thehotline.org' },
            ].map(r => (
              <Pressable
                key={r.label}
                style={styles.crisisRow}
                onPress={() => void Linking.openURL(r.uri)}
                accessibilityRole="link"
                accessibilityLabel={`${r.label}: ${r.value}`}
              >
                <Text style={styles.crisisLabel}>{r.label}</Text>
                <Text style={styles.crisisValue}>{r.value}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.settingsSectionTitle}>Danger Zone</Text>
          <Pressable style={[styles.settingsAction, styles.dangerAction]} onPress={handleDelete}>
            <Text style={styles.dangerActionText}>Delete everything</Text>
            <Text style={styles.settingsActionSub}>
              Permanently wipes all local data. Cannot be undone.
              Your keypair recovery (if set up) can restore your account, not your data.
            </Text>
          </Pressable>

          <View style={styles.settingsFooter}>
            <Text style={styles.settingsFooterText}>
              Root System v1{'\n'}
              All data lives on your device.{'\n'}
              Nothing is sold. Nothing is collected without your knowledge.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── STYLES ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },

  // Header
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  handle: {
    fontFamily: Typography.serifBold,
    fontWeight: 'bold',
    fontSize: Typography.xl,
    color: Colors.text,
  },
  headerBio: {
    fontFamily: Typography.bodyItalic,
    fontStyle: 'italic',
    fontSize: Typography.sm,
    color: Colors.dim,
    marginTop: 2,
    lineHeight: 20,
  },
  headerStats: {
    marginTop: Spacing.sm,
  },
  headerSince: {
    fontFamily: Typography.bodyItalic,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.earth,
    marginBottom: Spacing.xs,
  },
  headerStatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  headerStatChip: {
    fontFamily: Typography.body,
    fontSize: Typography.xs,
    color: Colors.dim,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },

  // Community pulse card
  pulseCard: {
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.borderMid,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  pulseTitle: {
    fontFamily: Typography.bodySemi,
    fontWeight: '600',
    fontSize: Typography.xs,
    color: Colors.earth,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: Spacing.sm,
  },
  pulseRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  pulseStat: {
    flex: 1,
    alignItems: 'center',
  },
  pulseNumber: {
    fontFamily: Typography.serifBold,
    fontWeight: 'bold',
    fontSize: Typography.xl,
    color: Colors.primary,
  },
  pulseLabel: {
    fontFamily: Typography.bodyItalic,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.dim,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 2,
  },

  // Tabs
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
  tabText: { fontFamily: Typography.body, fontSize: Typography.sm, color: Colors.dim },
  tabTextActive: { color: Colors.primary, fontWeight: '600' },

  // Post cards
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    ...CardShadow,
  },
  cardWithdrawn: { opacity: 0.5 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.xs },
  typeDot: { width: 8, height: 8, borderRadius: 4 },
  cardType: { fontFamily: Typography.bodySemi, fontWeight: '600', fontSize: Typography.xs, color: Colors.dim, flex: 1 },
  cardExpiry: { fontFamily: Typography.bodyItalic, fontStyle: 'italic', fontSize: Typography.xs, color: Colors.dim },
  cardTitle: { fontFamily: Typography.serifBold, fontWeight: 'bold', fontSize: Typography.md, color: Colors.text, marginBottom: 4 },
  cardBody: { fontFamily: Typography.body, fontSize: Typography.sm, color: Colors.textMuted, lineHeight: 20, marginBottom: Spacing.sm },
  cardDate: { fontFamily: Typography.bodyItalic, fontStyle: 'italic', fontSize: Typography.xs, color: Colors.dim },
  flagNote: { fontFamily: Typography.bodyItalic, fontStyle: 'italic', fontSize: Typography.xs, color: Colors.error, marginBottom: Spacing.xs },
  cardActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  renewBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  renewBtnText: { fontFamily: Typography.bodySemi, fontWeight: '600', fontSize: Typography.xs, color: Colors.primary },
  withdrawBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  withdrawBtnText: { fontFamily: Typography.bodySemi, fontWeight: '600', fontSize: Typography.xs, color: Colors.dim },

  // Empty / notices
  emptyBox: { alignItems: 'center', paddingTop: Spacing.xxl, gap: Spacing.md },
  emptyIcon: { fontSize: 32 },
  emptyText: {
    fontFamily: Typography.bodyItalic,
    fontStyle: 'italic',
    fontSize: Typography.base,
    color: Colors.dim,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 24,
  },
  expiryNotice: {
    backgroundColor: 'rgba(138,37,53,0.1)',
    borderWidth: 1,
    borderColor: Colors.wine,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
  },
  expiryNoticeText: { fontFamily: Typography.bodySemi, fontWeight: '600', fontSize: Typography.sm, color: Colors.error },
  sectionDivider: {
    fontFamily: Typography.bodyItalic,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.dim,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.sm,
  },

  // Profile
  profileNote: {
    fontFamily: Typography.bodyItalic,
    fontStyle: 'italic',
    fontSize: Typography.sm,
    color: Colors.textMuted,
    lineHeight: 22,
    marginBottom: Spacing.sm,
  },
  fieldLabel: {
    fontFamily: Typography.bodySemi,
    fontWeight: '600',
    fontSize: Typography.sm,
    color: Colors.text,
    marginBottom: 6,
    marginTop: Spacing.sm,
  },
  fieldHint: {
    fontFamily: Typography.bodyItalic,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.dim,
  },
  input: {
    backgroundColor: Colors.surface,
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
  charCount: { fontFamily: Typography.bodyItalic, fontStyle: 'italic', fontSize: Typography.xs, color: Colors.dim, textAlign: 'right', marginTop: 2 },
  saveBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: Radius.sm,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  saveBtnDisabled: { backgroundColor: Colors.primaryLight },
  saveBtnText: {
    fontFamily: Typography.serifBold,
    fontWeight: 'bold',
    fontSize: Typography.md,
    color: Colors.textOnDark,
    letterSpacing: 0.5,
  },

  // Key request banner (planter)
  keyReqBanner: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.borderMid,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  keyReqTitle: {
    fontFamily: Typography.serifBold,
    fontWeight: 'bold',
    fontSize: Typography.md,
    color: Colors.primary,
    marginBottom: Spacing.sm,
  },
  keyReqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  keyReqKey: {
    flex: 1,
    fontFamily: Typography.body,
    fontSize: Typography.xs,
    color: Colors.dim,
  },
  approveBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.sm,
  },
  approveBtnText: {
    fontFamily: Typography.bodySemi,
    fontWeight: '600',
    fontSize: Typography.xs,
    color: Colors.textOnDark,
  },

  // Contact request banner (author side)
  contactReqBanner: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.borderMid,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  contactReqTitle: {
    fontFamily: Typography.serifBold,
    fontWeight: 'bold',
    fontSize: Typography.sm,
    color: Colors.primary,
    marginBottom: Spacing.sm,
  },
  contactReqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  contactReqInfo: { flex: 1 },
  contactReqHandle: {
    fontFamily: Typography.body,
    fontWeight: '600',
    fontSize: Typography.xs,
    color: Colors.text,
  },
  contactReqPost: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.textMuted,
  },
  contactReqActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
    flexShrink: 0,
  },
  contactDeclineBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.borderMid,
  },
  contactDeclineBtnText: {
    fontFamily: Typography.body,
    fontWeight: '600',
    fontSize: Typography.xs,
    color: Colors.textMuted,
  },

  // Settings
  settingsSectionTitle: {
    fontFamily: Typography.serifBold,
    fontWeight: 'bold',
    fontSize: Typography.md,
    color: Colors.primary,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  settingsCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    padding: Spacing.md,
  },
  settingsRow: {
    fontFamily: Typography.body,
    fontSize: Typography.xs,
    color: Colors.text,
    lineHeight: 18,
  },
  settingsKey: { fontFamily: Typography.bodySemi, fontWeight: '600', color: Colors.dim, fontSize: Typography.xs },
  settingsVal: { fontFamily: Typography.body, color: Colors.textMuted, fontSize: 10 },
  settingsNote: {
    fontFamily: Typography.bodyItalic,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.dim,
    lineHeight: 18,
    marginTop: Spacing.xs,
  },
  settingsAction: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.xs,
  },
  settingsActionText: {
    fontFamily: Typography.serifBold,
    fontWeight: 'bold',
    fontSize: Typography.md,
    color: Colors.text,
    marginBottom: 4,
  },
  settingsActionSub: {
    fontFamily: Typography.bodyItalic,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.dim,
    lineHeight: 18,
  },
  crisisNote: {
    fontFamily: Typography.bodyItalic,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.dim,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  crisisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  crisisLabel: {
    fontFamily: Typography.body,
    fontSize: Typography.xs,
    color: Colors.textMuted,
    flex: 1,
    lineHeight: 20,
  },
  crisisValue: {
    fontFamily: Typography.bodySemi,
    fontWeight: '600',
    fontSize: Typography.xs,
    color: Colors.secondary,
    textDecorationLine: 'underline',
  },
  dangerAction: { borderColor: 'rgba(138,37,53,0.4)', backgroundColor: 'rgba(138,37,53,0.06)' },
  dangerActionText: {
    fontFamily: Typography.serifBold,
    fontSize: Typography.md,
    color: Colors.wine,
    marginBottom: 4,
  },
  settingsFooter: { marginTop: Spacing.xl, alignItems: 'center' },
  settingsFooterText: {
    fontFamily: Typography.bodyItalic,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.dim,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Blocked neighbors
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  blockedHandle: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.text,
    flex: 1,
  },
  unblockBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.borderMid,
    borderRadius: Radius.sm,
  },
  unblockBtnText: {
    fontFamily: Typography.body,
    fontWeight: '600',
    fontSize: Typography.xs,
    color: Colors.textMuted,
  },
} as const);
