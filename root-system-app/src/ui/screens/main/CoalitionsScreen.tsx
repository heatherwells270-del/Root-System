// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Coalitions Screen
//
// A coalition is a self-organized group within a community — a tool shed
// collective, a care circle, a repair co-op. Anyone can start one; anyone
// can join. The creator can dissolve it.
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
  getCoalitionsForCommunity,
  joinCoalition,
  leaveCoalition,
  tombstoneCoalition,
  upsertCoalition,
} from '../../../db/coalitions';
import { sign } from '../../../crypto/keypair';
import type { Coalition, Identity } from '../../../models/types';
import * as Crypto from 'expo-crypto';

// ─── HELPERS ────────────────────────────────────────────────────────────────

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── CREATE MODAL ────────────────────────────────────────────────────────────

interface CreateForm { title: string; purpose: string; contact: string; zone: string }

function CreateModal({
  visible, onClose, onCreated, identity, communityId,
}: {
  visible: boolean; onClose: () => void; onCreated: () => void;
  identity: Identity; communityId: string;
}) {
  const [form, setForm] = useState<CreateForm>({ title: '', purpose: '', contact: '', zone: '' });
  const [saving, setSaving] = useState(false);

  function update(key: keyof CreateForm, val: string) {
    setForm(f => ({ ...f, [key]: val }));
  }

  async function handleCreate() {
    if (!form.title.trim())   { Alert.alert('', 'Add a name for this coalition.'); return; }
    if (!form.purpose.trim()) { Alert.alert('', 'Describe the purpose briefly.'); return; }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const id  = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${identity.publicKey}-${now}-coalition`
      );
      const coalition: Coalition = {
        id, communityId,
        title:         form.title.trim(),
        purpose:       form.purpose.trim(),
        contact:       form.contact.trim(),
        zone:          form.zone.trim(),
        memberKeys:    [identity.publicKey],
        memberHandles: { [identity.publicKey]: identity.handle ?? 'Unknown' },
        createdAt: now, createdBy: identity.publicKey,
        _sig: '', _version: 1, _updatedAt: now, _tombstone: false,
      };
      const sig = await sign(JSON.stringify({ id: coalition.id, title: coalition.title, createdBy: coalition.createdBy }));
      coalition._sig = sig;
      await upsertCoalition(coalition);
      setForm({ title: '', purpose: '', contact: '', zone: '' });
      onCreated();
      onClose();
    } catch (e) {
      Alert.alert('Error', 'Could not create coalition.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Start a Coalition</Text>
          <Pressable onPress={onClose}><Text style={styles.modalClose}>✕</Text></Pressable>
        </View>
        <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
          <Text style={styles.disclaimer}>
            A coalition is a self-organized group. Root System doesn't moderate or manage it — you do.
          </Text>

          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            style={styles.input} value={form.title} onChangeText={v => update('title', v)}
            placeholder="e.g. Eastside Tool Collective"
            placeholderTextColor={Colors.dim} maxLength={80}
          />

          <Text style={styles.fieldLabel}>Purpose</Text>
          <TextInput
            style={[styles.input, styles.textarea]} value={form.purpose} onChangeText={v => update('purpose', v)}
            placeholder="What does this group do? Who should join?"
            placeholderTextColor={Colors.dim} multiline numberOfLines={3} maxLength={400}
          />

          <Text style={styles.fieldLabel}>
            Contact <Text style={styles.fieldHint}>(optional — how to reach you)</Text>
          </Text>
          <TextInput
            style={styles.input} value={form.contact} onChangeText={v => update('contact', v)}
            placeholder="e.g. Ask @handle on Browse, or meet Tues 6pm"
            placeholderTextColor={Colors.dim} maxLength={200}
          />

          <Text style={styles.fieldLabel}>
            Zone <Text style={styles.fieldHint}>(optional — neighborhood or area)</Text>
          </Text>
          <TextInput
            style={styles.input} value={form.zone} onChangeText={v => update('zone', v)}
            placeholder="e.g. North side, ZIP 97201"
            placeholderTextColor={Colors.dim} maxLength={80}
          />

          <Pressable
            style={[styles.btn, saving && styles.btnDisabled]}
            onPress={handleCreate}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color={Colors.background} size="small" />
              : <Text style={styles.btnText}>Start Coalition</Text>
            }
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── COALITION CARD ──────────────────────────────────────────────────────────

function CoalitionCard({
  coalition, isMember, isCreator, acting, onJoin, onLeave, onDissolve,
}: {
  coalition: Coalition;
  isMember: boolean;
  isCreator: boolean;
  acting: boolean;
  onJoin:    () => void;
  onLeave:   () => void;
  onDissolve:() => void;
}) {
  const count = coalition.memberKeys.length;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{coalition.title}</Text>
      <Text style={styles.cardPurpose}>{coalition.purpose}</Text>

      <View style={styles.cardMeta}>
        <Text style={styles.metaText}>
          {count} {count === 1 ? 'member' : 'members'}
        </Text>
        {coalition.zone ? <Text style={styles.metaText}>{coalition.zone}</Text> : null}
        <Text style={styles.metaText}>{relativeDate(coalition.createdAt)}</Text>
      </View>

      {coalition.contact ? (
        <Text style={styles.cardContact}>{coalition.contact}</Text>
      ) : null}

      <View style={styles.cardActions}>
        {isMember ? (
          isCreator ? (
            <Pressable
              style={[styles.btnOutline, styles.btnDanger, acting && styles.btnDisabled]}
              onPress={onDissolve}
              disabled={acting}
            >
              <Text style={styles.btnDangerText}>Dissolve</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.btnOutline, acting && styles.btnDisabled]}
              onPress={onLeave}
              disabled={acting}
            >
              <Text style={styles.btnOutlineText}>Leave</Text>
            </Pressable>
          )
        ) : (
          <Pressable
            style={[styles.btn, styles.btnCompact, acting && styles.btnDisabled]}
            onPress={onJoin}
            disabled={acting}
          >
            {acting
              ? <ActivityIndicator color={Colors.background} size="small" />
              : <Text style={styles.btnText}>Join</Text>
            }
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────────

export default function CoalitionsScreen() {
  const [coalitions, setCoalitions] = useState<Coalition[]>([]);
  const [identity,   setIdentity]   = useState<Identity | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting,     setActing]     = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [loadError,  setLoadError]  = useState<string | null>(null);

  const communityId = identity?.communityIds?.[0] ?? '';

  async function load() {
    try {
      const id = await getIdentity();
      setIdentity(id);
      if (id?.communityIds?.[0]) {
        const list = await getCoalitionsForCommunity(id.communityIds[0]);
        setCoalitions(list);
      }
      setLoadError(null);
      setLoading(false);
    } catch (e) {
      console.error('[CoalitionsScreen] load failed', e);
      setLoadError('Could not load. Pull to refresh.');
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => { void load(); }, []));

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleJoin(id: string) {
    if (!identity) return;
    setActing(true);
    try {
      await joinCoalition(id, identity.publicKey, identity.handle ?? 'Unknown');
      void load();
    } catch (e) {
      Alert.alert('Error', 'Could not join coalition.');
    } finally {
      setActing(false);
    }
  }

  async function handleLeave(id: string) {
    if (!identity) return;
    Alert.alert('Leave coalition?', 'You can always rejoin later.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: async () => {
          setActing(true);
          try {
            await leaveCoalition(id, identity.publicKey);
            void load();
          } catch (e) {
            Alert.alert('Error', 'Could not leave coalition.');
          } finally {
            setActing(false);
          }
        },
      },
    ]);
  }

  async function handleDissolve(coalition: Coalition) {
    Alert.alert(
      'Dissolve coalition?',
      `"${coalition.title}" will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Dissolve', style: 'destructive', onPress: async () => {
            setActing(true);
            try {
              const sig = await sign(JSON.stringify({ id: coalition.id, tombstone: true }));
              await tombstoneCoalition(coalition.id, sig);
              void load();
            } catch (e) {
              Alert.alert('Error', 'Could not dissolve coalition.');
            } finally {
              setActing(false);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}><ActivityIndicator color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {loadError && <Text style={styles.loadError}>{loadError}</Text>}

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Coalitions</Text>
        <Pressable style={styles.newBtn} onPress={() => setShowCreate(true)}>
          <Text style={styles.newBtnText}>+ Start one</Text>
        </Pressable>
      </View>

      {coalitions.length === 0 ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          <View style={styles.centered}>
            <Text style={styles.emptyIcon}>⬡</Text>
            <Text style={styles.emptyTitle}>No coalitions yet</Text>
            <Text style={styles.emptyBody}>
              A coalition is a self-organized group within your community — a tool shed co-op,
              a care circle, a repair crew. Start one and invite neighbors.
            </Text>
            <Pressable style={styles.btn} onPress={() => setShowCreate(true)}>
              <Text style={styles.btnText}>Start a coalition</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={coalitions}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <CoalitionCard
              coalition={item}
              isMember={!!identity && item.memberKeys.includes(identity.publicKey)}
              isCreator={!!identity && item.createdBy === identity.publicKey}
              acting={acting}
              onJoin={() => handleJoin(item.id)}
              onLeave={() => handleLeave(item.id)}
              onDissolve={() => handleDissolve(item)}
            />
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
        <CreateModal
          visible={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={load}
          identity={identity}
          communityId={communityId}
        />
      )}
    </SafeAreaView>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: Colors.background },
  centered:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle:{ fontFamily: Typography.serif, fontWeight: 'bold', fontSize: Typography.lg, color: Colors.text },
  newBtn:     { borderWidth: 1, borderColor: Colors.borderMid, paddingVertical: 6, paddingHorizontal: 14, borderRadius: Radius.full },
  newBtnText: { fontFamily: Typography.body, fontWeight: '600', fontSize: Typography.sm, color: Colors.primary },

  list: { padding: Spacing.md, gap: Spacing.md },

  // Card
  card:       { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...CardShadow },
  cardTitle:  { fontFamily: Typography.serif, fontWeight: 'bold', fontSize: Typography.md, color: Colors.text, marginBottom: 4 },
  cardPurpose:{ fontFamily: Typography.body, fontSize: Typography.sm, color: Colors.dim, lineHeight: 20, marginBottom: Spacing.sm },
  cardContact:{ fontFamily: Typography.body, fontStyle: 'italic', fontSize: Typography.xs, color: Colors.textMuted, marginBottom: Spacing.sm },
  cardMeta:   { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.sm },
  metaText:   { fontFamily: Typography.body, fontSize: Typography.xs, color: Colors.inkMid },
  cardActions:{ flexDirection: 'row', gap: Spacing.sm, marginTop: 4 },

  // Empty
  emptyIcon:  { fontSize: 36, marginBottom: Spacing.sm },
  emptyTitle: { fontFamily: Typography.serif, fontWeight: 'bold', fontSize: Typography.md, color: Colors.text, textAlign: 'center' },
  emptyBody:  { fontFamily: Typography.body, fontSize: Typography.sm, color: Colors.dim, textAlign: 'center', lineHeight: 20 },

  // Modal
  modalSafe:  { flex: 1, backgroundColor: Colors.background },
  modalHeader:{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontFamily: Typography.serif, fontWeight: 'bold', fontSize: Typography.lg, color: Colors.text, flex: 1, lineHeight: 26 },
  modalClose: { fontFamily: Typography.body, fontSize: Typography.md, color: Colors.dim, paddingLeft: Spacing.md },
  modalBody:  { flex: 1, padding: Spacing.md },
  disclaimer: { fontFamily: Typography.body, fontStyle: 'italic', fontSize: Typography.xs, color: Colors.dim, marginBottom: Spacing.md, lineHeight: 16 },
  fieldLabel: { fontFamily: Typography.body, fontWeight: '600', fontSize: Typography.sm, color: Colors.text, marginTop: Spacing.md, marginBottom: 4 },
  fieldHint:  { fontFamily: Typography.body, fontStyle: 'italic', fontSize: Typography.xs, color: Colors.textMuted },
  input:      { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: Spacing.sm, color: Colors.text, fontFamily: Typography.body, fontSize: Typography.base },
  textarea:   { height: 90, textAlignVertical: 'top' },

  // Buttons
  btn:            { backgroundColor: Colors.primary, borderRadius: Radius.sm, paddingVertical: 10, paddingHorizontal: 20, alignItems: 'center' },
  btnCompact:     { paddingVertical: 7, paddingHorizontal: 16 },
  btnDisabled:    { opacity: 0.5 },
  btnOutline:     { borderWidth: 1, borderColor: Colors.borderMid, borderRadius: Radius.sm, paddingVertical: 7, paddingHorizontal: 16, alignItems: 'center' },
  btnDanger:      { borderColor: Colors.error },
  btnText:        { fontFamily: Typography.body, fontWeight: '600', fontSize: Typography.sm, color: Colors.background },
  btnOutlineText: { fontFamily: Typography.body, fontWeight: '600', fontSize: Typography.sm, color: Colors.textMuted },
  btnDangerText:  { fontFamily: Typography.body, fontWeight: '600', fontSize: Typography.sm, color: Colors.error },

  loadError: { fontFamily: Typography.body, fontStyle: 'italic', fontSize: Typography.xs, color: Colors.wine, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
});
