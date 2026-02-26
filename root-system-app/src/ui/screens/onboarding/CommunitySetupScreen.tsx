// ═══════════════════════════════════════════════════════════════════════════
// ROOTS — Community Setup Screen
//
// Shown after identity creation when the device doesn't belong to any
// community yet. Two paths: start a new one, or join with an invite code.
// ═══════════════════════════════════════════════════════════════════════════

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../../../App';
import { Colors, Typography, Spacing, Radius } from '../../theme/index';

type Props = StackScreenProps<RootStackParamList, 'CommunitySetup'>;

export default function CommunitySetupScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>

        <Text style={styles.appName}>Roots</Text>
        <Text style={styles.title}>Find your community</Text>
        <Text style={styles.subtitle}>
          Roots works through local communities — networks of neighbors
          who share skills, time, and goods without money.
          You can start one or join one that already exists.
        </Text>

        {/* Start */}
        <Pressable
          style={styles.card}
          onPress={() => navigation.navigate('CreateCommunity')}
          accessibilityRole="button"
        >
          <Text style={styles.cardIcon}>🌱</Text>
          <Text style={styles.cardTitle}>Start a community</Text>
          <Text style={styles.cardBody}>
            Start a new mutual aid network in your area. You'll set the name,
            guidelines, and zones. You become the first organizer —
            the keeper of the community key.
          </Text>
          <Text style={styles.cardCta}>Get started →</Text>
        </Pressable>

        {/* Join */}
        <Pressable
          style={[styles.card, styles.cardJoin]}
          onPress={() => navigation.navigate('JoinCommunity')}
          accessibilityRole="button"
        >
          <Text style={styles.cardIcon}>🤝</Text>
          <Text style={styles.cardTitle}>Join a community</Text>
          <Text style={styles.cardBody}>
            Have an invite code? Enter it here to request membership.
            The organizer will approve your request and send you the community key.
          </Text>
          <Text style={[styles.cardCta, { color: Colors.secondary }]}>Enter invite code →</Text>
        </Pressable>

        <Text style={styles.footer}>
          You can belong to one community per device. Communities are local —
          they work best within a neighborhood, town, or small region.
        </Text>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
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
    fontSize: 28,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.base,
    color: Colors.textMuted,
    lineHeight: 24,
    marginBottom: Spacing.xl,
  },
  card: {
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.borderMid,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  cardJoin: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  cardIcon: {
    fontSize: 28,
    marginBottom: Spacing.sm,
  },
  cardTitle: {
    fontFamily: Typography.serif,
    fontWeight: 'bold',
    fontSize: Typography.lg,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  cardBody: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.textMuted,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  cardCta: {
    fontFamily: Typography.body,
    fontWeight: '600',
    fontSize: Typography.sm,
    color: Colors.primary,
  },
  footer: {
    fontFamily: Typography.body,
    fontStyle: 'italic',
    fontSize: Typography.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: Spacing.lg,
  },
});
