import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

import { supabase } from '../lib/supabase';
import { COLORS, MOCK_ADMIN } from '../lib/theme';
import { Button, Input, Card } from '../components/UI';

// Required to close the OAuth session cleanly on Android
WebBrowser.maybeCompleteAuthSession();

const FEATURES = [
  { icon: 'camera',           title: 'ANPR Entry/Exit',  desc: 'Camera reads your plate automatically'  },
  { icon: 'shield-checkmark', title: 'Secure Access',     desc: 'Only registered vehicles get in'        },
  { icon: 'stats-chart',      title: 'Live Tracking',     desc: 'Real-time slot availability'            },
];

// ── Helper: parse tokens from OAuth redirect URL ──────────────────────────
// Supabase can return tokens in either the hash fragment (#) or query string (?).
// We intentionally avoid the internal expo-auth-session/build/QueryParams path
// because it is not part of the public API and breaks on certain SDK versions.
function parseOAuthUrl(url) {
  const params = {};
  const fragmentIdx = url.indexOf('#');
  const queryIdx    = url.indexOf('?');

  let paramStr = '';
  if (fragmentIdx !== -1) {
    paramStr = url.substring(fragmentIdx + 1);
  } else if (queryIdx !== -1) {
    paramStr = url.substring(queryIdx + 1);
  }

  paramStr.split('&').forEach(pair => {
    if (!pair) return;
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) return;
    const key = decodeURIComponent(pair.substring(0, eqIdx));
    const val = decodeURIComponent(pair.substring(eqIdx + 1));
    params[key] = val;
  });

  return params;
}

