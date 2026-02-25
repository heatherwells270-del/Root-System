// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — App Entry Point
// ═══════════════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  useFonts,
  CormorantGaramond_400Regular,
  CormorantGaramond_400Regular_Italic,
  CormorantGaramond_700Bold,
} from '@expo-google-fonts/cormorant-garamond';
import {
  CrimsonText_400Regular,
  CrimsonText_400Regular_Italic,
  CrimsonText_600SemiBold,
} from '@expo-google-fonts/crimson-text';

import { getDb } from './src/db/index';
import { getIdentity } from './src/db/identity';
import { expirePendingExchanges } from './src/db/exchanges';
import { Colors } from './src/ui/theme/index';
import { startSync, stopSync } from './src/sync/index';

import CovenantScreen from './src/ui/screens/onboarding/CovenantScreen';
import IdentityScreen from './src/ui/screens/onboarding/IdentityScreen';
import MainNavigator  from './src/ui/screens/main/MainNavigator';

export type RootStackParamList = {
  Covenant: undefined;
  Identity: undefined;
  Main:     undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export default function App() {
  const [ready,       setReady]       = useState(false);
  const [hasIdentity, setHasIdentity] = useState(false);
  const activeCommunityId = useRef<string | null>(null);

  const [fontsLoaded] = useFonts({
    'CormorantGaramond-Regular': CormorantGaramond_400Regular,
    'CormorantGaramond-Italic':  CormorantGaramond_400Regular_Italic,
    'CormorantGaramond-Bold':    CormorantGaramond_700Bold,
    'CrimsonText-Regular':       CrimsonText_400Regular,
    'CrimsonText-Italic':        CrimsonText_400Regular_Italic,
    'CrimsonText-SemiBold':      CrimsonText_600SemiBold,
  });

  useEffect(() => {
    async function init() {
      await getDb();
      await expirePendingExchanges();
      const identity = await getIdentity();
      setHasIdentity(identity !== null);
      setReady(true);

      // Start relay sync for the first community this device belongs to.
      // If the device is new and has no community yet, this is a no-op.
      if (identity?.communityIds?.[0]) {
        const communityId = identity.communityIds[0];
        activeCommunityId.current = communityId;
        await startSync(communityId);
      }
    }
    init();

    // Reconnect on foreground, disconnect on background.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && activeCommunityId.current) {
        void startSync(activeCommunityId.current);
      } else if (state === 'background' || state === 'inactive') {
        stopSync();
      }
    });

    return () => {
      sub.remove();
      stopSync();
    };
  }, []);

  if (!ready || !fontsLoaded) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={Colors.gold} size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <StatusBar style="light" />
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {!hasIdentity ? (
              <>
                <Stack.Screen name="Covenant" component={CovenantScreen} />
                <Stack.Screen name="Identity" component={IdentityScreen} />
              </>
            ) : (
              <Stack.Screen name="Main" component={MainNavigator} />
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
