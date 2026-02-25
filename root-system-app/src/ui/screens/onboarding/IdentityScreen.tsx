// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Identity Setup Screen
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
import { generateKeypair, generateDeviceId } from '../../../crypto/keypair';
import { saveIdentity } from '../../../db/identity';
import type { Identity } from '../../../models/types';

type Props = StackScreenProps<RootStackParamList, 'Identity'>;

export default function IdentityScreen({ navigation }: Props) {
  const [handle,  setHandle]  = useState('');
  const [zip,     setZip]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleEnter() {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      // Generate keypair — private key goes to SecureStore, never returned
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
        communityIds:  [],
      };

      await saveIdentity(identity);
      navigation.replace('Main');
    } catch (e) {
      setError('Something went wrong setting up your identity. Please try again.');
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
        <Text style={styles.eyebrow}>Root System</Text>
        <Text style={styles.title}>Who are you in the commons?</Text>
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
            placeholderTextColor={Colors.dim}
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
            placeholderTextColor={Colors.dim}
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
            When you tap "Enter the Commons," a cryptographic keypair is
            generated on your device. Your private key is stored in your
            device's secure storage and never transmitted anywhere.
            Your public key is your identity on the network —
            it lets others verify that posts came from you.
          </Text>
          <Text style={[styles.keyNoticeText, { marginTop: Spacing.sm }]}>
            You can set up recovery (to restore your identity on a new device)
            at any time from My Root → Settings.
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
            ? <ActivityIndicator color={Colors.greenDeep} />
            : <Text style={styles.enterBtnText}>Enter the Commons</Text>
          }
        </Pressable>

        <Text style={styles.skipNote}>
          You can skip everything above and still use Root System fully.
        </Text>
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
  eyebrow: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.gold,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  title: {
    fontFamily: Typography.serifBold,
    fontSize: Typography.xl,
    color: Colors.cream,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontFamily: Typography.bodyItalic,
    fontSize: Typography.base,
    color: Colors.dim,
    lineHeight: 24,
    marginBottom: Spacing.lg,
  },
  fieldGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontFamily: Typography.bodySemi,
    fontSize: Typography.sm,
    color: Colors.moonsilver,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontFamily: Typography.body,
    fontSize: Typography.base,
    color: Colors.cream,
    marginBottom: Spacing.xs,
  },
  hint: {
    fontFamily: Typography.bodyItalic,
    fontSize: Typography.xs,
    color: Colors.dim,
    lineHeight: 16,
  },
  keyNotice: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  keyNoticeTitle: {
    fontFamily: Typography.serifBold,
    fontSize: Typography.md,
    color: Colors.gold,
    marginBottom: Spacing.xs,
  },
  keyNoticeText: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.moonsilver,
    lineHeight: 20,
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.redAccent,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  enterBtn: {
    backgroundColor: Colors.gold,
    paddingVertical: Spacing.md,
    borderRadius: 4,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  enterBtnText: {
    fontFamily: Typography.serifBold,
    fontSize: Typography.md,
    color: Colors.greenDeep,
    letterSpacing: 0.5,
  },
  skipNote: {
    fontFamily: Typography.bodyItalic,
    fontSize: Typography.xs,
    color: Colors.dim,
    textAlign: 'center',
  },
});