export default function LandingScreen({ navigation, onAdminLogin }) {
  const [mode,      setMode]      = useState('user');
  const [adminId,   setAdminId]   = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [loading,   setLoading]   = useState(false);

  // ── Fix 1: handleAdminLogin was completely missing ────────────────────────
  function handleAdminLogin() {
    if (!adminId.trim() || !adminPass.trim()) {
      Alert.alert('Error', 'Please enter both Admin ID and Password.');
      return;
    }
    if (adminId.trim() === MOCK_ADMIN.id && adminPass === MOCK_ADMIN.password) {
      onAdminLogin();
    } else {
      Alert.alert('Access Denied', 'Invalid admin credentials.');
    }
  }

  // ── Fix 2: Google OAuth – removed fragile internal QueryParams import ─────
  async function handleGoogleLogin() {
    setLoading(true);
    try {
      const redirectUrl = Linking.createURL('/auth/callback');

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;

      if (!data?.url) throw new Error('No OAuth URL returned from Supabase.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

      if (result.type === 'success' && result.url) {
        const params = parseOAuthUrl(result.url);

        if (params.access_token) {
          // Implicit grant – tokens in URL fragment
          const { error: sessionError } = await supabase.auth.setSession({
            access_token:  params.access_token,
            refresh_token: params.refresh_token || '',
          });
          if (sessionError) throw sessionError;
        } else if (params.code) {
          // PKCE flow – exchange code for session
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(result.url);
          if (exchangeError) throw exchangeError;
        } else {
          throw new Error('No access token or code found in redirect URL.');
        }
      } else if (result.type === 'cancel') {
        // User dismissed the browser — silent, no alert needed
      }
    } catch (err) {
      Alert.alert('Sign-in failed', err.message || 'Could not sign in with Google.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand */}
          <View style={styles.brand}>
            <View style={styles.brandIcon}>
              <Text style={styles.brandLetter}>P</Text>
            </View>
            <Text style={styles.brandName}>
              Smart<Text style={{ color: COLORS.cyan }}>Park</Text>
            </Text>
          </View>

          {/* Hero */}
          <Text style={styles.heroTitle}>
            Skip the Queue,{'\n'}Park{' '}
            <Text style={{ color: COLORS.cyan }}>instantly.</Text>
          </Text>
          <Text style={styles.heroSub}>
            Register once, pay digitally — our ANPR cameras handle entry & exit.
          </Text>

          {/* Feature pills */}
          <View style={styles.features}>
            {FEATURES.map((f) => (
              <View key={f.title} style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <Ionicons name={f.icon} size={18} color={COLORS.cyan} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>{f.title}</Text>
                  <Text style={styles.featureDesc}>{f.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Mode toggle */}
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'user' && styles.modeBtnActive]}
              onPress={() => setMode('user')}
            >
              <Text style={[styles.modeBtnText, mode === 'user' && styles.modeBtnTextActive]}>
                User Login
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'admin' && styles.modeBtnActive]}
              onPress={() => setMode('admin')}
            >
              <Text style={[styles.modeBtnText, mode === 'admin' && styles.modeBtnTextActive]}>
                Admin Login
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── USER LOGIN ────────────────────────────────────────────────── */}
          {mode === 'user' && (
            <Card>
              <Text style={styles.cardTitle}>Welcome back</Text>
              <Text style={styles.cardSub}>Sign in with Google to continue</Text>

              {/* Fix 3: custom Google button so text is visible on white background */}
              <TouchableOpacity
                style={[styles.googleBtn, loading && { opacity: 0.6 }]}
                onPress={handleGoogleLogin}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Ionicons name="logo-google" size={18} color="#4285F4" />
                <Text style={styles.googleBtnText}>
                  {loading ? 'Redirecting…' : 'Continue with Google'}
                </Text>
              </TouchableOpacity>

              <View style={styles.stepsContainer}>
                {[
                  'Google verifies your identity instantly',
                  'Your name & email are saved automatically',
                  'Add your vehicle plate & start parking',
                ].map((step, i) => (
                  <View key={i} style={styles.step}>
                    <View style={styles.stepNum}>
                      <Text style={styles.stepNumText}>{i + 1}</Text>
                    </View>
                    <Text style={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.newUserNote}>
                New here? Google sign-in{' '}
                <Text style={{ color: COLORS.cyan }}>creates your account automatically</Text>
              </Text>
            </Card>
          )}

          {/* ── ADMIN LOGIN ───────────────────────────────────────────────── */}
          {mode === 'admin' && (
            <Card>
              <Text style={styles.cardTitle}>Admin Access</Text>
              <Text style={styles.cardSub}>Restricted — authorized personnel only</Text>

              <View style={{ marginTop: 16 }}>
                <Input
                  label="Admin ID"
                  value={adminId}
                  onChangeText={setAdminId}
                  placeholder="Admin ID"
                  autoCapitalize="none"
                />
                <View style={{ position: 'relative' }}>
                  <Input
                    label="Password"
                    value={adminPass}
                    onChangeText={setAdminPass}
                    placeholder="Admin password"
                    secureTextEntry={!showPass}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPass(!showPass)}
                    style={styles.eyeBtn}
                  >
                    <Ionicons
                      name={showPass ? 'eye-off' : 'eye'}
                      size={20}
                      color={COLORS.muted}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <Button title="Access Dashboard →" onPress={handleAdminLogin} />
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: COLORS.bg },
  scroll:   { padding: 20, paddingBottom: 40 },
  brand:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 28, marginTop: 8 },
  brandIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: COLORS.blue,
    alignItems: 'center', justifyContent: 'center',
  },
  brandLetter: { color: COLORS.white, fontSize: 20, fontWeight: '800' },
  brandName:   { color: COLORS.text,  fontSize: 22, fontWeight: '800' },
  heroTitle:   { color: COLORS.text,  fontSize: 30, fontWeight: '800', lineHeight: 38, marginBottom: 10 },
  heroSub:     { color: COLORS.muted, fontSize: 14, lineHeight: 22, marginBottom: 24 },
  features:    { gap: 12, marginBottom: 24 },
  featureRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  featureIcon: {
    width: 36, height: 36, borderRadius: 9,
    backgroundColor: 'rgba(0,212,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  featureTitle: { color: COLORS.text,  fontSize: 13, fontWeight: '600' },
  featureDesc:  { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.bg,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, padding: 4, marginBottom: 16,
  },
  modeBtn:           { flex: 1, paddingVertical: 10, borderRadius: 7, alignItems: 'center' },
  modeBtnActive:     { backgroundColor: COLORS.blue },
  modeBtnText:       { color: COLORS.muted, fontSize: 13, fontWeight: '600' },
  modeBtnTextActive: { color: COLORS.white },
  cardTitle: { color: COLORS.text,  fontSize: 18, fontWeight: '800', marginBottom: 4 },
  cardSub:   { color: COLORS.muted, fontSize: 13, marginBottom: 4 },

  // Fix 3: dedicated Google button (dark text on white background is readable)
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginTop: 16, marginBottom: 4,
    backgroundColor: '#ffffff',
    borderRadius: 12, paddingVertical: 13, paddingHorizontal: 20,
  },
  googleBtnText: { color: '#1f2937', fontSize: 15, fontWeight: '700' },

  stepsContainer: { marginTop: 16, gap: 10 },
  step:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNum:  {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(59,130,246,0.2)',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  stepNumText:  { color: COLORS.blue, fontSize: 11, fontWeight: '800' },
  stepText:     { color: COLORS.muted, fontSize: 13, flex: 1 },
  newUserNote:  { color: COLORS.muted, fontSize: 12, textAlign: 'center', marginTop: 12 },
  eyeBtn:       { position: 'absolute', right: 14, bottom: 30, padding: 4 },
});