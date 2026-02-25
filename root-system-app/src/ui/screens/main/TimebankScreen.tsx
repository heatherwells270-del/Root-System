// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Time Bank Screen
//
// Shows balance (derived, not stored), exchange history grouped by status,
// and a simple form to log a new exchange with someone.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  StyleSheet, ActivityIndicator, Alert, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius, CardShadow } from '../../theme/index';
import { getIdentity } from '../../../db/identity';
import {
  getExchangesForKey, getTimebankBalance,
  upsertExchange, confirmExchange, disputeExchange,
} from '../../../db/exchanges';
import { sign, canonicalExchange } from '../../../crypto/keypair';
import type { Exchange, ExchangeStatus } from '../../../models/types';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

// ─── HELPERS ────────────────────────────────────────────────────────────────

function statusLabel(s: ExchangeStatus): string {
  switch (s) {
    case 'pending':     return 'Awaiting confirmation';
    case 'confirmed':   return 'Confirmed';
    case 'unconfirmed': return 'Expired unconfirmed';
    case 'disputed':    return 'Disputed';
    default:            return s;
  }
}

function statusColor(s: ExchangeStatus): string {
  switch (s) {
    case 'confirmed':   return Colors.greenMid;
    case 'pending':     return Colors.gold;
    case 'unconfirmed': return Colors.dim;
    case 'disputed':    return Colors.wine;
    default:            return Colors.dim;
  }
}

function hoursLabel(h: number): string {
  return h === 1 ? '1 hr' : `${h} hrs`;
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7)  return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── COMPONENT ──────────────────────────────────────────────────────────────

type Tab = 'history' | 'log';

