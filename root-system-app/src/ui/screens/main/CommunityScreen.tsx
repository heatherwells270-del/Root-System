// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Community Screen
//
// Segmented: Coalitions | Knowledge Archive
// Both live under one tab so the bottom bar stays at 4 destinations.
// ═══════════════════════════════════════════════════════════════════════════

import React, { memo, useCallback, useEffect, useState } from 'react';
import {
  View, Text, Pressable, TextInput,
  Modal, ScrollView, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius, CardShadow } from '../../theme/index';
import { getIdentity } from '../../../db/identity';
import {
  getCoalitionsForCommunity, getCoalition,
  upsertCoalition, joinCoalition, leaveCoalition, tombstoneCoalition,
} from '../../../db/coalitions';
import {
  getKnowledgeEntries, getKnowledgeEntry,
  upsertKnowledgeEntry, flagKnowledgeEntry, voteHelpful, tombstoneKnowledgeEntry,
} from '../../../db/knowledge';
import { hashFlagIdentity, hashVoteIdentity } from '../../../crypto/encrypt';
import type { Coalition, KnowledgeEntry, CategoryId, Identity } from '../../../models/types';
import * as Crypto from 'expo-crypto';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const KNOWLEDGE_CATS: { id: CategoryId; label: string }[] = [
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

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function memberCount(c: Coalition): string {
  const n = c.memberKeys.length;
  return n === 1 ? '1 member' : `${n} members`;
}

function relativeDate(iso: string): string {
  const d    = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30)  return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── COALITION CARD ──────────────────────────────────────────────────────────

const CoalitionCard = memo(function CoalitionCard({
  coalition, myPublicKey, onPress,
}: {
  coalition: Coalition;
  myPublicKey: string;
  onPress: () => void;
}) {
  const isMember = coalition.memberKeys.includes(myPublicKey);
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{coalition.title}</Text>
        {isMember && <Text style={styles.memberBadge}>member</Text>}
      </View>
      <Text style={styles.cardSub} numberOfLines={2}>{coalition.purpose}</Text>
      <View style={styles.cardMeta}>
        <Text style={styles.metaText}>{memberCount(coalition)}</Text>
        <Text style={styles.metaText}>{coalition.zone}</Text>
        <Text style={styles.metaText}>{relativeDate(coalition.createdAt)}</Text>
      </View>
    </Pressable>
  );
});

// ─── KNOWLEDGE ENTRY CARD ────────────────────────────────────────────────────

const EntryCard = memo(function EntryCard({
  entry, onPress,
}: {
  entry: KnowledgeEntry;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardCat}>{entry.category}</Text>
        <Text style={styles.cardHelpful}>▲ {entry.helpful}</Text>
      </View>
      <Text style={styles.cardTitle}>{entry.title}</Text>
      <Text style={styles.cardSub} numberOfLines={2}>{entry.summary}</Text>
      <View style={styles.cardMeta}>
        <Text style={styles.metaText}>{entry.handle}</Text>
        <Text style={styles.metaText}>{relativeDate(entry.createdAt)}</Text>
        {entry.tags.length > 0 && (
          <Text style={styles.metaText}>{entry.tags.slice(0, 3).join(', ')}</Text>
        )}
      </View>
    </Pressable>
  );
});

// ─── COALITION CREATE MODAL ──────────────────────────────────────────────────

interface CoalitionForm { title: string; purpose: string; contact: string; zone: string }

