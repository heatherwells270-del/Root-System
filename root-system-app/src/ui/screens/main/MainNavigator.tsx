// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Main Tab Navigator
// ═══════════════════════════════════════════════════════════════════════════

import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Colors, Typography } from '../../theme/index';

import BrowseScreen   from './BrowseScreen';
import PostScreen     from './PostScreen';
import ReviewScreen   from './ReviewScreen';
import TimebankScreen from './TimebankScreen';
import MyRootScreen   from './MyRootScreen';

export type MainTabParamList = {
  Browse:   undefined;
  Post:     undefined;
  Review:   undefined;
  Timebank: undefined;
  MyRoot:   undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Browse: '❧', Post: '✦', Review: '⚖', Timebank: '⏱', MyRoot: '🌿',
  };
  return (
    <Text style={{ fontSize: 16, opacity: focused ? 1 : 0.45 }}>
      {icons[label] ?? '·'}
    </Text>
  );
}

export default function MainNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
        },
        tabBarActiveTintColor:   Colors.gold,
        tabBarInactiveTintColor: Colors.dim,
        tabBarLabelStyle: {
          fontFamily: Typography.body,
          fontSize: Typography.xs,
          marginTop: -2,
        },
        tabBarIcon: ({ focused }) => (
          <TabIcon label={route.name} focused={focused} />
        ),
      })}
    >
      <Tab.Screen name="Browse"   component={BrowseScreen}   options={{ tabBarLabel: 'Browse' }} />
      <Tab.Screen name="Post"     component={PostScreen}     options={{ tabBarLabel: 'Post' }} />
      <Tab.Screen name="Review"   component={ReviewScreen}   options={{ tabBarLabel: 'Review' }} />
      <Tab.Screen name="Timebank" component={TimebankScreen} options={{ tabBarLabel: 'Time Bank' }} />
      <Tab.Screen name="MyRoot"   component={MyRootScreen}   options={{ tabBarLabel: 'My Root' }} />
    </Tab.Navigator>
  );
}
