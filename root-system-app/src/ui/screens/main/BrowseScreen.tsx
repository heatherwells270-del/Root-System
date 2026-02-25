// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Browse Screen
//
// The main feed. Filter collapse, local label, post cards.
// All the logic from mutual-aid-v3-layer4.jsx ported to React Native.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, TextInput, FlatList, Pressable,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius, CardShadow } from '../../theme/index';
import { getActivePosts } from '../../../db/posts';
import { getIdentity } from '../../../db/identity';
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
  offer: Colors.greenMid,
  need:  Colors.wine,
  free:  Colors.gold,
};

export default function BrowseScreen() {
  const [posts,        setPosts]        = useState<Post[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [typeFilter,   setTypeFilter]   = useState<'all' | Post['type']>('all');
  const [catFilter,    setCatFilter]    = useState<'all' | CategoryId>('all');
  const [filtersOpen,  setFiltersOpen]  = useState(false);
  const [communityId,  setCommunityId]  = useState<string | null>(null);
  const [localCity,    setLocalCity]    = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const identity = await getIdentity();
      const cid = identity?.communityIds[0] ?? null;
      setCommunityId(cid);
      setLocalCity(identity?.location?.city ?? identity?.location?.zip ?? null);
      if (cid) {
        const loaded = await getActivePosts(cid);
        setPosts(loaded);
      }
      setLoading(false);
    }
    load();
  }, []);

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

  const offerCount = posts.filter(p => p.type === 'offer').length;
  const needCount  = posts.filter(p => p.type === 'need').length;
  const freeCount  = posts.filter(p => p.type === 'free').length;

  function renderPost({ item }: { item: Post }) {
    const cat = CATEGORIES.find(c => c.id === item.category);
    const badgeColor = TYPE_BADGE_COLORS[item.type] ?? Colors.dim;
    return (
      <View style={styles.card}>
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
          <Text style={styles.handle}>{item.handle || 'Anonymous'}</Text>
          {item.zone !== 'Any / Network-wide' && (
            <Text style={styles.zone}>{item.zone}</Text>
          )}
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.gold} />
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

      {/* Filter row — always visible: toggle + search */}
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
      </View>

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
              ? 'Nothing here yet. Be the first to plant something.'
              : 'Find or join a community to see posts.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          renderItem={renderPost}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
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
    color: Colors.dim,
    marginBottom: 2,
  },
  localLabel: {
    fontFamily: Typography.bodyItalic,
    fontSize: Typography.xs,
    color: Colors.earth,
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
    color: Colors.cream,
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
    borderColor: Colors.gold,
    backgroundColor: 'rgba(196,152,46,0.12)',
  },
  chipText: {
    fontFamily: Typography.body,
    fontSize: Typography.xs,
    color: Colors.dim,
  },
  chipTextActive: { color: Colors.gold },
  resultsCount: {
    fontFamily: Typography.bodyItalic,
    fontSize: Typography.xs,
    color: Colors.dim,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xs,
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
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm, gap: Spacing.sm },
  typeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  typeBadgeText: { fontFamily: Typography.bodySemi, fontSize: Typography.xs },
  catEmoji: { fontSize: 14, marginLeft: 'auto' },
  postTitle: {
    fontFamily: Typography.serifBold,
    fontSize: Typography.md,
    color: Colors.cream,
    marginBottom: Spacing.xs,
    lineHeight: 26,
  },
  postBody: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.moonsilver,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: Spacing.sm },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(196,152,46,0.08)',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tagText: { fontFamily: Typography.bodyItalic, fontSize: Typography.xs, color: Colors.earth },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.xs },
  handle: { fontFamily: Typography.bodyItalic, fontSize: Typography.xs, color: Colors.dim },
  zone: { fontFamily: Typography.bodyItalic, fontSize: Typography.xs, color: Colors.dim },
  emptyIcon: { fontSize: 32 },
  emptyText: {
    fontFamily: Typography.bodyItalic,
    fontSize: Typography.base,
    color: Colors.dim,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 24,
  },
});
