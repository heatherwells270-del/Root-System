// ═══════════════════════════════════════════════════════════════════════════
// ROOTS — Identity Setup Screen
//
// Generates the keypair silently. Asks for optional handle and location.
// Everything is optional — anonymous is fine. No dark patterns.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../../../App';
import { Colors, Typography, Spacing } from '../../theme/index';
import { generateKeypair, generateDeviceId, restoreFromRecoveryKey } from '../../../crypto/keypair';
import { saveIdentity } from '../../../db/identity';
import { emitAppEvent } from '../../appEvents';
import type { Identity } from '../../../models/types';

type Props = StackScreenProps<RootStackParamList, 'Identity'>;

export default function IdentityScreen({ navigation }: Props) {
  const [handle,  setHandle]  = useState('');
  const [zip,     setZip]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Restore from backup
  const [showRestore,  setShowRestore]  = useState(false);
  const [backupStr,    setBackupStr]    = useState('');
  const [restorePass,  setRestorePass]  = useState('');
  const [restoring,    setRestoring]    = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  async function handleRestore() {
    if (restoring) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      const publicKey = await restoreFromRecoveryKey(backupStr.trim(), restorePass);
      const deviceId  = await generateDeviceId();
      const now       = new Date().toISOString();
      const identity: Identity = {
        publicKey,
        deviceId,
        createdAt:          now,
        handle:             null,
        bio:                null,
        location:           null,
        recoveryEmail:      null,
        communityIds:       [],
        covenantAcceptedAt: now,
      };
      await saveIdentity(identity);
      emitAppEvent('identity-created');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Restore failed. Check your backup string and passphrase.';
      setRestoreError(msg);
      setRestoring(false);
    }
  }

  async function handleEnter() {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const publicKey = await generateKeypair();
      const deviceId  = await generateDeviceId();
      const now       = new Date().toISOString();

      const identity: Identity = {
        publicKey,
        deviceId,
        createdAt:     now,
        handle:        handle.trim() || null,
        bio:           null,
        location:      zip.trim() ? { zip: zip.trim(), city: null, state: null, lat: null, lng: null } : null,
        recoveryEmail: null,
        communityIds:       [],
        covenantAcceptedAt: now,
      };

      await saveIdentity(identity);
      emitAppEvent('identity-created');
    } catch (e) {
      console.error('[Identity] setup failed:', e);
      setError('Something went wrong setting up your profile. Please try again.');
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.appName}>Roots</Text>
        <Text style={styles.title}>Set up your profile</Text>
        <Text style={styles.subtitle}>
          Everything here is optional. Anonymous is fine.
          You can add or change this anytime from My Root.
        </Text>

        {/* Handle */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Name or handle</Text>
          <TextInput
            style={styles.input}
            value={handle}
            onChangeText={setHandle}
            placeholder="Anonymous is fine"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={40}
          />
          <Text style={styles.hint}>Visible on your posts. A pseudonym is fine.</Text>
        </View>

        {/* Zip code */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Zip code (optional)</Text>
          <TextInput
            style={styles.input}
            value={zip}
            onChangeText={t => setZip(t.replace(/\D/g, '').slice(0, 5))}
            placeholder="For finding your community"
            placeholderTextColor={Colors.textMuted}
            keyboardType="number-pad"
            maxLength={5}
          />
          <Text style={styles.hint}>
            Stays on your device. Used only to show posts near you.
          </Text>
        </View>

        {/* Key generation notice */}
        <View style={styles.keyNotice}>
          <Text style={styles.keyNoticeTitle}>Your identity key</Text>
          <Text style={styles.keyNoticeText}>
            When you tap "Get started," a cryptographic keypair is
            generated on your device. Your private key is stored in your
            device's secure storage and never transmitted anywhere.
            Your public key is your identity on the network —
            it lets others verify that posts came from you.
          </Text>
        </View>

        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}

        <Pressable
          style={styles.enterBtn}
          onPress={handleEnter}
          disabled={loading}
          accessibilityRole="button"
        >
          {loading
            ? <ActivityIndicator color={Colors.textOnDark} />
            : <Text style={styles.enterBtnText}>Get started</Text>
          }
        </Pressable>

        <Text style={styles.skipNote}>
          You can skip everything above and still use Roots fully.
        </Text>

        {/* Restore from backup */}
        <Pressable
          style={styles.restoreToggle}
          onPress={() => { setShowRestore(v => !v); setRestoreError(null); }}
          accessibilityRole="button"
        >
          <Text style={styles.restoreToggleText}>
            {showRestore ? 'Cancel restore' : 'Restore from backup'}
          </Text>
        </Pressable>

        {showRestore && (
          <View style={styles.restoreForm}>
            <Text style={styles.restoreFormTitle}>Restore your account</Text>
            <Text style={styles.restoreFormHint}>
              Paste your recovery string (starts with rsrc_v1:) and enter the passphrase you used when backing up.
            </Text>
            <TextInput
              style={[styles.input, styles.restoreTextArea]}
              value={backupStr}
              onChangeText={setBackupStr}
              placeholder="rsrc_v1:..."
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
            />
            <TextInput
              style={styles.input}
              value={restorePass}
              onChangeText={setRestorePass}
              placeholder="Passphrase"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            {restoreError && (
              <Text style={styles.errorText}>{restoreError}</Text>
            )}
            <Pressable
              style={styles.restoreBtn}
              onPress={handleRestore}
              disabled={restoring || backupStr.trim().length === 0 || restorePass.length === 0}
              accessibilityRole="button"
            >
              {restoring
                ? <ActivityIndicator color={Colors.textOnDark} />
                : <Text style={styles.restoreBtnText}>Restore account</Text>
              }
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: { flex: 1 },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  appName: {
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
    fontSize: Typography.xl,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.base,
    color: Colors.textMuted,
    lineHeight: 24,
    marginBottom: Spacing.lg,
  },
  fieldGroup: {
    marginBottom: Spacing.lg,
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
    borderRadius: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontFamily: Typography.body,
    fontSize: Typography.base,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  hint: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  keyNotice: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  keyNoticeTitle: {
    fontFamily: Typography.serif,
    fontWeight: 'bold',
    fontSize: Typography.md,
    color: Colors.textMid,
    marginBottom: Spacing.xs,
  },
  keyNoticeText: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.textMuted,
    lineHeight: 20,
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.error,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  enterBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: 6,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  enterBtnText: {
    fontFamily: Typography.serif,
    fontWeight: 'bold',
    fontSize: Typography.md,
    color: Colors.textOnDark,
  },
  skipNote: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  restoreToggle: {
    alignSelf: 'center',
    marginTop: Spacing.md,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  restoreToggleText: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.primary,
    textDecorationLine: 'underline',
  },
  restoreForm: {
    marginTop: Spacing.md,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    padding: Spacing.md,
  },
  restoreFormTitle: {
    fontFamily: Typography.serif,
    fontWeight: 'bold',
    fontSize: Typography.md,
    color: Colors.textMid,
    marginBottom: Spacing.xs,
  },
  restoreFormHint: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 16,
    marginBottom: Spacing.md,
  },
  restoreTextArea: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  restoreBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.sm + 2,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  restoreBtnText: {
    fontFamily: Typography.serif,
    fontWeight: 'bold',
    fontSize: Typography.md,
    color: Colors.textOnDark,
  },
});
