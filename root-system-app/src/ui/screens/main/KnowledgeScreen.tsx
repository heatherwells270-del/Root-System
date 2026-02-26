// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Knowledge Archive Screen
//
// Community-contributed how-tos, guides, and local knowledge.
// Sorted by helpful votes. Anyone can contribute; community flags can remove.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, Pressable, TextInput,
  Modal, ScrollView, StyleSheet, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius, CardShadow } from '../../theme/index';
import { getIdentity } from '../../../db/identity';
import {
  getKnowledgeEntries, getKnowledgeEntry,
  upsertKnowledgeEntry, flagKnowledgeEntry, voteHelpful, tombstoneKnowledgeEntry,
} from '../../../db/knowledge';
import { hashFlagIdentity, hashVoteIdentity } from '../../../crypto/encrypt';
import type { KnowledgeEntry, CategoryId, Identity } from '../../../models/types';
import * as Crypto from 'expo-crypto';

// ─── HELPERS ────────────────────────────────────────────────────────────────

const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'skills',    label: 'Skills' },
  { id: 'goods',     label: 'Goods' },
  { id: 'care',      label: 'Care' },
  { id: 'food',      label: 'Food' },
  { id: 'tech',      label: 'Tech' },
  { id: 'housing',   label: 'Housing' },
  { id: 'transport', label: 'Transport' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'grief',     label: 'Grief' },
  { id: 'labor',     label: 'Labor' },
];

function relativeDate(iso: string): string {
  const d    = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30)  return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── ENTRY CARD ──────────────────────────────────────────────────────────────

function EntryCard({ entry, onPress }: { entry: KnowledgeEntry; onPress: () => void }) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardCat}>{entry.category}</Text>
      </View>
      <Text style={styles.cardTitle}>{entry.title}</Text>
      <Text style={styles.cardSummary} numberOfLines={2}>{entry.summary}</Text>
      <View style={styles.cardMeta}>
        <Text style={styles.metaText}>{entry.handle}</Text>
        <Text style={styles.metaText}>{relativeDate(entry.createdAt)}</Text>
        {entry.tags.length > 0 && (
          <Text style={styles.metaText}>{entry.tags.slice(0, 3).join(', ')}</Text>
        )}
      </View>
    </Pressable>
  );
}

// ─── CONTRIBUTE FORM ─────────────────────────────────────────────────────────

interface ContribForm {
  title: string; summary: string; body: string;
  category: CategoryId; tags: string;
}

