// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — App Entry Point
// ═══════════════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from 'react';
import { View, Image, ActivityIndicator, StyleSheet, AppState, Text, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { getDb } from './src/db/index';
import { getIdentity } from './src/db/identity';
import { expirePendingExchanges } from './src/db/exchanges';
import { Colors } from './src/ui/theme/index';
import { startSync, stopSync } from './src/sync/index';
import { onAppEvent } from './src/ui/appEvents';

import CovenantScreen        from './src/ui/screens/onboarding/CovenantScreen';
import IdentityScreen        from './src/ui/screens/onboarding/IdentityScreen';
import CommunitySetupScreen  from './src/ui/screens/onboarding/CommunitySetupScreen';
import CreateCommunityScreen from './src/ui/screens/onboarding/CreateCommunityScreen';
import JoinCommunityScreen   from './src/ui/screens/onboarding/JoinCommunityScreen';
import MainNavigator         from './src/ui/screens/main/MainNavigator';
import PostScreen            from './src/ui/screens/main/PostScreen';
import ReviewScreen          from './src/ui/screens/main/ReviewScreen';

export type RootStackParamList = {
  Covenant:        undefined;
  Identity:        undefined;
  CommunitySetup:  undefined;
  CreateCommunity: undefined;
  JoinCommunity:   undefined;
  Main:            undefined;
  PostModal:       undefined;   // FAB post form — modal slide-up
  ReviewQueue:     undefined;   // Review queue — full screen from My Root
};

const Stack = createStackNavigator<RootStackParamList>();

// ─── ERROR BOUNDARY ──────────────────────────────────────────────────────────
// Catches unhandled render errors and shows a recovery screen instead of
// a blank white crash. Class component required by React's error boundary API.

interface EBState { hasError: boolean; message: string }

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, EBState> {
  state: EBState = { hasError: false, message: '' };

  static getDerivedStateFromError(err: Error): EBState {
    return { hasError: true, message: err.message };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', err.message, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={ebStyles.container}>
        <Text style={ebStyles.heading}>Something went wrong</Text>
        <Text style={ebStyles.sub}>{this.state.message}</Text>
        <TouchableOpacity
          style={ebStyles.btn}
          onPress={() => this.setState({ hasError: false, message: '' })}
        >
          <Text style={ebStyles.btnText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const ebStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F2EB', alignItems: 'center', justifyContent: 'center', padding: 32 },
  heading:   { fontFamily: 'serif', fontWeight: 'bold', fontSize: 22, color: '#1A2E27', marginBottom: 12, textAlign: 'center' },
  sub:       { fontFamily: 'sans-serif', fontSize: 15, color: '#5A6B62', marginBottom: 32, textAlign: 'center' },
  btn:       { backgroundColor: '#2D4A3E', paddingVertical: 12, paddingHorizontal: 28, borderRadius: 6 },
  btnText:   { fontFamily: 'sans-serif', fontWeight: '600', fontSize: 15, color: '#F5F2EB' },
});

export default function App() {
  const [ready,        setReady]        = useState(false);
  const [hasIdentity,  setHasIdentity]  = useState(false);
  const [hasCommunity, setHasCommunity] = useState(false);
  const [dbError,      setDbError]      = useState<string | null>(null);
  const activeCommunityId = useRef<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        await getDb();
        await expirePendingExchanges();
        const identity = await getIdentity();
        setHasIdentity(identity !== null);
        setHasCommunity((identity?.communityIds?.length ?? 0) > 0);
        setReady(true);

        // Start relay sync for the first community this device belongs to.
        // If the device is new and has no community yet, this is a no-op.
        if (identity?.communityIds?.[0]) {
          const communityId = identity.communityIds[0];
          activeCommunityId.current = communityId;
          await startSync(communityId);
        }
      } catch (e) {
        console.error('[App] DB init failed', e);
        setDbError(e instanceof Error ? e.message : 'Unknown error');
        setReady(true);
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

    // Listen for identity/community creation from onboarding screens.
    // State updates here cause the navigator to re-render the correct screen set.
    const offIdentity = onAppEvent('identity-created', () => {
      getIdentity().then(id => {
        setHasIdentity(id !== null);
        setHasCommunity((id?.communityIds?.length ?? 0) > 0);
      });
    });

    const offCommunity = onAppEvent('community-ready', () => {
      getIdentity().then(id => {
        const communityId = id?.communityIds?.[0];
        setHasCommunity((id?.communityIds?.length ?? 0) > 0);
        if (communityId) {
          activeCommunityId.current = communityId;
          // startSync is idempotent — safe to call even if already started
          void startSync(communityId);
        }
      });
    });

    // Nuclear wipe: reset auth state so the navigator returns to Covenant
    const offNuked = onAppEvent('data-nuked', () => {
      stopSync();
      activeCommunityId.current = null;
      setHasIdentity(false);
      setHasCommunity(false);
    });

    return () => {
      sub.remove();
      stopSync();
      offIdentity();
      offCommunity();
      offNuked();
    };
  }, []);

  if (!ready) {
    return (
      <View style={styles.splash}>
        <Image
          source={require('./assets/logo.png')}
          style={styles.splashLogo}
          resizeMode="contain"
        />
        <ActivityIndicator color={Colors.primary} size="small" style={{ marginTop: 24 }} />
      </View>
    );
  }

  if (dbError) {
    return (
      <View style={ebStyles.container}>
        <Text style={ebStyles.heading}>Could not open database</Text>
        <Text style={ebStyles.sub}>
          {'Your data could not be loaded. Try restarting the app.\n\n'}
          {dbError}
        </Text>
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <NavigationContainer>
            <StatusBar style="dark" />
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              {!hasIdentity ? (
                <>
                  <Stack.Screen name="Covenant" component={CovenantScreen} />
                  <Stack.Screen name="Identity" component={IdentityScreen} />
                </>
              ) : !hasCommunity ? (
                <>
                  <Stack.Screen name="CommunitySetup"  component={CommunitySetupScreen} />
                  <Stack.Screen name="CreateCommunity" component={CreateCommunityScreen} />
                  <Stack.Screen name="JoinCommunity"   component={JoinCommunityScreen} />
                </>
              ) : (
                <>
                  <Stack.Screen name="Main" component={MainNavigator} />
                  <Stack.Screen
                    name="PostModal"
                    component={PostScreen}
                    options={{ presentation: 'modal' }}
                  />
                  <Stack.Screen
                    name="ReviewQueue"
                    component={ReviewScreen}
                  />
                </>
              )}
            </Stack.Navigator>
          </NavigationContainer>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: {
    width: 160,
    height: 160,
  },
});
