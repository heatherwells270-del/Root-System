// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Covenant Screen
//
// The gate. Must be accepted before anything else. No dark patterns —
// every rule is readable, the checkboxes require genuine engagement,
// and the 18+ confirmation is explicit.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../../../App';
import { Colors, Typography, Spacing } from '../../theme/index';

type Props = StackScreenProps<RootStackParamList, 'Covenant'>;

const COMPACT_RULES = [
  'This space is for mutual aid — give, receive, trade, teach. Not for profit.',
  'No addresses. Use neighborhoods, not street numbers. Meet in public first.',
  'No demands for upfront payment. No pressure. No urgency tactics.',
  'Use only what you actually have to offer.',
  'If something feels wrong, flag it.',
  'This is not a marketplace, a dating platform, or a surveillance tool.',
];

export default function CovenantScreen({ navigation }: Props) {
  const [checkedCompact, setCheckedCompact]   = useState(false);
  const [checkedAge,     setCheckedAge]       = useState(false);
  const [loading,        setLoading]          = useState(false);

  const canEnter = checkedCompact && checkedAge;

  async function handleEnter() {
    if (!canEnter || loading) return;
    setLoading(true);
    // Covenant acceptance is implicit in identity creation —
    // if identity exists, covenant was accepted. Navigate to identity setup.
    navigation.replace('Identity');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={styles.eyebrow}>Root System</Text>
        <Text style={styles.title}>Community Compact</Text>
        <Text style={styles.subtitle}>Read before entering.</Text>

        {/* Minor notice — prominent, non-dismissable */}
        <View style={styles.minorNotice}>
          <Text style={styles.minorText}>
            Root System is for adults. If you are under 18 and need help,
            please reach out to a trusted adult, call{' '}
            <Text style={styles.bold}>211</Text> for local services, or text{' '}
            <Text style={styles.bold}>HOME to 741741</Text> for crisis support.
            You deserve help from people who are responsible for you.
          </Text>
        </View>

        {/* Rules */}
        <View style={styles.rulesBox}>
          {COMPACT_RULES.map((rule, i) => (
            <View key={i} style={styles.ruleRow}>
              <Text style={styles.ruleDot}>✦</Text>
              <Text style={styles.ruleText}>{rule}</Text>
            </View>
          ))}
        </View>

        {/* Data disclosure — transparent, upfront */}
        <View style={styles.disclosureBox}>
          <Text style={styles.disclosureTitle}>What this app stores</Text>
          <Text style={styles.disclosureText}>
            A cryptographic keypair is generated on your device when you enter.
            It never leaves your device unless you choose to set up recovery.
            Your handle, bio, and location are optional — you choose what to share.
            Posts you make are public to your community. Your location is
            approximate (neighborhood, not street). Nothing is sold. Nothing is
            collected without your knowledge.
          </Text>
          <Text style={[styles.disclosureText, { marginTop: Spacing.sm }]}>
            You can export all your data or delete everything at any time
            from My Root → Settings.
          </Text>
        </View>

        {/* Checkboxes */}
        <Pressable
          style={styles.checkRow}
          onPress={() => setCheckedCompact(v => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: checkedCompact }}
        >
          <View style={[styles.checkbox, checkedCompact && styles.checkboxChecked]}>
            {checkedCompact && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkLabel}>
            I have read this Compact and I enter this space in good faith
          </Text>
        </Pressable>

        <Pressable
          style={styles.checkRow}
          onPress={() => setCheckedAge(v => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: checkedAge }}
        >
          <View style={[styles.checkbox, checkedAge && styles.checkboxChecked]}>
            {checkedAge && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkLabel}>
            I confirm I am 18 years of age or older
          </Text>
        </Pressable>

        {/* Enter button */}
        <Pressable
          style={[styles.enterBtn, !canEnter && styles.enterBtnDisabled]}
          onPress={handleEnter}
          disabled={!canEnter || loading}
          accessibilityRole="button"
        >
          {loading
            ? <ActivityIndicator color={Colors.greenDeep} />
            : <Text style={[styles.enterBtnText, !canEnter && styles.enterBtnTextDisabled]}>
                Enter the Commons
              </Text>
          }
        </Pressable>

        {/* Crisis footer — always visible */}
        <View style={styles.crisisFooter}>
          <Text style={styles.crisisText}>
            Are you safe?{' '}
            <Text style={styles.crisisLink}>thehotline.org</Text>
            {'\n'}In crisis? <Text style={styles.bold}>988</Text> ·
            Text HOME to <Text style={styles.bold}>741741</Text> ·
            DV: <Text style={styles.bold}>1-800-799-7233</Text>
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
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
    fontSize: Typography.xxl,
    color: Colors.cream,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontFamily: Typography.bodyItalic,
    fontSize: Typography.md,
    color: Colors.dim,
    marginBottom: Spacing.lg,
  },
  minorNotice: {
    backgroundColor: 'rgba(138,37,53,0.15)',
    borderLeftWidth: 2,
    borderLeftColor: Colors.wine,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderRadius: 3,
  },
  minorText: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.moonsilver,
    lineHeight: 20,
  },
  bold: {
    fontFamily: Typography.bodySemi,
    color: Colors.cream,
  },
  rulesBox: {
    marginBottom: Spacing.lg,
  },
  ruleRow: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  ruleDot: {
    fontFamily: Typography.serif,
    fontSize: Typography.sm,
    color: Colors.gold,
    marginTop: 2,
    width: 14,
  },
  ruleText: {
    flex: 1,
    fontFamily: Typography.body,
    fontSize: Typography.base,
    color: Colors.cream,
    lineHeight: 24,
  },
  disclosureBox: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    borderRadius: 4,
    marginBottom: Spacing.lg,
  },
  disclosureTitle: {
    fontFamily: Typography.serifBold,
    fontSize: Typography.md,
    color: Colors.gold,
    marginBottom: Spacing.sm,
  },
  disclosureText: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.moonsilver,
    lineHeight: 20,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderColor: Colors.borderMid,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: 'rgba(196,152,46,0.15)',
    borderColor: Colors.gold,
  },
  checkmark: {
    color: Colors.gold,
    fontSize: 13,
    fontFamily: Typography.bodySemi,
  },
  checkLabel: {
    flex: 1,
    fontFamily: Typography.body,
    fontSize: Typography.base,
    color: Colors.cream,
    lineHeight: 24,
  },
  enterBtn: {
    backgroundColor: Colors.gold,
    paddingVertical: Spacing.md,
    borderRadius: 4,
    alignItems: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  enterBtnDisabled: {
    backgroundColor: 'rgba(196,152,46,0.2)',
  },
  enterBtnText: {
    fontFamily: Typography.serifBold,
    fontSize: Typography.md,
    color: Colors.greenDeep,
    letterSpacing: 0.5,
  },
  enterBtnTextDisabled: {
    color: Colors.dim,
  },
  crisisFooter: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
  },
  crisisText: {
    fontFamily: Typography.body,
    fontSize: Typography.xs,
    color: Colors.dim,
    textAlign: 'center',
    lineHeight: 18,
  },
  crisisLink: {
    color: Colors.gold,
    textDecorationLine: 'underline',
  },
});
