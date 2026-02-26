// ═══════════════════════════════════════════════════════════════════════════
// ROOTS — Join Community Screen
//
// Joiner flow. Decodes the invite code (base64 of `${communityId}:${planterPublicKey}`),
// creates a stub community record, starts sync, and transitions to Main.
// The community key arrives asynchronously when the planter approves —
// syncing works in degraded mode until then.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../../../App';
import { Colors, Typography, Spacing, Radius } from '../../theme/index';
import { getIdentity, addCommunityId } from '../../../db/identity';
import { upsertCommunity } from '../../../db/communities';
import { startSync } from '../../../sync/index';
import { emitAppEvent } from '../../appEvents';
import type { Community } from '../../../models/types';

type Props = StackScreenProps<RootStackParamList, 'JoinCommunity'>;

function decodeInviteCode(code: string): { communityId: string; planterPublicKey: string } | null {
  try {
    // Invite code = base64(`${communityId}:${planterPublicKey}`)
    // communityId uses dashes internally — split on the FIRST colon only
    const decoded = atob(code.trim());
    const colonIdx = decoded.indexOf(':');
    if (colonIdx === -1) return null;
    const communityId      = decoded.slice(0, colonIdx);
    const planterPublicKey = decoded.slice(colonIdx + 1);
    if (!communityId || planterPublicKey.length < 32) return null;
    return { communityId, planterPublicKey };
  } catch {
    return null;
  }
}

export default function JoinCommunityScreen({ navigation }: Props) {
  const [code,    setCode]    = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleJoin() {
    const trimmed = code.trim();
    if (!trimmed) { setError('Paste the invite code from your organizer.'); return; }

    const parsed = decodeInviteCode(trimmed);
    if (!parsed) {
      setError('That doesn\'t look like a valid invite code. Make sure you copied the whole thing.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const identity = await getIdentity();
      if (!identity) throw new Error('No identity found');

      const { communityId, planterPublicKey } = parsed;
      const now = new Date().toISOString();

      const stub: Community = {
        id:                    communityId,
        name:                  'Joining…',
        description:           '',
        zipCodes:              [],
        lat:                   0,
        lng:                   0,
        radiusMiles:           25,
        planterPublicKey,
        planterHandle:         '',
        communityKeyEncrypted: null,
        covenantText:          '',
        zoneNames:             [],
        anchorDevices:         [],
        createdAt:             now,
        status:                'active',
        _sig:                  '',
        _version:              0,
        _updatedAt:            now,
      };

      await upsertCommunity(stub);
      await addCommunityId(communityId);

      await startSync(communityId);

      emitAppEvent('community-ready');

    } catch (e) {
      console.error('[JoinCommunity]', e);
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>

        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>

        <Text style={styles.eyebrow}>Join a community</Text>
        <Text style={styles.title}>Enter your invite code</Text>
        <Text style={styles.subtitle}>
          Your organizer will share an invite code with you — usually over a messaging
          app, in person, or on a community flyer.
          Paste it here to request membership.
        </Text>

        <Text style={styles.label}>Invite code</Text>
        <TextInput
          style={[styles.input, styles.codeInput]}
          value={code}
          onChangeText={setCode}
          placeholder="Paste code here"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}

        <Pressable
          style={[styles.joinBtn, loading && styles.joinBtnDisabled]}
          onPress={handleJoin}
          disabled={loading}
          accessibilityRole="button"
        >
          {loading
            ? <ActivityIndicator color={Colors.textOnDark} />
            : <Text style={styles.joinBtnText}>Request to join</Text>
          }
        </Pressable>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>What happens next?</Text>
          <Text style={styles.infoText}>
            Your request is sent to the organizer. When they approve it, your device
            receives the community encryption key and you'll start seeing posts.
            This may take a moment if the organizer is offline.
          </Text>
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1, padding: Spacing.lg },

  backBtn:     { marginBottom: Spacing.lg },
  backBtnText: { fontFamily: Typography.body, fontWeight: '600', fontSize: Typography.sm, color: Colors.primary },

  eyebrow: {
    fontFamily: Typography.body,
    fontWeight: '600',
    fontSize: Typography.sm,
    color: Colors.primary,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  title: {
    fontFamily: Typography.serif,
    fontWeight: 'bold',
    fontSize: 26,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.base,
    color: Colors.textMuted,
    lineHeight: 24,
    marginBottom: Spacing.xl,
  },
  label: {
    fontFamily: Typography.body,
    fontWeight: '600',
    fontSize: Typography.sm,
    color: Colors.textMid,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontFamily: Typography.body,
    fontSize: Typography.base,
    color: Colors.text,
  },
  codeInput: {
    minHeight: 80,
    paddingTop: 10,
    fontSize: Typography.xs,
    letterSpacing: 0.5,
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.error,
    marginVertical: Spacing.md,
    textAlign: 'center',
  },
  joinBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: Radius.sm,
    alignItems: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  joinBtnDisabled: { backgroundColor: Colors.primaryLight },
  joinBtnText: {
    fontFamily: Typography.serif,
    fontWeight: 'bold',
    fontSize: Typography.md,
    color: Colors.textOnDark,
  },
  infoBox: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    padding: Spacing.md,
  },
  infoTitle: {
    fontFamily: Typography.serif,
    fontWeight: 'bold',
    fontSize: Typography.md,
    color: Colors.textMid,
    marginBottom: Spacing.xs,
  },
  infoText: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.textMuted,
    lineHeight: 22,
  },
});