function ContributeModal({
  visible, onClose, onContributed, identity, communityId,
}: {
  visible: boolean; onClose: () => void; onContributed: () => void;
  identity: Identity; communityId: string;
}) {
  const [form, setForm] = useState<ContribForm>({
    title: '', summary: '', body: '', category: 'knowledge', tags: '',
  });
  const [saving, setSaving] = useState(false);

  function update(key: keyof ContribForm, val: string) {
    setForm(f => ({ ...f, [key]: val }));
  }

  async function handleSubmit() {
    if (!form.title.trim())   { Alert.alert('', 'Add a title.'); return; }
    if (!form.summary.trim()) { Alert.alert('', 'Add a one-line summary.'); return; }
    if (!form.body.trim())    { Alert.alert('', 'Add the body — this is the actual knowledge.'); return; }

    setSaving(true);
    try {
      const now  = new Date().toISOString();
      const id   = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${identity.publicKey}-${now}-knowledge`
      );
      const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean);
      const entry: KnowledgeEntry = {
        id, communityId,
        title:   form.title.trim(),
        summary: form.summary.trim(),
        body:    form.body.trim(),
        category: form.category,
        tags,
        handle:          identity.handle ?? 'Anonymous',
        authorPublicKey: identity.publicKey,
        createdAt: now, updatedAt: now,
        flags: 0, flaggedBy: [],
        status: 'active',
        helpful: 0, votedBy: [],
        _sig: '', _version: 1, _updatedAt: now, _tombstone: false,
      };
      await upsertKnowledgeEntry(entry);
      setForm({ title: '', summary: '', body: '', category: 'knowledge', tags: '' });
      onContributed();
      onClose();
    } catch (e) {
      Alert.alert('Error', 'Could not save entry.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Contribute Knowledge</Text>
          <Pressable onPress={onClose}><Text style={styles.modalClose}>✕</Text></Pressable>
        </View>
        <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
          <Text style={styles.disclaimer}>
            Community-contributed. Anyone can flag; 3 flags removes the entry.
          </Text>

          <Text style={styles.fieldLabel}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.sm }}>
            <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
              {CATEGORIES.map(c => (
                <Pressable
                  key={c.id}
                  style={[styles.chip, form.category === c.id && styles.chipActive]}
                  onPress={() => update('category', c.id)}
                >
                  <Text style={[styles.chipText, form.category === c.id && styles.chipTextActive]}>
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <Text style={styles.fieldLabel}>Title</Text>
          <TextInput style={styles.input} value={form.title} onChangeText={v => update('title', v)}
            placeholder="e.g. How to request emergency food support"
            placeholderTextColor={Colors.dim} maxLength={120} />

          <Text style={styles.fieldLabel}>One-line summary</Text>
          <TextInput style={styles.input} value={form.summary} onChangeText={v => update('summary', v)}
            placeholder="Shown on the list — be brief"
            placeholderTextColor={Colors.dim} maxLength={200} />

          <Text style={styles.fieldLabel}>Body</Text>
          <TextInput style={[styles.input, styles.textarea]}
            value={form.body} onChangeText={v => update('body', v)}
            placeholder="The actual knowledge — steps, contacts, context, tips"
            placeholderTextColor={Colors.dim} multiline numberOfLines={6} maxLength={2000} />

          <Text style={styles.fieldLabel}>Tags (comma-separated, optional)</Text>
          <TextInput style={styles.input} value={form.tags} onChangeText={v => update('tags', v)}
            placeholder="food, pantry, emergency"
            placeholderTextColor={Colors.dim} />

          <Pressable style={[styles.btn, saving && styles.btnDisabled]} onPress={handleSubmit} disabled={saving}>
            {saving
              ? <ActivityIndicator color={Colors.background} size="small" />
              : <Text style={styles.btnText}>Contribute</Text>
            }
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── DETAIL MODAL ────────────────────────────────────────────────────────────

function DetailModal({
  entry, myIdentity, onClose, onRefresh,
}: {
  entry: KnowledgeEntry | null; myIdentity: Identity | null;
  onClose: () => void; onRefresh: () => void;
}) {
  if (!entry || !myIdentity) return null;

  // Capture narrowed values for use inside async callbacks
  const e  = entry;
  const me = myIdentity;

  const isAuthor = e.authorPublicKey === me.publicKey;

  async function handleVote() {
    const hash = hashVoteIdentity(me.publicKey, e.id);
    if (e.votedBy.includes(hash)) { Alert.alert('', 'Already voted.'); return; }
    await voteHelpful(e.id, hash);
    onRefresh();
  }

  async function handleFlag() {
    Alert.alert('Flag this entry?', 'Three flags removes it from the archive.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Flag', style: 'destructive', onPress: async () => {
          const hash = hashFlagIdentity(me.publicKey, e.id);
          await flagKnowledgeEntry(e.id, hash);
          onRefresh();
          if (e.flags + 1 >= 3) onClose();
        }
      },
    ]);
  }

  async function handleWithdraw() {
    Alert.alert('Withdraw entry?', 'Removes it from the archive.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Withdraw', style: 'destructive', onPress: async () => {
          await tombstoneKnowledgeEntry(e.id, '');
          onRefresh();
          onClose();
        }
      },
    ]);
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle} numberOfLines={2}>{e.title}</Text>
          <Pressable onPress={onClose}><Text style={styles.modalClose}>✕</Text></Pressable>
        </View>
        <ScrollView style={styles.modalBody}>
          <View style={styles.detailMeta}>
            <Text style={styles.detailMetaText}>{e.category}  ·  {e.handle}  ·  {relativeDate(e.createdAt)}</Text>
            {e.tags.length > 0 && (
              <Text style={styles.detailMetaText}>{e.tags.join(', ')}</Text>
            )}
          </View>

          <Text style={styles.detailSummary}>{e.summary}</Text>
          <View style={styles.divider} />
          <Text style={styles.detailBody}>{e.body}</Text>

          <View style={styles.detailActions}>
            <Pressable style={[styles.btn, styles.btnOutline]} onPress={handleVote}>
              <Text style={[styles.btnText, styles.btnOutlineText]}>▲ Helpful ({e.helpful})</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnOutline]} onPress={handleFlag}>
              <Text style={[styles.btnText, styles.btnOutlineText, { color: Colors.wine }]}>Flag</Text>
            </Pressable>
            {isAuthor && (
              <Pressable style={[styles.btn, styles.btnDanger]} onPress={handleWithdraw}>
                <Text style={styles.btnText}>Withdraw</Text>
              </Pressable>
            )}
          </View>

          <Text style={styles.communityNote}>
            This is community-contributed knowledge. Root System does not verify accuracy.
            Use your judgment and flag anything harmful or incorrect.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────────

type KnowledgeSort = 'recent' | 'helpful';

export default function KnowledgeScreen() {
  const [entries,      setEntries]      = useState<KnowledgeEntry[]>([]);
  const [identity,     setIdentity]     = useState<Identity | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [catFilter,    setCatFilter]    = useState<CategoryId | 'all'>('all');
  const [sort,         setSort]         = useState<KnowledgeSort>('recent');
  const [search,       setSearch]       = useState('');
  const [showContrib,  setShowContrib]  = useState(false);
  const [detail,       setDetail]       = useState<KnowledgeEntry | null>(null);

  const communityId = identity?.communityIds?.[0] ?? '';

  const [refreshing,   setRefreshing]   = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    try {
      const id = await getIdentity();
      setIdentity(id);
      if (id?.communityIds?.[0]) {
        const cat  = catFilter === 'all' ? undefined : catFilter;
        const list = await getKnowledgeEntries(id.communityIds[0], cat, sort);
        setEntries(list);
      }
      setLoadError(null);
      setLoading(false);
    } catch (e) {
      console.error('[KnowledgeScreen] load failed', e);
      setLoadError('Could not load. Pull to refresh.');
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => { void load(); }, [catFilter, sort]));

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function refreshDetail(id: string) {
    const updated = await getKnowledgeEntry(id);
    setDetail(updated);
    await load();
  }

  const visible = search.trim()
    ? entries.filter(e =>
        e.title.toLowerCase().includes(search.toLowerCase()) ||
        e.summary.toLowerCase().includes(search.toLowerCase()) ||
        e.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
      )
    : entries;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}><ActivityIndicator color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {loadError && (
        <Text style={styles.loadError}>{loadError}</Text>
      )}
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Knowledge Archive</Text>
        <Pressable style={styles.newBtn} onPress={() => setShowContrib(true)}>
          <Text style={styles.newBtnText}>+ Contribute</Text>
        </Pressable>
      </View>

      {/* Search + sort toggle */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search…"
          placeholderTextColor={Colors.dim}
        />
        <Pressable
          style={[styles.sortToggle, sort === 'helpful' && styles.sortToggleActive]}
          onPress={() => setSort(s => s === 'recent' ? 'helpful' : 'recent')}
          accessibilityRole="button"
          accessibilityLabel={sort === 'recent' ? 'Switch to most helpful sort' : 'Switch to newest sort'}
        >
          <Text style={[styles.sortToggleText, sort === 'helpful' && styles.sortToggleTextActive]}>
            {sort === 'recent' ? '↓ Newest' : '▲ Helpful'}
          </Text>
        </Pressable>
      </View>

      {/* Category chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow} contentContainerStyle={{ gap: Spacing.xs, paddingHorizontal: Spacing.md }}>
        <Pressable
          style={[styles.chip, catFilter === 'all' && styles.chipActive]}
          onPress={() => setCatFilter('all')}
        >
          <Text style={[styles.chipText, catFilter === 'all' && styles.chipTextActive]}>All</Text>
        </Pressable>
        {CATEGORIES.map(c => (
          <Pressable
            key={c.id}
            style={[styles.chip, catFilter === c.id && styles.chipActive]}
            onPress={() => setCatFilter(c.id)}
          >
            <Text style={[styles.chipText, catFilter === c.id && styles.chipTextActive]}>{c.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {visible.length === 0 ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          <View style={styles.centered}>
            <Text style={styles.emptyIcon}>✎</Text>
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptyBody}>
              Share what your community knows — repair tips, local resources,
              how to navigate systems, care skills, anything useful.
            </Text>
            <Pressable style={styles.btn} onPress={() => setShowContrib(true)}>
              <Text style={styles.btnText}>Contribute</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <EntryCard entry={item} onPress={() => setDetail(item)} />
          )}
          contentContainerStyle={styles.list}
          removeClippedSubviews
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        />
      )}

      {identity && (
        <ContributeModal
          visible={showContrib}
          onClose={() => setShowContrib(false)}
          onContributed={load}
          identity={identity}
          communityId={communityId}
        />
      )}

      <DetailModal
        entry={detail}
        myIdentity={identity}
        onClose={() => setDetail(null)}
        onRefresh={() => detail && void refreshDetail(detail.id)}
      />
    </SafeAreaView>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: Colors.background },
  centered:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle:{ fontFamily: Typography.serifBold, fontWeight: 'bold', fontSize: Typography.lg, color: Colors.text },
  newBtn:     { borderWidth: 1, borderColor: Colors.borderMid, paddingVertical: 6, paddingHorizontal: 14, borderRadius: Radius.full },
  newBtnText: { fontFamily: Typography.bodySemi, fontWeight: '600', fontSize: Typography.sm, color: Colors.primary },
  searchRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm },
  searchInput:{ flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 8, color: Colors.text, fontFamily: Typography.body, fontSize: Typography.base },
  sortToggle:           { borderWidth: 1, borderColor: Colors.borderMid, paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radius.full },
  sortToggleActive:     { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  sortToggleText:       { fontFamily: Typography.body, fontSize: Typography.xs, color: Colors.dim },
  sortToggleTextActive: { color: Colors.primary },
  catRow:     { flexShrink: 0, maxHeight: 44, marginBottom: Spacing.xs },
  list:       { padding: Spacing.md, gap: Spacing.md },

  // Card
  card:        { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...CardShadow },
  cardHeader:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  cardCat:     { fontFamily: Typography.body, fontSize: Typography.xs, color: Colors.earth, textTransform: 'capitalize' },
  cardHelpful: { fontFamily: Typography.body, fontSize: Typography.xs, color: Colors.primaryMid },
  cardTitle:   { fontFamily: Typography.serifBold, fontWeight: 'bold', fontSize: Typography.md, color: Colors.text, marginBottom: 4 },
  cardSummary: { fontFamily: Typography.body, fontSize: Typography.sm, color: Colors.dim, marginBottom: Spacing.sm },
  cardMeta:    { flexDirection: 'row', gap: Spacing.md },
  metaText:    { fontFamily: Typography.body, fontSize: Typography.xs, color: Colors.inkMid },

  // Chips
  chip:         { borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full },
  chipActive:   { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText:     { fontFamily: Typography.body, fontSize: Typography.xs, color: Colors.dim },
  chipTextActive:{ color: Colors.background, fontFamily: Typography.bodySemi, fontWeight: '600' },

  // Empty
  emptyIcon:  { fontSize: 36, marginBottom: Spacing.sm },
  emptyTitle: { fontFamily: Typography.serifBold, fontWeight: 'bold', fontSize: Typography.md, color: Colors.text, textAlign: 'center' },
  emptyBody:  { fontFamily: Typography.body, fontSize: Typography.sm, color: Colors.dim, textAlign: 'center', lineHeight: 20 },

  // Modal
  modalSafe:    { flex: 1, backgroundColor: Colors.background },
  modalHeader:  { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle:   { fontFamily: Typography.serifBold, fontWeight: 'bold', fontSize: Typography.lg, color: Colors.text, flex: 1, lineHeight: 26 },
  modalClose:   { fontFamily: Typography.body, fontSize: Typography.md, color: Colors.dim, paddingLeft: Spacing.md },
  modalBody:    { flex: 1, padding: Spacing.md },
  disclaimer:   { fontFamily: Typography.bodyItalic, fontStyle: 'italic', fontSize: Typography.xs, color: Colors.dim, marginBottom: Spacing.md, lineHeight: 16 },
  fieldLabel:   { fontFamily: Typography.bodySemi, fontWeight: '600', fontSize: Typography.sm, color: Colors.text, marginTop: Spacing.md, marginBottom: 4 },
  input:        { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: Spacing.sm, color: Colors.text, fontFamily: Typography.body, fontSize: Typography.base },
  textarea:     { height: 120, textAlignVertical: 'top' },

  detailMeta:      { marginBottom: Spacing.sm },
  detailMetaText:  { fontFamily: Typography.body, fontSize: Typography.xs, color: Colors.dim, marginBottom: 2 },
  detailSummary:   { fontFamily: Typography.serifItalic, fontStyle: 'italic', fontSize: Typography.md, color: Colors.text, marginBottom: Spacing.md, lineHeight: 24 },
  divider:         { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.md },
  detailBody:      { fontFamily: Typography.body, fontSize: Typography.base, color: Colors.text, lineHeight: 24, marginBottom: Spacing.lg },
  detailActions:   { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg, flexWrap: 'wrap' },
  communityNote:   { fontFamily: Typography.bodyItalic, fontStyle: 'italic', fontSize: Typography.xs, color: Colors.inkMid, lineHeight: 17, marginBottom: Spacing.xxl },

  btn:            { backgroundColor: Colors.primary, borderRadius: Radius.sm, paddingVertical: 10, paddingHorizontal: 20, alignItems: 'center' },
  btnDisabled:    { opacity: 0.5 },
  btnOutline:     { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.border },
  btnDanger:      { backgroundColor: Colors.wine },
  btnText:        { fontFamily: Typography.bodySemi, fontWeight: '600', fontSize: Typography.base, color: Colors.background },
  btnOutlineText: { color: Colors.text },
  loadError:      { fontFamily: Typography.bodyItalic, fontSize: Typography.xs, color: Colors.wine, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
});
