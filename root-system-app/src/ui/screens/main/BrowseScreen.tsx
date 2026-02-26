// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Browse Screen
//
// The main feed. Filter collapse, local label, post cards.
// All the logic from mutual-aid-v3-layer4.jsx ported to React Native.
// ═══════════════════════════════════════════════════════════════════════════

import React, { memo, useCallback, useEffect, useState, useMemo } from 'react';
import {
  View, Text, TextInput, Pressable, Modal, Alert,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { Colors, Typography, Spacing, Radius, CardShadow } from '../../theme/index';
import { getActivePosts } from '../../../db/posts';
import { getIdentity } from '../../../db/identity';
import { getPublicTrustScore } from '../../../db/trust';
import { getRevealMap } from '../../../db/contact_info';
import { getBlockedHandles, blockHandle } from '../../../db/blocks';
import { sendContactRequest, onContactResponse, onContactDeclined } from '../../../sync/index';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { useWatches } from '../../hooks/useWatches';
import * as Crypto from 'expo-crypto';
import type { Post, CategoryId } from '../../../models/types';

const CATEGORIES = [
  { id: 'skills',    label: 'Skills',     emoji: '🌿' },
  { id: 'goods',     label: 'Goods',      emoji: '📦' },
  { id: 'care',      label: 'Care',       emoji: '🤲' },
  { id: 'food',      label: 'Food',       emoji: '🌱' },
  { id: 'tech',      label: 'Tech',       emoji: '⚙️' },
  { id: 'housing',   label: 'Housing',    emoji: '🏡' },
  { id: 'transport', label: 'Transport',  emoji: '🚲' },
  { id: 'knowledge', label: 'Knowledge',  emoji: '📜' },
  { id: 'grief',     label: 'Grief',      emoji: '🕯️' },
  { id: 'labor',     label: 'Labor',      emoji: '✊' },
] as const;

const TYPE_BADGE_COLORS: Record<string, string> = {
  offer: Colors.primaryMid,
  need:  Colors.error,
  free:  Colors.primary,
};

// ─── WATCH MATCH HELPER ───────────────────────────────────────────────────────

function watchesMatch(post: Post, watches: string[]): boolean {
  if (watches.length === 0) return false;
  const haystack = `${post.title} ${post.body} ${post.tags.join(' ')}`.toLowerCase();
  return watches.some(w => haystack.includes(w));
}

// ─── POST CARD ────────────────────────────────────────────────────────────────
// Memoised so FlatList scrolling doesn't re-render unchanged cards when
// filter state or other parent state changes.

type ContactState = 'idle' | 'pending' | 'declined' | 'revealed';

const PostCard = memo(function PostCard({
  item, trust, watchMatch, isOwn, contactState, onContactPress, onBlock,
}: {
  item: Post;
  trust: number | undefined;
  watchMatch: boolean;
  isOwn: boolean;
  contactState: ContactState;
  onContactPress: () => void;
  onBlock: () => void;
}) {
  const cat = CATEGORIES.find(c => c.id === item.category);
  const badgeColor = TYPE_BADGE_COLORS[item.type] ?? Colors.dim;
  const daysLeft = Math.ceil((new Date(item.expiresAt).getTime() - Date.now()) / 86400000);
  const expiringSoon = daysLeft >= 0 && daysLeft <= 3;
  return (
    <View style={[styles.card, watchMatch && styles.cardWatched]}>
      <View style={styles.cardHeader}>
        <View style={[styles.typeBadge, { backgroundColor: badgeColor + '33', borderColor: badgeColor }]}>
          <Text style={[styles.typeBadgeText, { color: badgeColor }]}>
            {item.type === 'offer' ? 'Offering' : item.type === 'need' ? 'Seeking' : 'Free'}
          </Text>
        </View>
        {cat && <Text style={styles.catEmoji}>{cat.emoji}</Text>}
      </View>

      <Text style={styles.postTitle}>{item.title}</Text>
      <Text style={styles.postBody} numberOfLines={3}>{item.body}</Text>

      {item.tags.length > 0 && (
        <View style={styles.tags}>
          {item.tags.slice(0, 4).map(tag => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.cardFooter}>
        <Text style={styles.handle}>{item.handle || 'A neighbor'}</Text>
        {trust !== undefined && (
          <Text style={styles.trustScore}>★ {trust.toFixed(1)}</Text>
        )}
        {expiringSoon ? (
          <Text style={styles.expiryNudge}>
            {daysLeft === 0 ? 'expires today' : `${daysLeft}d left`}
          </Text>
        ) : item.zone !== 'Any / Network-wide' ? (
          <Text style={styles.zone}>{item.zone}</Text>
        ) : null}
      </View>

      {!isOwn && (
        <View style={styles.contactRow}>
          <View style={{ flex: 1 }}>
            {contactState === 'revealed' ? (
              <Pressable style={[styles.contactBtn, styles.contactBtnRevealed]} onPress={onContactPress}>
                <Text style={styles.contactBtnRevealedText}>✓ Show contact</Text>
              </Pressable>
            ) : contactState === 'pending' ? (
              <Text style={styles.contactStatus}>Request sent…</Text>
            ) : contactState === 'declined' ? (
              <Text style={[styles.contactStatus, styles.contactDeclined]}>Request declined</Text>
            ) : (
              <Pressable style={styles.contactBtn} onPress={onContactPress}>
                <Text style={styles.contactBtnText}>Request contact</Text>
              </Pressable>
            )}
          </View>
          <Pressable onPress={onBlock} hitSlop={8}>
            <Text style={styles.blockLink}>Block</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
});

// ─── SCREEN ───────────────────────────────────────────────────────────────────

export default function BrowseScreen() {
  const [posts,        setPosts]        = useState<Post[]>([]);
  const [trustScores,  setTrustScores]  = useState<Record<string, number>>({});
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState<string | null>(null);
  const [search,       setSearch]       = useState('');
  const [typeFilter,   setTypeFilter]   = useState<'all' | Post['type']>('all');
  const [catFilter,    setCatFilter]    = useState<'all' | CategoryId>('all');
  const [filtersOpen,  setFiltersOpen]  = useState(false);
  const [watchesOpen,  setWatchesOpen]  = useState(false);
  const [watchInput,   setWatchInput]   = useState('');
  const [communityId,      setCommunityId]      = useState<string | null>(null);
  const [localCity,        setLocalCity]        = useState<string | null>(null);
  const [refreshing,       setRefreshing]       = useState(false);
  const [myPubKey,         setMyPubKey]         = useState<string | null>(null);
  const [myHandle,         setMyHandle]         = useState<string>('');
  const [revealMap,        setRevealMap]        = useState<Record<string, string>>({});
  const [pendingRequests,  setPendingRequests]  = useState<Record<string, 'pending' | 'declined'>>({});
  const [revealModal,      setRevealModal]      = useState<{ postId: string; contact: string } | null>(null);
  const navigation = useNavigation();
  const syncStatus = useSyncStatus();
  const { watches, addWatch, removeWatch } = useWatches();

  const loadPosts = useCallback(async () => {
    try {
      const identity = await getIdentity();
      const cid = identity?.communityIds[0] ?? null;
      setCommunityId(cid);
      setLocalCity(identity?.location?.city ?? identity?.location?.zip ?? null);
      if (identity?.publicKey) setMyPubKey(identity.publicKey);
      if (identity?.handle) setMyHandle(identity.handle);
      if (cid) {
        const [loaded, blocked] = await Promise.all([
          getActivePosts(cid),
          getBlockedHandles(),
        ]);
        const visible = blocked.length > 0
          ? loaded.filter(p => !blocked.includes(p.handle ?? ''))
          : loaded;
        setPosts(visible);

        // Batch-fetch trust scores for all unique authors
        const uniqueKeys = [...new Set(visible.map(p => p.authorPublicKey))];
        const scores = await Promise.all(uniqueKeys.map(k => getPublicTrustScore(k)));
        const scoreMap: Record<string, number> = {};
        uniqueKeys.forEach((k, i) => {
          if (scores[i] !== null) scoreMap[k] = scores[i]!.publicScore;
        });
        setTrustScores(scoreMap);

        // Load any contact reveals already approved for these posts
        const reveals = await getRevealMap(visible.map(p => p.id));
        setRevealMap(reveals);
      }
      setLoadError(null);
    } catch (e) {
      console.error('[BrowseScreen] load failed', e);
      setLoadError('Could not load posts. Pull down to retry.');
    }
  }, []);

  useEffect(() => {
    void loadPosts().finally(() => setLoading(false));
  }, [loadPosts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPosts();
    setRefreshing(false);
  }, [loadPosts]);

  // Subscribe to contact relay events — runs once on mount
  useEffect(() => {
    const unsubResponse = onContactResponse((postId) => {
      // Pull the newly decrypted reveal from DB and update map
      getRevealMap([postId]).then(r => {
        setRevealMap(prev => ({ ...prev, ...r }));
        setPendingRequests(prev => {
          const next = { ...prev };
          delete next[postId];
          return next;
        });
      }).catch(() => {});
    });
    const unsubDeclined = onContactDeclined((postId) => {
      setPendingRequests(prev => ({ ...prev, [postId]: 'declined' }));
    });
    return () => { unsubResponse(); unsubDeclined(); };
  }, []);

  const handleContactPress = useCallback((post: Post) => {
    const postId = post.id;
    // Already revealed — open modal
    if (revealMap[postId]) {
      setRevealModal({ postId, contact: revealMap[postId] });
      return;
    }
    // Already in-flight — no-op
    if (pendingRequests[postId]) return;
    // Must be connected — sendContactRequest is a no-op when offline
    if (!syncStatus.connected) {
      Alert.alert('Offline', 'Connect to your community to request contact info.');
      return;
    }
    // Send request
    const requestId = Crypto.randomUUID();
    setPendingRequests(prev => ({ ...prev, [postId]: 'pending' }));
    sendContactRequest(postId, post.title, post.authorPublicKey, post.communityId, requestId, myHandle);
  }, [revealMap, pendingRequests, myHandle, syncStatus.connected]);

  const handleBlock = useCallback((post: Post) => {
    const handle = post.handle;
    if (!handle) { Alert.alert('Cannot block', 'This post has no handle.'); return; }
    Alert.alert(
      `Block ${handle}?`,
      'Their posts will be hidden from your feed. You can unblock them from My Root → Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => { await blockHandle(handle); void loadPosts(); },
        },
      ]
    );
  }, [loadPosts]);

  const visible = useMemo(() => {
    return posts.filter(p => {
      if (typeFilter !== 'all' && p.type !== typeFilter) return false;
      if (catFilter  !== 'all' && p.category !== catFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          p.title.toLowerCase().includes(s) ||
          p.body.toLowerCase().includes(s)  ||
          p.tags.some(t => t.includes(s))
        );
      }
      return true;
    });
  }, [posts, typeFilter, catFilter, search]);

  const activeFilterCount = [
    typeFilter !== 'all',
    catFilter !== 'all',
  ].filter(Boolean).length;

  const [offerCount, needCount, freeCount] = useMemo(() => [
    posts.filter(p => p.type === 'offer').length,
    posts.filter(p => p.type === 'need').length,
    posts.filter(p => p.type === 'free').length,
  ], [posts]);

  const renderItem = useCallback(({ item }: { item: Post }) => {
    const contactState: ContactState = revealMap[item.id]
      ? 'revealed'
      : (pendingRequests[item.id] ?? 'idle');
    return (
      <PostCard
        item={item}
        trust={trustScores[item.authorPublicKey]}
        watchMatch={watchesMatch(item, watches)}
        isOwn={item.authorPublicKey === myPubKey}
        contactState={contactState}
        onContactPress={() => handleContactPress(item)}
        onBlock={() => handleBlock(item)}
      />
    );
  }, [trustScores, watches, myPubKey, revealMap, pendingRequests, handleContactPress, handleBlock]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Section label */}
      <View style={styles.topBar}>
        <Text style={styles.sectionLabel}>
          Active Posts — {offerCount} Offering · {needCount} Seeking · {freeCount} Free
        </Text>
        {localCity && (
          <Text style={styles.localLabel}>showing posts near {localCity}</Text>
        )}
      </View>

      {/* Load error */}
      {loadError && <Text style={styles.loadError}>{loadError}</Text>}

      {/* Sync status — only shown when offline or posts are queued */}
      {(!syncStatus.connected || syncStatus.queued > 0) && (
        <Text style={styles.offlinePill}>
          {syncStatus.queued > 0
            ? `● Offline — ${syncStatus.queued} post${syncStatus.queued === 1 ? '' : 's'} queued`
            : '● Offline'}
        </Text>
      )}

      {/* Filter row — always visible: toggle + search + watch */}
      <View style={styles.filterRow}>
        <Pressable
          style={[styles.chip, activeFilterCount > 0 && styles.chipActive]}
          onPress={() => setFiltersOpen(v => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: filtersOpen }}
        >
          <Text style={[styles.chipText, activeFilterCount > 0 && styles.chipTextActive]}>
            {filtersOpen
              ? 'Filter ▴'
              : activeFilterCount > 0
                ? `Filter ▾ (${activeFilterCount})`
                : 'Filter ▾'}
          </Text>
        </Pressable>

        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="search…"
          placeholderTextColor={Colors.dim}
          clearButtonMode="while-editing"
          autoCorrect={false}
        />

        <Pressable
          style={[styles.chip, watches.length > 0 && styles.chipActive]}
          onPress={() => setWatchesOpen(v => !v)}
          accessibilityRole="button"
        >
          <Text style={[styles.chipText, watches.length > 0 && styles.chipTextActive]}>
            {watches.length > 0 ? `✦ ${watches.length}` : '✦'}
          </Text>
        </Pressable>
      </View>

      {/* Watch panel */}
      {watchesOpen && (
        <View style={styles.filterPanel}>
          <Text style={styles.watchLabel}>
            Watched keywords — matching posts glow gold. Max {5}.
          </Text>
          <View style={styles.chipRow}>
            {watches.map(w => (
              <Pressable key={w} style={styles.watchChip} onPress={() => removeWatch(w)}>
                <Text style={styles.watchChipText}>{w} ✕</Text>
              </Pressable>
            ))}
          </View>
          {watches.length < 5 && (
            <View style={styles.watchInputRow}>
              <TextInput
                style={[styles.searchInput, { flex: 1 }]}
                value={watchInput}
                onChangeText={setWatchInput}
                placeholder="add a keyword…"
                placeholderTextColor={Colors.dim}
                autoCorrect={false}
                autoCapitalize="none"
                onSubmitEditing={() => { addWatch(watchInput); setWatchInput(''); }}
                returnKeyType="done"
              />
              <Pressable
                style={styles.watchAddBtn}
                onPress={() => { addWatch(watchInput); setWatchInput(''); }}
              >
                <Text style={styles.watchAddBtnText}>Add</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* Collapsible filters */}
      {filtersOpen && (
        <View style={styles.filterPanel}>
          {/* Type chips */}
          <View style={styles.chipRow}>
            {(['all', 'offer', 'need', 'free'] as const).map(t => (
              <Pressable
                key={t}
                style={[styles.chip, typeFilter === t && styles.chipActive]}
                onPress={() => setTypeFilter(typeFilter === t && t !== 'all' ? 'all' : t)}
              >
                <Text style={[styles.chipText, typeFilter === t && styles.chipTextActive]}>
                  {t === 'all' ? 'All' : t === 'offer' ? 'Offering' : t === 'need' ? 'Seeking' : 'Free'}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Category chips */}
          <View style={styles.chipRow}>
            {CATEGORIES.map(cat => (
              <Pressable
                key={cat.id}
                style={[styles.chip, catFilter === cat.id && styles.chipActive]}
                onPress={() => setCatFilter(catFilter === cat.id ? 'all' : cat.id as CategoryId)}
              >
                <Text style={[styles.chipText, catFilter === cat.id && styles.chipTextActive]}>
                  {cat.emoji} {cat.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Results count */}
      {visible.length > 0 && (
        <Text style={styles.resultsCount}>
          {visible.length} post{visible.length === 1 ? '' : 's'} visible
        </Text>
      )}

      {/* Post list */}
      {visible.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>🌿</Text>
          <Text style={styles.emptyText}>
            {communityId
              ? 'The neighborhood is quiet right now. Be the first to post something.'
              : 'Find or join a community to see what your neighbors are offering.'}
          </Text>
          {communityId && (
            <Pressable
              style={styles.emptyBtn}
              onPress={() => (navigation.getParent() ?? navigation).navigate('PostModal' as never)}
              accessibilityRole="button"
            >
              <Text style={styles.emptyBtnText}>Post something</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <FlashList
          data={visible}
          renderItem={renderItem}
          keyExtractor={(item: Post) => item.id}
          estimatedItemSize={160}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
        />
      )}

      {/* Contact reveal modal */}
      <Modal
        visible={revealModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRevealModal(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setRevealModal(null)}>
          <View style={styles.revealBox}>
            <Text style={styles.revealTitle}>Contact info</Text>
            <Text style={styles.revealContact}>{revealModal?.contact}</Text>
            <Text style={styles.revealHint}>
              Shared directly with you by the author. Keep it between you.
            </Text>
            <Pressable style={styles.revealCloseBtn} onPress={() => setRevealModal(null)}>
              <Text style={styles.revealCloseBtnText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  topBar: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.xs },
  sectionLabel: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  localLabel: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.textMuted,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.text,
    minHeight: 40,
  },
  filterPanel: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  chip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: 'transparent',
    minHeight: 34,
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  chipText: {
    fontFamily: Typography.body,
    fontSize: Typography.xs,
    color: Colors.textMuted,
  },
  chipTextActive: { color: Colors.primary },
  resultsCount: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.textMuted,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  loadError: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.error,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  offlinePill: {
    fontFamily: Typography.body,
    fontSize: Typography.xs,
    color: Colors.textMuted,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  watchLabel: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  watchChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
    minHeight: 34,
    justifyContent: 'center',
  },
  watchChipText: {
    fontFamily: Typography.body,
    fontSize: Typography.xs,
    color: Colors.primary,
  },
  watchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  watchAddBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
    minHeight: 40,
    justifyContent: 'center',
  },
  watchAddBtnText: {
    fontFamily: Typography.body,
    fontWeight: '600',
    fontSize: Typography.xs,
    color: Colors.primary,
  },
  listContent: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    ...CardShadow,
  },
  cardWatched: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm, gap: Spacing.sm },
  typeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  typeBadgeText: { fontFamily: Typography.body, fontWeight: '600', fontSize: Typography.xs },
  catEmoji: { fontSize: 14, marginLeft: 'auto' },
  postTitle: {
    fontFamily: Typography.serif,
    fontWeight: 'bold',
    fontSize: Typography.md,
    color: Colors.text,
    marginBottom: Spacing.xs,
    lineHeight: 26,
  },
  postBody: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.textMuted,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: Spacing.sm },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tagText: { fontFamily: Typography.body, fontStyle: 'italic', fontSize: Typography.xs, color: Colors.textMuted },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.xs },
  handle:      { fontFamily: Typography.body, fontStyle: 'italic', fontSize: Typography.xs, color: Colors.textMuted },
  trustScore:  { fontFamily: Typography.body, fontSize: Typography.xs, color: Colors.warning },
  zone:        { fontFamily: Typography.body, fontStyle: 'italic', fontSize: Typography.xs, color: Colors.textMuted },
  expiryNudge: { fontFamily: Typography.body, fontStyle: 'italic', fontSize: Typography.xs, color: Colors.error },
  emptyIcon: { fontSize: 32 },
  emptyText: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.base,
    color: Colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 24,
  },
  emptyBtn: {
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    marginTop: Spacing.xs,
  },
  emptyBtnText: {
    fontFamily: Typography.body,
    fontWeight: '600',
    fontSize: Typography.sm,
    color: Colors.primary,
  },

  // Contact button (on post cards)
  contactRow: {
    marginTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  blockLink: {
    fontFamily: Typography.body,
    fontSize: Typography.xs,
    color: Colors.dim,
    paddingLeft: Spacing.md,
  },
  contactBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.borderMid,
    backgroundColor: 'transparent',
  },
  contactBtnRevealed: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  contactBtnText: {
    fontFamily: Typography.body,
    fontSize: Typography.xs,
    color: Colors.textMuted,
  },
  contactBtnRevealedText: {
    fontFamily: Typography.body,
    fontWeight: '600',
    fontSize: Typography.xs,
    color: Colors.primary,
  },
  contactStatus: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.textMuted,
  },
  contactDeclined: { color: Colors.error },

  // Contact reveal modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  revealBox: {
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  revealTitle: {
    fontFamily: Typography.serif,
    fontWeight: 'bold',
    fontSize: Typography.lg,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  revealContact: {
    fontFamily: Typography.body,
    fontSize: Typography.md,
    color: Colors.text,
    lineHeight: 24,
    marginBottom: Spacing.sm,
  },
  revealHint: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    marginBottom: Spacing.md,
  },
  revealCloseBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  revealCloseBtnText: {
    fontFamily: Typography.body,
    fontWeight: '600',
    fontSize: Typography.sm,
    color: Colors.primary,
  },
});
