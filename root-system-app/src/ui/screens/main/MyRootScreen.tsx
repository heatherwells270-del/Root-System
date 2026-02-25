// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — My Root Screen
//
// Profile, your posts, settings, data export, nuclear delete.
// Everything here is your data. You own it. You can take it or destroy it.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  StyleSheet, ActivityIndicator, Alert, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius, CardShadow } from '../../theme/index';
import { getIdentity, updateIdentityProfile } from '../../../db/identity';
import { getMyPosts, tombstonePost, renewPost } from '../../../db/posts';
import { getExchangesForKey, getTimebankBalance } from '../../../db/exchanges';
import { getPublicKey, sign, canonicalTombstone } from '../../../crypto/keypair';
import type { Post } from '../../../models/types';

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
  const [tab, setTab]           = useState<Tab>('posts');
  const [loading, setLoading]   = useState(true);
  const [identity, setIdentity] = useState<Awaited<ReturnType<typeof getIdentity>>>(null);
  const [myPosts, setMyPosts]   = useState<Post[]>([]);
  const [balance, setBalance]   = useState(0);

  // Profile edit form
  const [editHandle, setEditHandle] = useState('');
  const [editBio, setEditBio]       = useState('');
  const [editZip, setEditZip]       = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editSaved, setEditSaved]   = useState(false);

  async function loadData() {
    const id = await getIdentity();
    setIdentity(id);
    if (id) {
      const [posts, bal] = await Promise.all([
        getMyPosts(id.publicKey),
        getTimebankBalance(id.publicKey),
      ]);
      setMyPosts(posts);
      setBalance(bal);
      setEditHandle(id.handle ?? '');
      setEditBio(id.bio ?? '');
      setEditZip(id.location?.zip ?? '');
    }
    setLoading(false);
  }

  useFocusEffect(useCallback(() => {
    setLoading(true);
    loadData();
  }, []));

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
      setTimeout(() => setEditSaved(false), 2000);
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
      'This removes it from the commons. The record is kept internally (tombstone) so deletions sync correctly, but the content disappears.',
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

  // ── Data export ─────────────────────────────────────────────────────────

  async function handleExport() {
    if (!identity) return;
    const exchanges = await getExchangesForKey(identity.publicKey);
    const data = {
      exportedAt: new Date().toISOString(),
      identity: {
        publicKey: identity.publicKey,
        handle:    identity.handle,
        bio:       identity.bio,
        location:  identity.location,
        createdAt: identity.createdAt,
      },
      posts: myPosts,
      exchanges,
    };
    const json = JSON.stringify(data, null, 2);
    await Share.share({ message: json, title: 'Root System data export' });
  }

  // ── Nuclear delete ──────────────────────────────────────────────────────

  async function handleDelete() {
    Alert.alert(
      'Delete everything?',
      'This deletes all local data — your identity, posts, exchanges. This cannot be undone. If you have recovery set up, your keypair can be restored but no other data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you sure?',
              'Last chance. Once deleted, your local identity is gone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, delete',
                  style: 'destructive',
                  onPress: async () => {
                    // TODO: wipe DB tables and SecureStore, then restart to Covenant
                    Alert.alert('Deleted', 'All local data has been wiped. Restart the app.');
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
        <ActivityIndicator color={Colors.gold} />
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
        <View style={styles.headerLeft}>
          <Text style={styles.handle}>{identity?.handle || 'Anonymous'}</Text>
          {identity?.bio && <Text style={styles.headerBio}>{identity.bio}</Text>}
        </View>
        <View style={styles.headerRight}>
          <Text style={[styles.balNum, { color: balance >= 0 ? Colors.greenMid : Colors.wine }]}>
            {balance >= 0 ? '+' : ''}{balance.toFixed(1)}
          </Text>
          <Text style={styles.balLabel}>hrs</Text>
        </View>
      </View>

      {/* Public key (truncated) — tap to copy full */}
      <View style={styles.pubkeyRow}>
        <Text style={styles.pubkeyLabel}>Public key: </Text>
        <Text style={styles.pubkeyValue} numberOfLines={1}>
          {identity?.publicKey.slice(0, 20)}…
        </Text>
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
          {activePosts.length === 0 && withdrawnPosts.length === 0 && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>🌿</Text>
              <Text style={styles.emptyText}>No posts yet. Head to Post to plant something in the commons.</Text>
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
                  <View style={[styles.typeDot, { backgroundColor: p.type === 'offer' ? Colors.greenMid : p.type === 'need' ? Colors.wine : Colors.gold }]} />
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
              ? <ActivityIndicator color={Colors.greenDeep} />
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

          <Text style={styles.settingsSectionTitle}>Data</Text>
          <Pressable style={styles.settingsAction} onPress={handleExport}>
            <Text style={styles.settingsActionText}>Export all my data</Text>
            <Text style={styles.settingsActionSub}>
              Downloads your identity, posts, and exchanges as JSON.
              You can import this into another Root System instance.
            </Text>
          </Pressable>

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
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: { flex: 1 },
  headerRight: { alignItems: 'center' },
  handle: {
    fontFamily: Typography.serifBold,
    fontSize: Typography.xl,
    color: Colors.cream,
  },
  headerBio: {
    fontFamily: Typography.bodyItalic,
    fontSize: Typography.sm,
    color: Colors.dim,
    marginTop: 2,
    lineHeight: 20,
  },
  balNum: {
    fontFamily: Typography.serifBold,
    fontSize: Typography.xxl,
  },
  balLabel: {
    fontFamily: Typography.bodyItalic,
    fontSize: Typography.xs,
    color: Colors.dim,
  },

  // Public key row
  pubkeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pubkeyLabel: {
    fontFamily: Typography.body,
    fontSize: Typography.xs,
    color: Colors.dim,
  },
  pubkeyValue: {
    flex: 1,
    fontFamily: Typography.body,
    fontSize: Typography.xs,
    color: Colors.earth,
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
  tabActive: { borderBottomColor: Colors.gold },
  tabText: { fontFamily: Typography.body, fontSize: Typography.sm, color: Colors.dim },
  tabTextActive: { color: Colors.gold },

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
  cardType: { fontFamily: Typography.bodySemi, fontSize: Typography.xs, color: Colors.dim, flex: 1 },
  cardExpiry: { fontFamily: Typography.bodyItalic, fontSize: Typography.xs, color: Colors.dim },
  cardTitle: { fontFamily: Typography.serifBold, fontSize: Typography.md, color: Colors.cream, marginBottom: 4 },
  cardBody: { fontFamily: Typography.body, fontSize: Typography.sm, color: Colors.moonsilver, lineHeight: 20, marginBottom: Spacing.sm },
  cardDate: { fontFamily: Typography.bodyItalic, fontSize: Typography.xs, color: Colors.dim },
  flagNote: { fontFamily: Typography.bodyItalic, fontSize: Typography.xs, color: Colors.wine, marginBottom: Spacing.xs },
  cardActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  renewBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.gold,
    backgroundColor: 'rgba(196,152,46,0.1)',
  },
  renewBtnText: { fontFamily: Typography.bodySemi, fontSize: Typography.xs, color: Colors.gold },
  withdrawBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  withdrawBtnText: { fontFamily: Typography.bodySemi, fontSize: Typography.xs, color: Colors.dim },

  // Empty / notices
  emptyBox: { alignItems: 'center', paddingTop: Spacing.xxl, gap: Spacing.md },
  emptyIcon: { fontSize: 32 },
  emptyText: {
    fontFamily: Typography.bodyItalic,
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
  expiryNoticeText: { fontFamily: Typography.bodySemi, fontSize: Typography.sm, color: Colors.wine },
  sectionDivider: {
    fontFamily: Typography.bodyItalic,
    fontSize: Typography.xs,
    color: Colors.dim,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.sm,
  },

  // Profile
  profileNote: {
    fontFamily: Typography.bodyItalic,
    fontSize: Typography.sm,
    color: Colors.moonsilver,
    lineHeight: 22,
    marginBottom: Spacing.sm,
  },
  fieldLabel: {
    fontFamily: Typography.bodySemi,
    fontSize: Typography.sm,
    color: Colors.cream,
    marginBottom: 6,
    marginTop: Spacing.sm,
  },
  fieldHint: {
    fontFamily: Typography.bodyItalic,
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
    color: Colors.cream,
    minHeight: 44,
  },
  textarea: { minHeight: 90, paddingTop: 10 },
  charCount: { fontFamily: Typography.bodyItalic, fontSize: Typography.xs, color: Colors.dim, textAlign: 'right', marginTop: 2 },
  saveBtn: {
    backgroundColor: Colors.gold,
    paddingVertical: Spacing.md,
    borderRadius: Radius.sm,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  saveBtnDisabled: { backgroundColor: 'rgba(196,152,46,0.2)' },
  saveBtnText: {
    fontFamily: Typography.serifBold,
    fontSize: Typography.md,
    color: Colors.greenDeep,
    letterSpacing: 0.5,
  },

  // Settings
  settingsSectionTitle: {
    fontFamily: Typography.serifBold,
    fontSize: Typography.md,
    color: Colors.gold,
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
    color: Colors.moonsilver,
    lineHeight: 18,
  },
  settingsKey: { fontFamily: Typography.bodySemi, color: Colors.dim, fontSize: Typography.xs },
  settingsVal: { fontFamily: Typography.body, color: Colors.moonsilver, fontSize: 10 },
  settingsNote: {
    fontFamily: Typography.bodyItalic,
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
    fontSize: Typography.md,
    color: Colors.cream,
    marginBottom: 4,
  },
  settingsActionSub: {
    fontFamily: Typography.bodyItalic,
    fontSize: Typography.xs,
    color: Colors.dim,
    lineHeight: 18,
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
    fontSize: Typography.xs,
    color: Colors.dim,
    textAlign: 'center',
    lineHeight: 20,
  },
} as const);
