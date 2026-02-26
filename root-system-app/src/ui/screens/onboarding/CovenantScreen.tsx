// ═══════════════════════════════════════════════════════════════════════════
// ROOTS — Community Agreement Screen
//
// The gate. Must be accepted before anything else. No dark patterns —
// every rule is readable, the checkboxes require genuine engagement,
// and the 18+ confirmation is explicit.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  ActivityIndicator, Image, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../../../App';
import { Colors, Typography, Spacing } from '../../theme/index';

type Props = StackScreenProps<RootStackParamList, 'Covenant'>;

const AGREEMENT_VERSION = '1.0';
const AGREEMENT_DATE    = 'February 2026';

const COMMUNITY_RULES = [
  'This space is for mutual aid — give, receive, trade, teach. Not for profit.',
  'No addresses. Use neighborhoods, not street numbers. Meet in public first.',
  'No demands for upfront payment. No pressure. No urgency tactics.',
  'Use only what you actually have to offer.',
  'If something feels wrong, flag it.',
  'This is not a marketplace, a dating platform, a recruitment scheme, or a surveillance tool.',
];

export default function CovenantScreen({ navigation }: Props) {
  const [checkedRules, setCheckedRules] = useState(false);
  const [checkedAge,   setCheckedAge]   = useState(false);
  const [loading,      setLoading]      = useState(false);

  const canEnter = checkedRules && checkedAge;

  async function handleEnter() {
    if (!canEnter || loading) return;
    setLoading(true);
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
        <View style={styles.logoWrap}>
          <Image
            source={require('../../../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.appName}>Roots</Text>
        <Text style={styles.title}>Community Agreement</Text>
        <View style={styles.versionRow}>
          <Text style={styles.subtitle}>Read before continuing.</Text>
          <Text style={styles.versionBadge}>v{AGREEMENT_VERSION} · {AGREEMENT_DATE}</Text>
        </View>

        {/* Minor notice — prominent, non-dismissable */}
        <View style={styles.minorNotice}>
          <Text style={styles.minorText}>
            Roots requires you to be at least 13 years old. If you are under 13,
            please reach out to a trusted adult, call{' '}
            <Text style={styles.bold}>211</Text> for local services, or text{' '}
            <Text style={styles.bold}>HOME to 741741</Text> for crisis support.
            You deserve help from people who are responsible for you.
          </Text>
        </View>

        {/* Rules */}
        <View style={styles.rulesBox}>
          {COMMUNITY_RULES.map((rule, i) => (
            <View key={i} style={styles.ruleRow}>
              <Text style={styles.ruleDot}>·</Text>
              <Text style={styles.ruleText}>{rule}</Text>
            </View>
          ))}
        </View>

        {/* Data disclosure — transparent, upfront */}
        <View style={styles.disclosureBox}>
          <Text style={styles.disclosureTitle}>What this app stores</Text>
          <Text style={styles.disclosureText}>
            A cryptographic keypair is generated on your device when you sign up.
            It never leaves your device unless you choose to set up recovery.
            Your handle, bio, and location are optional — you choose what to share.
            Posts you make are visible to your community. Your location is
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
          onPress={() => setCheckedRules(v => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: checkedRules }}
        >
          <View style={[styles.checkbox, checkedRules && styles.checkboxChecked]}>
            {checkedRules && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkLabel}>
            I have read this agreement and I'm participating in good faith
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
            I confirm I am 13 years of age or older
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
            ? <ActivityIndicator color={Colors.textOnDark} />
            : <Text style={[styles.enterBtnText, !canEnter && styles.enterBtnTextDisabled]}>
                Get started
              </Text>
          }
        </Pressable>

        {/* Crisis footer — always visible, all links tappable */}
        <View style={styles.crisisFooter}>
          <Text style={styles.crisisText}>Are you safe?</Text>
          <View style={styles.crisisLinks}>
            <Pressable onPress={() => void Linking.openURL('https://www.thehotline.org')} accessibilityRole="link">
              <Text style={styles.crisisLink}>thehotline.org</Text>
            </Pressable>
            <Pressable onPress={() => void Linking.openURL('tel:988')} accessibilityRole="link" accessibilityLabel="988 Suicide and Crisis Lifeline">
              <Text style={styles.crisisLink}>988 Crisis</Text>
            </Pressable>
            <Pressable onPress={() => void Linking.openURL('sms:741741')} accessibilityRole="link" accessibilityLabel="Crisis Text Line — text HOME to 741741">
              <Text style={styles.crisisLink}>Text HOME → 741741</Text>
            </Pressable>
            <Pressable onPress={() => void Linking.openURL('tel:18007997233')} accessibilityRole="link" accessibilityLabel="Domestic Violence Hotline">
              <Text style={styles.crisisLink}>DV: 1-800-799-7233</Text>
            </Pressable>
          </View>
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
  logoWrap: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
    marginTop: Spacing.sm,
  },
  logo: {
    width: 120,
    height: 120,
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
    fontSize: Typography.xxl,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  subtitle: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.md,
    color: Colors.textMuted,
  },
  versionBadge: {
    fontFamily: Typography.body,
    fontSize: Typography.xs,
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },
  minorNotice: {
    backgroundColor: 'rgba(166,61,61,0.08)',
    borderLeftWidth: 2,
    borderLeftColor: Colors.error,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderRadius: 3,
  },
  minorText: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.text,
    lineHeight: 20,
  },
  bold: {
    fontFamily: Typography.body,
    fontWeight: '600',
    color: Colors.text,
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
    fontFamily: Typography.body,
    fontSize: Typography.md,
    color: Colors.primary,
    width: 14,
  },
  ruleText: {
    flex: 1,
    fontFamily: Typography.body,
    fontSize: Typography.base,
    color: Colors.text,
    lineHeight: 24,
  },
  disclosureBox: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    borderRadius: 6,
    marginBottom: Spacing.lg,
  },
  disclosureTitle: {
    fontFamily: Typography.serif,
    fontWeight: 'bold',
    fontSize: Typography.md,
    color: Colors.textMid,
    marginBottom: Spacing.sm,
  },
  disclosureText: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.textMuted,
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
    borderWidth: 1.5,
    borderColor: Colors.borderMid,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  checkmark: {
    color: Colors.primary,
    fontSize: 13,
    fontFamily: Typography.body,
    fontWeight: '600',
  },
  checkLabel: {
    flex: 1,
    fontFamily: Typography.body,
    fontSize: Typography.base,
    color: Colors.text,
    lineHeight: 24,
  },
  enterBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  enterBtnDisabled: {
    backgroundColor: Colors.primaryLight,
  },
  enterBtnText: {
    fontFamily: Typography.serif,
    fontWeight: 'bold',
    fontSize: Typography.md,
    color: Colors.textOnDark,
  },
  enterBtnTextDisabled: {
    color: Colors.textMuted,
  },
  crisisFooter: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  crisisText: {
    fontFamily: Typography.body,
    fontSize: Typography.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  crisisLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  crisisLink: {
    fontFamily: Typography.body,
    fontWeight: '600',
    fontSize: Typography.xs,
    color: Colors.secondary,
    textDecorationLine: 'underline',
    lineHeight: 22,
  },
});
