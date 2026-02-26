// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Main Tab Navigator
//
// 4 destinations + center FAB for Post (no tab slot wasted)
//   Browse · Time Bank · [✦ FAB] · Community · My Root
//
// Uses a custom tabBar render so the FAB can be a proper raised button.
// Navigates to PostModal in the parent root Stack via navigation.getParent().
// ═══════════════════════════════════════════════════════════════════════════

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../../theme/index';
import { useWatches } from '../../hooks/useWatches';

import BrowseScreen     from './BrowseScreen';
import TimebankScreen   from './TimebankScreen';
import CoalitionsScreen from './CoalitionsScreen';
import CommunityScreen  from './CommunityScreen';
import MyRootScreen     from './MyRootScreen';

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type MainTabParamList = {
  Browse:     undefined;
  Timebank:   undefined;
  Coalitions: undefined;
  Community:  undefined;
  MyRoot:     undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

// ─── ICONS ───────────────────────────────────────────────────────────────────
// Unicode symbols chosen to render well on iOS + Android at 18px.

const ICONS: Record<string, { glyph: string; label: string }> = {
  Browse:     { glyph: '❧',  label: 'Browse' },
  Timebank:   { glyph: '⏱', label: 'Time Bank' },
  Coalitions: { glyph: '⬡',  label: 'Coalitions' },
  Community:  { glyph: '⌘',  label: 'Commons' },
  MyRoot:     { glyph: '🌿', label: 'My Root' },
};

// ─── CUSTOM TAB BAR ──────────────────────────────────────────────────────────

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { watches } = useWatches();
  const hasWatches = watches.length > 0;

  // Split into left (Browse, Timebank) and right (Coalitions, Community, MyRoot) around the FAB
  const left  = state.routes.slice(0, 2);
  const right = state.routes.slice(2);

  function renderTab(route: (typeof state.routes)[0]) {
    const idx      = state.routes.indexOf(route);
    const isFocused = state.index === idx;
    const icon      = ICONS[route.name] ?? { glyph: '·', label: route.name };

    function onPress() {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name as never);
      }
    }

    function onLongPress() {
      navigation.emit({ type: 'tabLongPress', target: route.key });
    }

    const showBadge = route.name === 'Browse' && hasWatches;

    return (
      <Pressable
        key={route.key}
        style={styles.tab}
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={descriptors[route.key].options.tabBarAccessibilityLabel}
      >
        <View style={styles.glyphWrap}>
          <Text style={[styles.tabGlyph, isFocused && styles.tabGlyphFocused]}>
            {icon.glyph}
          </Text>
          {showBadge && <View style={styles.badge} />}
        </View>
        <Text style={[styles.tabLabel, isFocused && styles.tabLabelFocused]} numberOfLines={1}>
          {icon.label}
        </Text>
      </Pressable>
    );
  }

  function openPost() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // PostModal lives in the parent root Stack, not the Tab navigator.
    // navigate() propagates up when the screen is not found locally.
    (navigation.getParent() ?? navigation).navigate('PostModal' as never);
  }

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.barInner}>
        {/* Left tabs */}
        <View style={styles.tabGroup}>
          {left.map(renderTab)}
        </View>

        {/* FAB */}
        <Pressable
          style={styles.fab}
          onPress={openPost}
          accessibilityRole="button"
          accessibilityLabel="New post"
          accessibilityHint="Opens the post form"
        >
          <Text style={styles.fabGlyph}>✦</Text>
        </Pressable>

        {/* Right tabs */}
        <View style={styles.tabGroup}>
          {right.map(renderTab)}
        </View>
      </View>
    </View>
  );
}

// ─── NAVIGATOR ────────────────────────────────────────────────────────────────

export default function MainNavigator() {
  return (
    <Tab.Navigator
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Browse"      component={BrowseScreen} />
      <Tab.Screen name="Timebank"    component={TimebankScreen} />
      <Tab.Screen name="Coalitions"  component={CoalitionsScreen} />
      <Tab.Screen name="Community"   component={CommunityScreen} />
      <Tab.Screen name="MyRoot"      component={MyRootScreen} />
    </Tab.Navigator>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const BAR_H = 56; // px of content above the bottom safe area

const styles = StyleSheet.create({
  bar: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  barInner: {
    height: BAR_H,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },

  // Each half (2 tabs)
  tabGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },

  // Individual tab slot
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 2,
  },
  glyphWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabGlyph: {
    fontSize: 18,
    lineHeight: 22,
    opacity: 0.4,
  },
  tabGlyphFocused: {
    opacity: 1,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: -4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  tabLabel: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: Colors.textMuted,
  },
  tabLabelFocused: {
    color: Colors.primary,
    fontFamily: Typography.body,
    fontWeight: '600',
  },

  // Center FAB
  fab: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    // Raised appearance
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
    marginHorizontal: Spacing.xs,
  },
  fabGlyph: {
    fontSize: 22,
    color: Colors.textOnDark,
    lineHeight: 26,
  },
});
