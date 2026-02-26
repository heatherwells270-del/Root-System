// ═══════════════════════════════════════════════════════════════════════════
// ROOTS — Create Community Screen
//
// Organizer flow. Generates a community key, creates the community record,
// stores it locally, and transitions to Main.
//
// lat/lng are stubbed at 0,0 for v1 — geodecoding is Phase 2.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../../../App';
import { Colors, Typography, Spacing, Radius } from '../../theme/index';
import { getIdentity, addCommunityId } from '../../../db/identity';
import { upsertCommunity } from '../../../db/communities';
import { sign, canonicalCommunity } from '../../../crypto/keypair';
import { generateCommunityKey } from '../../../crypto/encrypt';
import { storeCommunityKey, startSync } from '../../../sync/index';
import { emitAppEvent } from '../../appEvents';
import type { Community } from '../../../models/types';

type Props = StackScreenProps<RootStackParamList, 'CreateCommunity'>;

const DEFAULT_GUIDELINES = `This community is built on mutual aid — sharing freely, without expectation of return.

We agree to:
• Share what we can, ask for what we need, without shame on either side.
• Treat each other as whole people, not service providers.
• Honor our word. If you offer, follow through. If you can't, say so.
• Keep private what is shared in trust.
• Use flagging to protect the community, not to silence disagreement.

One hour of labor equals one hour of labor. No exceptions.`;

async function generateCommunityId(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  const hex = Array.from(new Uint8Array(bytes))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export default function CreateCommunityScreen({ navigation }: Props) {
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [guidelines,  setGuidelines]  = useState(DEFAULT_GUIDELINES);
  const [zip,         setZip]         = useState('');
  const [zonesRaw,    setZonesRaw]    = useState('');   // comma-separated
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  // Pre-fill zip from identity
  useEffect(() => {
    getIdentity().then(id => {
      if (id?.location?.zip) setZip(id.location.zip);
    });
  }, []);

  async function handleCreate() {
    if (!name.trim()) { setError('A community needs a name.'); return; }
    if (!guidelines.trim()) { setError('Community guidelines are required — they define how your community operates.'); return; }

    setLoading(true);
    setError(null);

    try {
      const identity = await getIdentity();
      if (!identity) throw new Error('No identity found');

      const communityId = await generateCommunityId();
      const now = new Date().toISOString();

      const zoneNames = zonesRaw.split(',')
        .map(z => z.trim())
        .filter(Boolean);

      const community: Community = {
        id:                    communityId,
        name:                  name.trim(),
        description:           description.trim(),
        zipCodes:              zip.trim() ? [zip.trim()] : [],
        lat:                   0,   // TODO Phase 2: geocode from zip
        lng:                   0,
        radiusMiles:           25,
        planterPublicKey:      identity.publicKey,
        planterHandle:         identity.handle ?? '',
        communityKeyEncrypted: null,
        covenantText:          guidelines.trim(),
        zoneNames,
        anchorDevices:         [],
        createdAt:             now,
        status:                'active',
        _sig:                  '',   // signed below
        _version:              1,
        _updatedAt:            now,
      };

      const canonical = canonicalCommunity({
        id:               community.id,
        name:             community.name,
        planterPublicKey: community.planterPublicKey,
        createdAt:        community.createdAt,
      });
      community._sig = await sign(canonical);

      const communityKey = await generateCommunityKey();
      await storeCommunityKey(communityId, communityKey);

      await upsertCommunity(community);
      await addCommunityId(communityId);

      await startSync(communityId);

      emitAppEvent('community-ready');

    } catch (e) {
      console.error('[CreateCommunity]', e);
      setError('Something went wrong. Please try again.');
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
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>

        <Text style={styles.eyebrow}>Start a community</Text>
        <Text style={styles.title}>Name your community</Text>
        <Text style={styles.subtitle}>
          You're starting this community. These settings define how
          others will find and join it.
        </Text>

        {/* Name */}
        <Text style={styles.label}>Community name <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Northside Mutual Aid"
          placeholderTextColor={Colors.textMuted}
          maxLength={100}
          autoCorrect={false}
        />

        {/* Description */}
        <Text style={styles.label}>Description <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={description}
          onChangeText={v => setDescription(v.slice(0, 500))}
          placeholder="What is this community about?"
          placeholderTextColor={Colors.textMuted}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          maxLength={500}
        />

        {/* Zip code */}
        <Text style={styles.label}>ZIP code <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={styles.input}
          value={zip}
          onChangeText={t => setZip(t.replace(/\D/g, '').slice(0, 5))}
          placeholder="Primary area code"
          placeholderTextColor={Colors.textMuted}
          keyboardType="number-pad"
          maxLength={5}
        />
        <Text style={styles.hint}>
          Used to help members find this community. Not required.
        </Text>

        {/* Zones */}
        <Text style={styles.label}>Zones <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={styles.input}
          value={zonesRaw}
          onChangeText={setZonesRaw}
          placeholder="e.g. North, South, Downtown"
          placeholderTextColor={Colors.textMuted}
          autoCorrect={false}
        />
        <Text style={styles.hint}>
          Comma-separated neighborhood or district names. Members can post to a specific zone
          or "Any / Network-wide."
        </Text>

        {/* Guidelines */}
        <Text style={styles.label}>Community guidelines <Text style={styles.required}>*</Text></Text>
        <Text style={styles.guidelinesNote}>
          New members read and accept this before joining. The default reflects the
          spirit of mutual aid — you can edit it to fit your community.
        </Text>
        <TextInput
          style={[styles.input, styles.guidelinesArea]}
          value={guidelines}
          onChangeText={setGuidelines}
          multiline
          textAlignVertical="top"
          placeholderTextColor={Colors.textMuted}
        />

        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}

        <Pressable
          style={[styles.createBtn, loading && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={loading}
          accessibilityRole="button"
        >
          {loading
            ? <ActivityIndicator color={Colors.textOnDark} />
            : <Text style={styles.createBtnText}>Create community</Text>
          }
        </Pressable>

        <Text style={styles.footer}>
          You can update the name, description, and zones anytime from My Root → Settings.
          Guidelines cannot be changed once members have joined.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  scroll:  { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },

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
    marginTop: Spacing.md,
  },
  required: { color: Colors.error, textTransform: 'none', fontWeight: 'normal' },
  optional: { color: Colors.textMuted, fontStyle: 'italic', textTransform: 'none', fontWeight: 'normal' },
  hint: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 16,
    marginTop: 3,
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
  textarea:       { minHeight: 80, paddingTop: 10, textAlignVertical: 'top' },
  guidelinesArea: { minHeight: 220, paddingTop: 10 },
  guidelinesNote: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    marginBottom: Spacing.xs,
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.error,
    marginVertical: Spacing.md,
    textAlign: 'center',
  },
  createBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: Radius.sm,
    alignItems: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  createBtnDisabled: { backgroundColor: Colors.primaryLight },
  createBtnText: {
    fontFamily: Typography.serif,
    fontWeight: 'bold',
    fontSize: Typography.md,
    color: Colors.textOnDark,
  },
  footer: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: Spacing.sm,
  },
});
