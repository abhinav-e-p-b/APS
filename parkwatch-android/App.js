import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { supabase } from './src/lib/supabase';
import { COLORS } from './src/lib/theme';

// Screens
import LandingScreen from './src/screens/LandingScreen';
import SignupScreen from './src/screens/SignupScreen';
import HomeScreen from './src/screens/HomeScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import SessionsScreen from './src/screens/SessionsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import AdminDashboard from './src/screens/AdminDashboard';
import ManualEntryScreen from './src/screens/ManualEntryScreen';
import VehiclesScreen from './src/screens/VehiclesScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

// ── User bottom tabs ──────────────────────────────────────────────────────
function UserTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
          height: 64,
        },
        tabBarActiveTintColor: COLORS.cyan,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = {
            Home: focused ? 'home' : 'home-outline',
            Register: focused ? 'car' : 'car-outline',
            Sessions: focused ? 'list' : 'list-outline',
            Profile: focused ? 'person' : 'person-outline',
          };
          return <Ionicons name={icons[route.name]} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home"     component={HomeScreen}     options={{ tabBarLabel: 'Dashboard' }} />
      <Tab.Screen name="Register" component={RegisterScreen} options={{ tabBarLabel: 'Register' }} />
      <Tab.Screen name="Sessions" component={SessionsScreen} options={{ tabBarLabel: 'My Sessions' }} />
      <Tab.Screen name="Profile"  component={ProfileScreen}  options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
}

// ── Admin bottom tabs ─────────────────────────────────────────────────────
function AdminTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
          height: 64,
        },
        tabBarActiveTintColor: COLORS.cyan,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused, color }) => {
          const icons = {
            AdminHome: focused ? 'grid' : 'grid-outline',
            Vehicles: focused ? 'car' : 'car-outline',
            ManualEntry: focused ? 'add-circle' : 'add-circle-outline',
            AdminProfile: focused ? 'settings' : 'settings-outline',
          };
          return <Ionicons name={icons[route.name]} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="AdminHome"    component={AdminDashboard}  options={{ tabBarLabel: 'Dashboard' }} />
      <Tab.Screen name="Vehicles"     component={VehiclesScreen}  options={{ tabBarLabel: 'Vehicles' }} />
      <Tab.Screen name="ManualEntry"  component={ManualEntryScreen} options={{ tabBarLabel: 'Manual Entry' }} />
      <Tab.Screen name="AdminProfile" component={ProfileScreen}   options={{ tabBarLabel: 'Settings' }} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [session,  setSession]  = useState(null);
  const [isAdmin,  setIsAdmin]  = useState(false);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.cyan} />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer
        theme={{
          dark: true,
          colors: {
            primary: COLORS.cyan,
            background: COLORS.bg,
            card: COLORS.surface,
            text: COLORS.text,
            border: COLORS.border,
            notification: COLORS.cyan,
          },
        }}
      >
        <StatusBar style="light" backgroundColor={COLORS.bg} />
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!session && !isAdmin ? (
            <>
              <Stack.Screen name="Landing">
                {(props) => (
                  <LandingScreen
                    {...props}
                    onAdminLogin={() => setIsAdmin(true)}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen name="Signup" component={SignupScreen} />
            </>
          ) : isAdmin ? (
            <Stack.Screen name="AdminTabs">
              {(props) => (
                <AdminTabs
                  {...props}
                  onLogout={() => { setIsAdmin(false); setSession(null); }}
                />
              )}
            </Stack.Screen>
          ) : (
            <Stack.Screen name="UserTabs" component={UserTabs} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