function CoalitionCreateModal({
  visible, onClose, onCreated, identity, communityId,
}: {
  visible: boolean; onClose: () => void; onCreated: () => void;
  identity: Identity; communityId: string;
}) {
  const [form, setForm] = useState<CoalitionForm>({ title: '', purpose: '', contact: '', zone: 'Any / Network-wide' });
  const [saving, setSaving] = useState(false);

  function update(key: keyof CoalitionForm, val: string) {
    setForm(f => ({ ...f, [key]: val }));
  }

  async function handleCreate() {
    if (!form.title.trim())   { Alert.alert('', 'Give your coalition a name.'); return; }
    if (!form.purpose.trim()) { Alert.alert('', 'Describe the purpose.'); return; }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const id  = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${identity.publicKey}-${now}`
      );
      const coalition: Coalition = {
        id, communityId,
        title:   form.title.trim(),
        purpose: form.purpose.trim(),
        contact: form.contact.trim(),
        zone:    form.zone.trim() || 'Any / Network-wide',
        memberKeys:    [identity.publicKey],
        memberHandles: { [identity.publicKey]: identity.handle ?? 'Anonymous' },
        createdAt: now, createdBy: identity.publicKey,
        _sig: '', _version: 1, _updatedAt: now, _tombstone: false,
      };
      await upsertCoalition(coalition);
      setForm({ title: '', purpose: '', contact: '', zone: 'Any / Network-wide' });
      onCreated();
      onClose();
    } catch {
      Alert.alert('Error', 'Could not create coalition.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>New Coalition</Text>
          <Pressable onPress={onClose}><Text style={styles.modalClose}>✕</Text></Pressable>
        </View>
        <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput style={styles.input} value={form.title} onChangeText={v => update('title', v)}
            placeholder="e.g. Neighborhood Pantry Collective" placeholderTextColor={Colors.dim} maxLength={80} />

          <Text style={styles.fieldLabel}>Purpose</Text>
          <TextInput style={[styles.input, styles.textarea]} value={form.purpose} onChangeText={v => update('purpose', v)}
            placeholder="What does this coalition do or advocate for?" placeholderTextColor={Colors.dim}
            multiline numberOfLines={3} maxLength={300} />

          <Text style={styles.fieldLabel}>Contact info (optional)</Text>
          <TextInput style={styles.input} value={form.contact} onChangeText={v => update('contact', v)}
            placeholder="Signal group, meeting time, etc." placeholderTextColor={Colors.dim} maxLength={200} />

          <Text style={styles.fieldLabel}>Zone (optional)</Text>
          <TextInput style={styles.input} value={form.zone} onChangeText={v => update('zone', v)}
            placeholder="Any / Network-wide" placeholderTextColor={Colors.dim} />

          <Text style={styles.hint}>
            You'll be the first member. Coalitions with fewer than 2 members aren't listed to others.
          </Text>

          <Pressable style={[styles.btn, saving && styles.btnDisabled]} onPress={handleCreate} disabled={saving}>
            {saving ? <ActivityIndicator color={Colors.background} size="small" />
                    : <Text style={styles.btnText}>Create Coalition</Text>}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── COALITION DETAIL MODAL ──────────────────────────────────────────────────

function CoalitionDetailModal({
  coalition, myIdentity, onClose, onRefresh,
}: {
  coalition: Coalition | null; myIdentity: Identity | null;
  onClose: () => void; onRefresh: () => void;
}) {
  const [acting, setActing] = useState(false);

  if (!coalition || !myIdentity) return null;

  const c  = coalition;
  const me = myIdentity;
  const isMember  = c.memberKeys.includes(me.publicKey);
  const isCreator = c.createdBy === me.publicKey;

  async function handleJoin() {
    if (acting) return;
    setActing(true);
    try {
      await joinCoalition(c.id, me.publicKey, me.handle ?? 'Anonymous');
      onRefresh();
    } finally {
      setActing(false);
    }
  }

  async function handleLeave() {
    if (isCreator) {
      Alert.alert('Cannot leave', 'Dissolve the coalition instead if you want to end it.');
      return;
    }
    Alert.alert('Leave coalition?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: async () => {
          if (acting) return;
          setActing(true);
          try {
            await leaveCoalition(c.id, me.publicKey);
            onRefresh();
          } finally {
            setActing(false);
          }
        }
      },
    ]);
  }

  async function handleDissolve() {
    Alert.alert('Dissolve coalition?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Dissolve', style: 'destructive', onPress: async () => {
          if (acting) return;
          setActing(true);
          try {
            await tombstoneCoalition(c.id, '');
            onRefresh();
            onClose();
          } finally {
            setActing(false);
          }
        }
      },
    ]);
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle} numberOfLines={1}>{c.title}</Text>
          <Pressable onPress={onClose}><Text style={styles.modalClose}>✕</Text></Pressable>
        </View>
        <ScrollView style={styles.modalBody}>
          <Text style={styles.detailSection}>Purpose</Text>
          <Text style={styles.detailBody}>{c.purpose}</Text>
          {c.contact ? (
            <>
              <Text style={styles.detailSection}>Contact / Meeting info</Text>
              <Text style={styles.detailBody}>{c.contact}</Text>
            </>
          ) : null}
          <Text style={styles.detailSection}>Zone</Text>
          <Text style={styles.detailBody}>{c.zone}</Text>
          <Text style={styles.detailSection}>Members ({c.memberKeys.length})</Text>
          {c.memberKeys.map(key => (
            <Text key={key} style={styles.memberRow}>
              {c.memberHandles[key] ?? 'Anonymous'}{key === c.createdBy ? '  ·  organizer' : ''}
            </Text>
          ))}
          <View style={styles.detailActions}>
            {isMember
              ? <Pressable
                  style={[styles.btn, styles.btnOutline, acting && styles.btnDisabled]}
                  onPress={handleLeave}
                  disabled={acting}
                >
                  {acting
                    ? <ActivityIndicator color={Colors.textMuted} size="small" />
                    : <Text style={[styles.btnText, styles.btnOutlineText]}>Leave</Text>
                  }
                </Pressable>
              : <Pressable
                  style={[styles.btn, acting && styles.btnDisabled]}
                  onPress={handleJoin}
                  disabled={acting}
                >
                  {acting
                    ? <ActivityIndicator color={Colors.background} size="small" />
                    : <Text style={styles.btnText}>Join Coalition</Text>
                  }
                </Pressable>
            }
            {isCreator && (
              <Pressable
                style={[styles.btn, styles.btnDanger, acting && styles.btnDisabled]}
                onPress={handleDissolve}
                disabled={acting}
              >
                <Text style={styles.btnText}>Dissolve</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── KNOWLEDGE CONTRIBUTE MODAL ──────────────────────────────────────────────

interface KnowledgeForm { title: string; summary: string; body: string; category: CategoryId; tags: string }

function KnowledgeContributeModal({
  visible, onClose, onContributed, identity, communityId,
}: {
  visible: boolean; onClose: () => void; onContributed: () => void;
  identity: Identity; communityId: string;
}) {
  const [form, setForm] = useState<KnowledgeForm>({ title: '', summary: '', body: '', category: 'knowledge', tags: '' });
  const [saving, setSaving] = useState(false);

  function update(key: keyof KnowledgeForm, val: string) {
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
      const entry: KnowledgeEntry = {
        id, communityId,
        title:   form.title.trim(),
        summary: form.summary.trim(),
        body:    form.body.trim(),
        category: form.category,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        handle: identity.handle ?? 'Anonymous',
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
    } catch {
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
          <Text style={styles.disclaimer}>Community-contributed. Three flags removes an entry.</Text>

          <Text style={styles.fieldLabel}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.sm }}>
            <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
              {KNOWLEDGE_CATS.map(c => (
                <Pressable key={c.id}
                  style={[styles.chip, form.category === c.id && styles.chipActive]}
                  onPress={() => update('category', c.id)}>
                  <Text style={[styles.chipText, form.category === c.id && styles.chipTextActive]}>{c.label}</Text>
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
            placeholder="Shown on the list — be brief" placeholderTextColor={Colors.dim} maxLength={200} />

          <Text style={styles.fieldLabel}>Body</Text>
          <TextInput style={[styles.input, styles.textarea]} value={form.body} onChangeText={v => update('body', v)}
            placeholder="The actual knowledge — steps, contacts, context, tips"
            placeholderTextColor={Colors.dim} multiline numberOfLines={6} maxLength={2000} />

          <Text style={styles.fieldLabel}>Tags (comma-separated, optional)</Text>
          <TextInput style={styles.input} value={form.tags} onChangeText={v => update('tags', v)}
            placeholder="food, pantry, emergency" placeholderTextColor={Colors.dim} />

          <Pressable style={[styles.btn, saving && styles.btnDisabled]} onPress={handleSubmit} disabled={saving}>
            {saving ? <ActivityIndicator color={Colors.background} size="small" />
                    : <Text style={styles.btnText}>Contribute</Text>}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── KNOWLEDGE DETAIL MODAL ──────────────────────────────────────────────────

function KnowledgeDetailModal({
  entry, myIdentity, onClose, onRefresh,
}: {
  entry: KnowledgeEntry | null; myIdentity: Identity | null;
  onClose: () => void; onRefresh: () => void;
}) {
  if (!entry || !myIdentity) return null;

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
          <View style={{ marginBottom: Spacing.sm }}>
            <Text style={styles.metaText}>{e.category}  ·  {e.handle}  ·  {relativeDate(e.createdAt)}</Text>
            {e.tags.length > 0 && <Text style={styles.metaText}>{e.tags.join(', ')}</Text>}
          </View>
          <Text style={styles.detailSummary}>{e.summary}</Text>
          <View style={styles.divider} />
          <Text style={styles.detailBody}>{e.body}</Text>
          <View style={[styles.detailActions, { flexWrap: 'wrap' }]}>
            <Pressable style={[styles.btn, styles.btnOutline]} onPress={handleVote}>
              <Text style={[styles.btnText, styles.btnOutlineText]}>▲ Helpful ({e.helpful})</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnOutline]} onPress={handleFlag}>
              <Text style={[styles.btnText, { color: Colors.wine }]}>Flag</Text>
            </Pressable>
            {isAuthor && (
              <Pressable style={[styles.btn, styles.btnDanger]} onPress={handleWithdraw}>
                <Text style={styles.btnText}>Withdraw</Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.communityNote}>
            Community-contributed. Root System does not verify accuracy. Flag anything harmful or incorrect.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── COALITIONS PANE ─────────────────────────────────────────────────────────

function CoalitionsPane({
  identity, communityId, showCreate, onCreateClose,
}: {
  identity: Identity; communityId: string;
  showCreate: boolean; onCreateClose: () => void;
}) {
  const [coalitions, setCoalitions] = useState<Coalition[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [detail,     setDetail]     = useState<Coalition | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await getCoalitionsForCommunity(communityId);
    setCoalitions(list.filter(c =>
      c.memberKeys.length >= 2 || c.memberKeys.includes(identity.publicKey)
    ));
    setLoading(false);
  }, [communityId, identity.publicKey]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const renderItem = useCallback(({ item }: { item: Coalition }) => (
    <CoalitionCard
      coalition={item}
      myPublicKey={identity.publicKey}
      onPress={() => setDetail(item)}
    />
  ), [identity.publicKey]);

  async function refreshDetail(id: string) {
    const updated = await getCoalition(id);
    setDetail(updated);
    await load();
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color={Colors.primary} /></View>;
  }

  return (
    <View style={{ flex: 1 }}>
      {coalitions.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>⬡</Text>
          <Text style={styles.emptyTitle}>No coalitions yet</Text>
          <Text style={styles.emptyBody}>
            Start one to coordinate around a shared purpose — a food pantry,
            skill-share, mutual aid response, anything your community needs.
          </Text>
        </View>
      ) : (
        <FlashList
          data={coalitions}
          keyExtractor={(item: Coalition) => item.id}
          renderItem={renderItem}
          estimatedItemSize={110}
          contentContainerStyle={styles.list}
        />
      )}

      <CoalitionCreateModal
        visible={showCreate}
        onClose={onCreateClose}
        onCreated={load}
        identity={identity}
        communityId={communityId}
      />

      <CoalitionDetailModal
        coalition={detail}
        myIdentity={identity}
        onClose={() => setDetail(null)}
        onRefresh={() => detail && void refreshDetail(detail.id)}
      />
    </View>
  );
}

// ─── KNOWLEDGE PANE ──────────────────────────────────────────────────────────

function KnowledgePane({
  identity, communityId, showContrib, onContribClose,
}: {
  identity: Identity; communityId: string;
  showContrib: boolean; onContribClose: () => void;
}) {
  const [entries,   setEntries]   = useState<KnowledgeEntry[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [catFilter, setCatFilter] = useState<CategoryId | 'all'>('all');
  const [search,    setSearch]    = useState('');
  const [detail,    setDetail]    = useState<KnowledgeEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const list = catFilter === 'all'
      ? await getKnowledgeEntries(communityId)
      : await getKnowledgeEntries(communityId, catFilter);
    setEntries(list);
    setLoading(false);
  }, [communityId, catFilter]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const visible = search.trim()
    ? entries.filter(e =>
        e.title.toLowerCase().includes(search.toLowerCase()) ||
        (e.summary?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
        (e.tags ?? []).some(t => t.toLowerCase().includes(search.toLowerCase()))
      )
    : entries;

  const renderItem = useCallback(({ item }: { item: KnowledgeEntry }) => (
    <EntryCard entry={item} onPress={() => setDetail(item)} />
  ), []);

  async function refreshDetail(id: string) {
    const updated = await getKnowledgeEntry(id);
    setDetail(updated);
    await load();
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color={Colors.primary} /></View>;
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Search */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search…"
          placeholderTextColor={Colors.dim}
        />
      </View>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.catRow}
        contentContainerStyle={{ gap: Spacing.xs, paddingHorizontal: Spacing.md }}
      >
        <Pressable
          style={[styles.chip, catFilter === 'all' && styles.chipActive]}
          onPress={() => setCatFilter('all')}
        >
          <Text style={[styles.chipText, catFilter === 'all' && styles.chipTextActive]}>All</Text>
        </Pressable>
        {KNOWLEDGE_CATS.map(c => (
          <Pressable key={c.id}
            style={[styles.chip, catFilter === c.id && styles.chipActive]}
            onPress={() => setCatFilter(c.id)}
          >
            <Text style={[styles.chipText, catFilter === c.id && styles.chipTextActive]}>{c.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {visible.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>✎</Text>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptyBody}>
            Share what your community knows — repair tips, local resources,
            how to navigate systems, care skills, anything useful.
          </Text>
        </View>
      ) : (
        <FlashList
          data={visible}
          keyExtractor={(item: KnowledgeEntry) => item.id}
          renderItem={renderItem}
          estimatedItemSize={120}
          contentContainerStyle={styles.list}
        />
      )}

      <KnowledgeContributeModal
        visible={showContrib}
        onClose={onContribClose}
        onContributed={load}
        identity={identity}
        communityId={communityId}
      />

      <KnowledgeDetailModal
        entry={detail}
        myIdentity={identity}
        onClose={() => setDetail(null)}
        onRefresh={() => detail && void refreshDetail(detail.id)}
      />
    </View>
  );
}

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────────

export default function CommunityScreen() {
  const [tab,         setTab]         = useState<'coalitions' | 'knowledge'>('coalitions');
  const [identity,    setIdentity]    = useState<Identity | null>(null);
  const [showCreate,  setShowCreate]  = useState(false);
  const [showContrib, setShowContrib] = useState(false);

  useEffect(() => { getIdentity().then(setIdentity); }, []);

  const communityId = identity?.communityIds?.[0] ?? '';

  function handleAction() {
    if (tab === 'coalitions') setShowCreate(true);
    else setShowContrib(true);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        {/* Segmented control */}
        <View style={styles.segRow}>
          <Pressable
            style={[styles.seg, tab === 'coalitions' && styles.segActive]}
            onPress={() => setTab('coalitions')}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'coalitions' }}
          >
            <Text style={[styles.segText, tab === 'coalitions' && styles.segTextActive]}>
              Coalitions
            </Text>
          </Pressable>
          <Pressable
            style={[styles.seg, tab === 'knowledge' && styles.segActive]}
            onPress={() => setTab('knowledge')}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'knowledge' }}
          >
            <Text style={[styles.segText, tab === 'knowledge' && styles.segTextActive]}>
              Knowledge
            </Text>
          </Pressable>
        </View>

        {/* Action button */}
        <Pressable style={styles.newBtn} onPress={handleAction}>
          <Text style={styles.newBtnText}>
            {tab === 'coalitions' ? '+ New' : '+ Add'}
          </Text>
        </Pressable>
      </View>

      {/* ── Pane content ────────────────────────────────────────────── */}
      {identity == null ? (
        <View style={styles.centered}><ActivityIndicator color={Colors.primary} /></View>
      ) : tab === 'coalitions' ? (
        <CoalitionsPane
          identity={identity}
          communityId={communityId}
          showCreate={showCreate}
          onCreateClose={() => setShowCreate(false)}
        />
      ) : (
        <KnowledgePane
          identity={identity}
          communityId={communityId}
          showContrib={showContrib}
          onContribClose={() => setShowContrib(false)}
        />
      )}
    </SafeAreaView>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  list:     { padding: Spacing.md, gap: Spacing.md },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  // Segmented control
  segRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    flex: 1,
    marginRight: Spacing.sm,
  },
  seg: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: Radius.full,
  },
  segActive: {
    backgroundColor: Colors.primary,
  },
  segText: {
    fontFamily: Typography.bodySemi,
    fontWeight: '600',
    fontSize: Typography.xs,
    color: Colors.dim,
  },
  segTextActive: {
    color: Colors.background,
  },

  // Action button
  newBtn: {
    borderWidth: 1,
    borderColor: Colors.borderMid,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: Radius.full,
  },
  newBtnText: {
    fontFamily: Typography.bodySemi,
    fontWeight: '600',
    fontSize: Typography.xs,
    color: Colors.primary,
  },

  // Cards
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...CardShadow,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle:   { fontFamily: Typography.serifBold, fontWeight: 'bold', fontSize: Typography.md, color: Colors.text, flex: 1 },
  cardSub:     { fontFamily: Typography.body, fontSize: Typography.sm, color: Colors.dim, marginBottom: Spacing.sm, lineHeight: 18 },
  cardCat:     { fontFamily: Typography.body, fontSize: Typography.xs, color: Colors.earth, textTransform: 'capitalize' },
  cardHelpful: { fontFamily: Typography.body, fontSize: Typography.xs, color: Colors.primaryLight },
  cardMeta:    { flexDirection: 'row', gap: Spacing.md },
  metaText:    { fontFamily: Typography.body, fontSize: Typography.xs, color: Colors.inkMid },
  memberBadge: {
    fontFamily: Typography.body, fontSize: Typography.xs, color: Colors.greenAccent,
    backgroundColor: 'rgba(79,140,60,0.15)', paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: Radius.full, marginLeft: Spacing.sm,
  },

  // Empty state
  emptyIcon:  { fontSize: 36, marginBottom: Spacing.sm },
  emptyTitle: { fontFamily: Typography.serifBold, fontWeight: 'bold', fontSize: Typography.md, color: Colors.text, textAlign: 'center' },
  emptyBody:  { fontFamily: Typography.body, fontSize: Typography.sm, color: Colors.dim, textAlign: 'center', lineHeight: 20 },

  // Knowledge search & filter
  searchBar:    { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  searchInput:  {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 8,
    color: Colors.text, fontFamily: Typography.body, fontSize: Typography.base,
  },
  catRow: { flexShrink: 0, maxHeight: 44, marginTop: Spacing.xs, marginBottom: Spacing.xs },
  chip: {
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full,
  },
  chipActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText:       { fontFamily: Typography.body, fontSize: Typography.xs, color: Colors.dim },
  chipTextActive: { color: Colors.background, fontFamily: Typography.bodySemi, fontWeight: '600' },

  // Modals
  modalSafe:   { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { fontFamily: Typography.serifBold, fontWeight: 'bold', fontSize: Typography.lg, color: Colors.text, flex: 1, lineHeight: 26 },
  modalClose: { fontFamily: Typography.body, fontSize: Typography.md, color: Colors.dim, paddingLeft: Spacing.md },
  modalBody:  { flex: 1, padding: Spacing.md },

  fieldLabel: { fontFamily: Typography.bodySemi, fontWeight: '600', fontSize: Typography.sm, color: Colors.text, marginTop: Spacing.md, marginBottom: 4 },
  input:      {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.sm, padding: Spacing.sm, color: Colors.text,
    fontFamily: Typography.body, fontSize: Typography.base,
  },
  textarea:    { height: 100, textAlignVertical: 'top' },
  hint:        { fontFamily: Typography.bodyItalic, fontStyle: 'italic', fontSize: Typography.xs, color: Colors.dim, marginTop: Spacing.sm, marginBottom: Spacing.md, lineHeight: 17 },
  disclaimer:  { fontFamily: Typography.bodyItalic, fontStyle: 'italic', fontSize: Typography.xs, color: Colors.dim, marginBottom: Spacing.md, lineHeight: 16 },
  disclaimer2: { fontFamily: Typography.bodyItalic, fontStyle: 'italic', fontSize: Typography.xs, color: Colors.dim, marginBottom: Spacing.md, lineHeight: 16 },

  // Coalition detail
  detailSection: { fontFamily: Typography.bodySemi, fontWeight: '600', fontSize: Typography.sm, color: Colors.primary, marginTop: Spacing.md, marginBottom: 4 },
  detailActions: { gap: Spacing.sm, marginTop: Spacing.lg, marginBottom: Spacing.xxl },
  memberRow:     { fontFamily: Typography.body, fontSize: Typography.sm, color: Colors.dim, paddingVertical: 3 },

  // Knowledge detail
  detailSummary: { fontFamily: Typography.serifItalic, fontStyle: 'italic', fontSize: Typography.md, color: Colors.text, marginBottom: Spacing.md, lineHeight: 24 },
  divider:       { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.md },
  detailBody:    { fontFamily: Typography.body, fontSize: Typography.base, color: Colors.text, lineHeight: 24, marginBottom: Spacing.lg },
  communityNote: { fontFamily: Typography.bodyItalic, fontStyle: 'italic', fontSize: Typography.xs, color: Colors.inkMid, lineHeight: 17, marginBottom: Spacing.xxl },

  // Buttons
  btn:            { backgroundColor: Colors.primary, borderRadius: Radius.sm, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center' },
  btnDisabled:    { opacity: 0.5 },
  btnOutline:     { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.border },
  btnDanger:      { backgroundColor: Colors.wine },
  btnText:        { fontFamily: Typography.bodySemi, fontWeight: '600', fontSize: Typography.base, color: Colors.background },
  btnOutlineText: { color: Colors.text },
});