export default function TimebankScreen() {
  const [tab, setTab]           = useState<Tab>('history');
  const [loading, setLoading]   = useState(true);
  const [identity, setIdentity] = useState<Awaited<ReturnType<typeof getIdentity>>>(null);
  const [balance, setBalance]   = useState(0);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);

  // Log form
  const [logHandle, setLogHandle]   = useState('');
  const [logPubkey, setLogPubkey]   = useState('');
  const [logHours, setLogHours]     = useState('');
  const [logDesc, setLogDesc]       = useState('');
  const [logEmoji, setLogEmoji]     = useState('');
  const [logDir, setLogDir]         = useState<'gave' | 'received'>('gave');
  const [logSubmitting, setLogSubmitting] = useState(false);

  async function loadData() {
    const id = await getIdentity();
    setIdentity(id);
    if (id) {
      const [bal, exs] = await Promise.all([
        getTimebankBalance(id.publicKey),
        getExchangesForKey(id.publicKey),
      ]);
      setBalance(bal);
      setExchanges(exs);
    }
    setLoading(false);
  }

  // Reload whenever screen is focused
  useFocusEffect(useCallback(() => {
    setLoading(true);
    loadData();
  }, []));

  async function handleLogExchange() {
    if (!identity) return;
    if (!logHandle.trim()) {
      Alert.alert('Missing info', 'Enter the other person\'s handle.');
      return;
    }
    const hours = parseFloat(logHours);
    if (!hours || isNaN(hours) || hours <= 0) {
      Alert.alert('Invalid hours', 'Enter a positive number of hours.');
      return;
    }
    if (!logDesc.trim()) {
      Alert.alert('Missing description', 'Briefly describe what was exchanged.');
      return;
    }

    setLogSubmitting(true);
    try {
      const now = new Date().toISOString();
      const expires = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const communityId = identity.communityIds[0] ?? 'local';

      // logDir: 'gave' = I provided service (from=me, to=them), 'received' = they provided (from=them, to=me)
      const fromKey    = logDir === 'gave' ? identity.publicKey : (logPubkey || `handle:${logHandle.trim()}`);
      const toKey      = logDir === 'gave' ? (logPubkey || `handle:${logHandle.trim()}`) : identity.publicKey;
      const fromHandle = logDir === 'gave' ? (identity.handle || 'Me') : logHandle.trim();
      const toHandle   = logDir === 'gave' ? logHandle.trim() : (identity.handle || 'Me');

      const exchange: Exchange = {
        id: uuidv4(),
        communityId,
        fromPublicKey: fromKey,
        toPublicKey: toKey,
        fromHandle,
        toHandle,
        hours,
        description: logDesc.trim(),
        emoji: logEmoji.trim() || null,
        confirmedByFrom: logDir === 'gave',
        confirmedByTo: logDir === 'received',
        status: 'pending',
        createdAt: now,
        expiresAt: expires,
        confirmedAt: null,
        _sig: '',
        _version: 1,
        _updatedAt: now,
      };

      const msg = canonicalExchange(exchange);
      const sig = await sign(msg);
      exchange._sig = sig;

      await upsertExchange(exchange);

      // Reset form
      setLogHandle(''); setLogPubkey(''); setLogHours('');
      setLogDesc(''); setLogEmoji(''); setLogDir('gave');
      setTab('history');
      loadData();
      Alert.alert(
        'Exchange logged',
        'Pending until the other person confirms. They have 48 hours.'
      );
    } catch (err) {
      Alert.alert('Error', 'Could not log exchange. Try again.');
      console.error(err);
    } finally {
      setLogSubmitting(false);
    }
  }

  async function handleConfirm(id: string) {
    if (!identity) return;
    await confirmExchange(id, identity.publicKey);
    loadData();
  }

  async function handleDispute(id: string) {
    Alert.alert(
      'Dispute exchange?',
      'This marks the exchange as disputed and removes it from balance calculations. Only do this if the exchange did not happen.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dispute',
          style: 'destructive',
          onPress: async () => { await disputeExchange(id); loadData(); },
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Balance header */}
      <View style={styles.balanceHeader}>
        <Text style={styles.balanceLabel}>Your Balance</Text>
        <Text style={[styles.balanceNumber, { color: balance >= 0 ? Colors.greenMid : Colors.wine }]}>
          {balance >= 0 ? '+' : ''}{balance.toFixed(1)}
        </Text>
        <Text style={styles.balanceUnit}>hours</Text>
        <Text style={styles.balanceNote}>
          Derived from {exchanges.filter(e => e.status === 'confirmed').length} confirmed exchange{exchanges.filter(e => e.status === 'confirmed').length === 1 ? '' : 's'}.
          1 hour = 1 hour — no matter what skill.
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['history', 'log'] as Tab[]).map(t => (
          <Pressable
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'history' ? 'History' : 'Log Exchange'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── HISTORY ──────────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <FlatList
          data={exchanges}
          keyExtractor={e => e.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>⏱</Text>
              <Text style={styles.emptyText}>
                No exchanges yet. Every hour you give is an hour you can draw on.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isFrom = identity?.publicKey === item.fromPublicKey;
            const gave   = isFrom; // I provided the service
            const other  = gave ? item.toHandle : item.fromHandle;
            const canConfirm =
              item.status === 'pending' &&
              ((gave && !item.confirmedByFrom) || (!gave && !item.confirmedByTo));

            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]} />
                  <Text style={[styles.statusLabel, { color: statusColor(item.status) }]}>
                    {statusLabel(item.status)}
                  </Text>
                  <Text style={styles.cardDate}>{relativeDate(item.createdAt)}</Text>
                </View>

                <View style={styles.cardMid}>
                  <Text style={styles.hoursDisplay}>
                    {item.emoji ? `${item.emoji} ` : ''}{hoursLabel(item.hours)}
                  </Text>
                  <View style={styles.dirBlock}>
                    <Text style={styles.dirLabel}>{gave ? 'Given to' : 'Received from'}</Text>
                    <Text style={styles.dirHandle}>{other}</Text>
                  </View>
                </View>

                <Text style={styles.exchangeDesc}>{item.description}</Text>

                {(canConfirm || item.status === 'pending') && (
                  <View style={styles.cardActions}>
                    {canConfirm && (
                      <Pressable style={styles.confirmBtn} onPress={() => handleConfirm(item.id)}>
                        <Text style={styles.confirmBtnText}>Confirm</Text>
                      </Pressable>
                    )}
                    {item.status === 'pending' && (
                      <Pressable style={styles.disputeBtn} onPress={() => handleDispute(item.id)}>
                        <Text style={styles.disputeBtnText}>Dispute</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      {/* ── LOG FORM ─────────────────────────────────────────────────────── */}
      {tab === 'log' && (
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.logIntro}>
            Log an exchange with someone in your community.
            Both parties must confirm within 48 hours for it to count.
          </Text>

          {/* Direction */}
          <Text style={styles.fieldLabel}>I…</Text>
          <View style={styles.dirRow}>
            {(['gave', 'received'] as const).map(d => (
              <Pressable
                key={d}
                style={[styles.dirChip, logDir === d && styles.dirChipActive]}
                onPress={() => setLogDir(d)}
              >
                <Text style={[styles.dirChipText, logDir === d && styles.dirChipTextActive]}>
                  {d === 'gave' ? 'gave time/skill' : 'received time/skill'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>
            Other person's handle
          </Text>
          <TextInput
            style={styles.input}
            value={logHandle}
            onChangeText={setLogHandle}
            placeholder="Their handle in this community"
            placeholderTextColor={Colors.dim}
            maxLength={60}
            autoCorrect={false}
          />

          <Text style={styles.fieldLabel}>
            Their public key <Text style={styles.fieldHint}>(optional, helps verify)</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={logPubkey}
            onChangeText={setLogPubkey}
            placeholder="Paste their public key if you have it"
            placeholderTextColor={Colors.dim}
            maxLength={128}
            autoCorrect={false}
            autoCapitalize="none"
          />

          <Text style={styles.fieldLabel}>Hours</Text>
          <TextInput
            style={styles.input}
            value={logHours}
            onChangeText={v => setLogHours(v.replace(/[^0-9.]/g, ''))}
            placeholder="e.g. 1.5"
            placeholderTextColor={Colors.dim}
            keyboardType="decimal-pad"
            maxLength={5}
          />

          <Text style={styles.fieldLabel}>What was exchanged?</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={logDesc}
            onChangeText={setLogDesc}
            placeholder="Brief description — e.g. 'Helped move furniture', 'Language tutoring session'"
            placeholderTextColor={Colors.dim}
            multiline
            numberOfLines={3}
            maxLength={300}
            textAlignVertical="top"
          />

          <Text style={styles.fieldLabel}>
            Emoji <Text style={styles.fieldHint}>(optional)</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={logEmoji}
            onChangeText={setLogEmoji}
            placeholder="🌿"
            placeholderTextColor={Colors.dim}
            maxLength={4}
          />

          <Pressable
            style={[styles.submitBtn, logSubmitting && styles.submitBtnDisabled]}
            onPress={handleLogExchange}
            disabled={logSubmitting}
          >
            {logSubmitting
              ? <ActivityIndicator color={Colors.greenDeep} />
              : <Text style={styles.submitBtnText}>Log Exchange</Text>
            }
          </Pressable>

          <Text style={styles.footerNote}>
            Time banking is non-commercial. Hours aren't wages — they're community credit.
            They can't be bought or sold.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── STYLES ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Balance header
  balanceHeader: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  balanceLabel: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.dim,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  balanceNumber: {
    fontFamily: Typography.serifBold,
    fontSize: 48,
    lineHeight: 56,
  },
  balanceUnit: {
    fontFamily: Typography.bodyItalic,
    fontSize: Typography.sm,
    color: Colors.dim,
    marginBottom: Spacing.xs,
  },
  balanceNote: {
    fontFamily: Typography.bodyItalic,
    fontSize: Typography.xs,
    color: Colors.dim,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 18,
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
  tabText: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.dim,
  },
  tabTextActive: { color: Colors.gold },

  listContent: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },

  // Exchange card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    ...CardShadow,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.sm },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontFamily: Typography.bodySemi, fontSize: Typography.xs, flex: 1 },
  cardDate: { fontFamily: Typography.bodyItalic, fontSize: Typography.xs, color: Colors.dim },
  cardMid: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  hoursDisplay: {
    fontFamily: Typography.serifBold,
    fontSize: Typography.xl,
    color: Colors.cream,
    minWidth: 60,
  },
  dirBlock: { flex: 1 },
  dirLabel: { fontFamily: Typography.bodyItalic, fontSize: Typography.xs, color: Colors.dim },
  dirHandle: { fontFamily: Typography.bodySemi, fontSize: Typography.sm, color: Colors.cream },
  exchangeDesc: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.moonsilver,
    lineHeight: 20,
  },
  cardActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  confirmBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(61,107,46,0.2)',
    borderWidth: 1,
    borderColor: Colors.greenMid,
  },
  confirmBtnText: {
    fontFamily: Typography.bodySemi,
    fontSize: Typography.xs,
    color: Colors.greenMid,
  },
  disputeBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.wine,
  },
  disputeBtnText: {
    fontFamily: Typography.bodySemi,
    fontSize: Typography.xs,
    color: Colors.wine,
  },

  // Empty
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: Spacing.xxl, gap: Spacing.md },
  emptyIcon: { fontSize: 32 },
  emptyText: {
    fontFamily: Typography.bodyItalic,
    fontSize: Typography.base,
    color: Colors.dim,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 24,
  },

  // Log form
  logIntro: {
    fontFamily: Typography.bodyItalic,
    fontSize: Typography.sm,
    color: Colors.moonsilver,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  fieldLabel: {
    fontFamily: Typography.bodySemi,
    fontSize: Typography.sm,
    color: Colors.cream,
    marginBottom: 6,
    marginTop: Spacing.md,
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
  dirRow: { flexDirection: 'row', gap: Spacing.sm },
  dirChip: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  dirChipActive: {
    borderColor: Colors.gold,
    backgroundColor: 'rgba(196,152,46,0.12)',
  },
  dirChipText: { fontFamily: Typography.body, fontSize: Typography.sm, color: Colors.dim },
  dirChipTextActive: { color: Colors.gold },
  submitBtn: {
    backgroundColor: Colors.gold,
    paddingVertical: Spacing.md,
    borderRadius: Radius.sm,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  submitBtnDisabled: { backgroundColor: 'rgba(196,152,46,0.2)' },
  submitBtnText: {
    fontFamily: Typography.serifBold,
    fontSize: Typography.md,
    color: Colors.greenDeep,
    letterSpacing: 0.5,
  },
  footerNote: {
    fontFamily: Typography.bodyItalic,
    fontSize: Typography.xs,
    color: Colors.dim,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
} as const);
