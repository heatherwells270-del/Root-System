// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Time Bank Screen
//
// Shows balance (derived, not stored), exchange history grouped by status,
// and a simple form to log a new exchange with someone.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  StyleSheet, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { Colors, Typography, Spacing, Radius, CardShadow } from '../../theme/index';
import { getIdentity } from '../../../db/identity';
import {
  getExchangesForKey, getTimebankStats,
  upsertExchange, confirmExchange, disputeExchange,
} from '../../../db/exchanges';
import type { TimebankStats } from '../../../db/exchanges';
import { sign, canonicalExchange } from '../../../crypto/keypair';
import type { Exchange, ExchangeStatus } from '../../../models/types';
import * as Crypto from 'expo-crypto';

// ─── HELPERS ────────────────────────────────────────────────────────────────

function statusLabel(s: ExchangeStatus): string {
  switch (s) {
    case 'pending':     return 'Unconfirmed';
    case 'confirmed':   return 'Confirmed';
    case 'unconfirmed': return 'Expired unconfirmed';
    case 'disputed':    return 'Disputed';
    default:            return s;
  }
}

function statusColor(s: ExchangeStatus): string {
  switch (s) {
    case 'confirmed':   return Colors.primaryMid;
    case 'pending':     return Colors.warning;
    case 'unconfirmed': return Colors.textMuted;
    case 'disputed':    return Colors.error;
    default:            return Colors.textMuted;
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
  const [tab, setTab]             = useState<Tab>('history');
  const [loading, setLoading]     = useState(true);
  const [identity, setIdentity]   = useState<Awaited<ReturnType<typeof getIdentity>>>(null);
  const [tbStats, setTbStats]     = useState<TimebankStats>({ given: 0, received: 0 });
  const [exchanges, setExchanges] = useState<Exchange[]>([]);

  // Log form
  const [logHandle, setLogHandle]   = useState('');
  const [logPubkey, setLogPubkey]   = useState('');
  const [logHours, setLogHours]     = useState('');
  const [logDesc, setLogDesc]       = useState('');
  const [logEmoji, setLogEmoji]     = useState('');
  const [logDir, setLogDir]         = useState<'gave' | 'received'>('gave');
  const [logSubmitting, setLogSubmitting] = useState(false);
  const [refreshing,    setRefreshing]    = useState(false);
  const [loadError,     setLoadError]     = useState<string | null>(null);
  const [confirmToast,  setConfirmToast]  = useState<{
    hours: number; other: string; fullyConfirmed: boolean;
  } | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up pending confirm toast timer on unmount
  useEffect(() => {
    return () => { if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current); };
  }, []);

  const loadData = useCallback(async () => {
    try {
      const id = await getIdentity();
      setIdentity(id);
      if (id) {
        const [stats, exs] = await Promise.all([
          getTimebankStats(id.publicKey),
          getExchangesForKey(id.publicKey),
        ]);
        setTbStats(stats);
        setExchanges(exs);
      }
      setLoadError(null);
    } catch (e) {
      console.error('[TimebankScreen] load failed', e);
      setLoadError('Could not load. Pull down to retry.');
    }
  }, []);

  // Reload whenever screen is focused
  useFocusEffect(useCallback(() => {
    setLoading(true);
    void loadData().finally(() => setLoading(false));
  }, [loadData]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

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
        id: Crypto.randomUUID(),
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
      void loadData();
      Alert.alert(
        'Exchange logged',
        'Saved to your personal record. Ask the other person to log their side so you can both confirm it.'
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
    try {
      const ex = exchanges.find(e => e.id === id);
      await confirmExchange(id, identity.publicKey);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (ex) {
        const gave = identity.publicKey === ex.fromPublicKey;
        const other = gave ? ex.toHandle : ex.fromHandle;
        const otherAlreadyConfirmed = gave ? ex.confirmedByTo : ex.confirmedByFrom;
        if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
        setConfirmToast({ hours: ex.hours, other, fullyConfirmed: otherAlreadyConfirmed });
        confirmTimerRef.current = setTimeout(() => setConfirmToast(null), 3000);
      }
      void loadData();
    } catch (e) {
      Alert.alert('Error', 'Could not confirm exchange. Try again.');
      console.error('[TimebankScreen] confirm failed', e);
    }
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
          onPress: async () => { await disputeExchange(id); void loadData(); },
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {loadError && (
        <Text style={styles.loadError}>{loadError}</Text>
      )}
      {/* Time commons header */}
      <View style={styles.balanceHeader}>
        <Text style={styles.balanceLabel}>Time Bank</Text>
        <View style={styles.statsRow}>
          <View style={styles.statBlock}>
            <Text style={styles.statNumber}>{tbStats.given.toFixed(1)}</Text>
            <Text style={styles.statUnit}>hrs given</Text>
          </View>
          <Text style={styles.statDivider}>·</Text>
          <View style={styles.statBlock}>
            <Text style={styles.statNumber}>{tbStats.received.toFixed(1)}</Text>
            <Text style={styles.statUnit}>hrs received</Text>
          </View>
        </View>
        <Text style={styles.balanceNote}>
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
        <FlashList
          data={exchanges}
          keyExtractor={(e: Exchange) => e.id}
          estimatedItemSize={130}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>⏱</Text>
              <Text style={styles.emptyText}>
                No exchanges yet. Every hour you give is an hour you can draw on.
              </Text>
              <Pressable
                style={styles.emptyBtn}
                onPress={() => setTab('log')}
                accessibilityRole="button"
              >
                <Text style={styles.emptyBtnText}>Log your first exchange</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }: { item: Exchange }) => {
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
      {/* ── CONFIRMATION TOAST ───────────────────────────────────────────── */}
      {confirmToast && (
        <View style={styles.confirmOverlay} pointerEvents="none">
          <View style={styles.confirmCard}>
            <Text style={styles.confirmIcon}>✦</Text>
            <Text style={styles.confirmTitle}>
              {confirmToast.fullyConfirmed ? 'Exchange confirmed' : 'Your side confirmed'}
            </Text>
            <Text style={styles.confirmBody}>
              {confirmToast.hours === 1 ? '1 hr' : `${confirmToast.hours} hrs`} with {confirmToast.other}.
            </Text>
            <Text style={styles.confirmSub}>
              {confirmToast.fullyConfirmed
                ? 'Both sides confirmed. This is what the root is made of.'
                : 'Your side confirmed. Ask the other person to log and confirm their side.'}
            </Text>
          </View>
        </View>
      )}

      {tab === 'log' && (
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.logIntro}>
            Log an exchange with someone in your community.
            This is your personal record — each person logs and confirms their own side.
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
              ? <ActivityIndicator color={Colors.textOnDark} />
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

  // Time bank header
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
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.xs,
  },
  statBlock: {
    alignItems: 'center',
  },
  statNumber: {
    fontFamily: Typography.serif,
    fontWeight: 'bold',
    fontSize: 36,
    lineHeight: 42,
    color: Colors.text,
  },
  statUnit: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.textMuted,
  },
  statDivider: {
    fontFamily: Typography.body,
    fontSize: Typography.lg,
    color: Colors.border,
    marginBottom: 8,
  },
  balanceNote: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.textMuted,
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
  tabActive: { borderBottomColor: Colors.primary },
  tabText: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.textMuted,
  },
  tabTextActive: { color: Colors.primary },

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
  statusLabel: { fontFamily: Typography.body, fontWeight: '600', fontSize: Typography.xs, flex: 1 },
  cardDate: { fontFamily: Typography.body, fontStyle: 'italic', fontSize: Typography.xs, color: Colors.textMuted },
  cardMid: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  hoursDisplay: {
    fontFamily: Typography.serif,
    fontWeight: 'bold',
    fontSize: Typography.xl,
    color: Colors.text,
    minWidth: 60,
  },
  dirBlock: { flex: 1 },
  dirLabel: { fontFamily: Typography.body, fontStyle: 'italic', fontSize: Typography.xs, color: Colors.textMuted },
  dirHandle: { fontFamily: Typography.body, fontWeight: '600', fontSize: Typography.sm, color: Colors.text },
  exchangeDesc: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.textMuted,
    lineHeight: 20,
  },
  cardActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  confirmBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primaryMid,
  },
  confirmBtnText: {
    fontFamily: Typography.body,
    fontWeight: '600',
    fontSize: Typography.xs,
    color: Colors.primaryMid,
  },
  disputeBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.error,
  },
  disputeBtnText: {
    fontFamily: Typography.body,
    fontWeight: '600',
    fontSize: Typography.xs,
    color: Colors.error,
  },

  // Empty
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: Spacing.xxl, gap: Spacing.md },
  emptyIcon: { fontSize: 32 },
  emptyText: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.base,
    color: Colors.textMuted,
    textAlign: 'center',
    maxWidth: 260,
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

  // Confirmation toast overlay
  confirmOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  confirmCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: Radius.md,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.xs,
    maxWidth: 280,
    marginHorizontal: Spacing.xl,
  },
  confirmIcon: {
    fontSize: 26,
    color: Colors.primary,
    fontFamily: Typography.serif,
    marginBottom: Spacing.xs,
  },
  confirmTitle: {
    fontFamily: Typography.serif,
    fontWeight: 'bold',
    fontSize: Typography.lg,
    color: Colors.text,
  },
  confirmBody: {
    fontFamily: Typography.serif,
    fontWeight: 'bold',
    fontSize: Typography.md,
    color: Colors.primary,
    textAlign: 'center',
  },
  confirmSub: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 2,
  },

  // Log form
  logIntro: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.sm,
    color: Colors.textMuted,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  fieldLabel: {
    fontFamily: Typography.body,
    fontWeight: '600',
    fontSize: Typography.sm,
    color: Colors.text,
    marginBottom: 6,
    marginTop: Spacing.md,
  },
  fieldHint: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.textMuted,
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
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  dirChipText: { fontFamily: Typography.body, fontSize: Typography.sm, color: Colors.textMuted },
  dirChipTextActive: { color: Colors.primary },
  submitBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: Radius.sm,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  submitBtnDisabled: { backgroundColor: Colors.primaryLight },
  submitBtnText: {
    fontFamily: Typography.serif,
    fontWeight: 'bold',
    fontSize: Typography.md,
    color: Colors.textOnDark,
    letterSpacing: 0.5,
  },
  footerNote: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: Spacing.md,
    paddingBottom: Spacing.lg,
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
