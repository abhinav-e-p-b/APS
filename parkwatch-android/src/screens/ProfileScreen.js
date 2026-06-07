import React, { useState, useEffect, useContext } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { AppContext } from '../lib/AppContext';
import { COLORS } from '../lib/theme';
import { Card, Button, SectionTitle } from '../components/UI';

export default function ProfileScreen() {
  const [user,    setUser]    = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  const { isAdmin } = useContext(AppContext);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUser(user);
      const { data } = await supabase
        .from('users')
        .select('name, phone, role')
        .eq('id', user.id)
        .single();
      setProfile(data);
    });
  }, []);

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await supabase.auth.signOut();
          } catch (err) {
            Alert.alert('Error', err.message || 'Could not sign out.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  }

  const infoRows = [
    { icon: 'person-outline', label: 'Name',  value: profile?.name || user?.user_metadata?.full_name || '—' },
    { icon: 'mail-outline',   label: 'Email', value: user?.email || '—' },
    { icon: 'call-outline',   label: 'Phone', value: profile?.phone || '—' },
    { icon: 'shield-outline', label: 'Role',  value: isAdmin ? 'Administrator' : (profile?.role || 'user') },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Avatar header */}
        <View style={styles.avatarSection}>
          {user?.user_metadata?.avatar_url ? (
            <Image source={{ uri: user.user_metadata.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={40} color={COLORS.muted} />
            </View>
          )}

          <Text style={styles.displayName}>
            {profile?.name || user?.user_metadata?.full_name || 'User'}
          </Text>
          <Text style={styles.displayEmail}>{user?.email}</Text>

          <View style={isAdmin ? styles.adminBadge : styles.userBadge}>
            <Text style={isAdmin ? styles.adminBadgeText : styles.userBadgeText}>
              {isAdmin ? '🛡 Admin' : '👤 User'}
            </Text>
          </View>
        </View>

        {/* Info card */}
        <SectionTitle title="Account Info" />
        <Card>
          {infoRows.map((row, i) => (
            <View
              key={row.label}
              style={[styles.infoRow, i < infoRows.length - 1 && styles.infoRowBorder]}
            >
              <View style={styles.infoLeft}>
                <View style={styles.infoIcon}>
                  <Ionicons name={row.icon} size={16} color={COLORS.cyan} />
                </View>
                <Text style={styles.infoLabel}>{row.label}</Text>
              </View>
              <Text style={styles.infoValue}>{row.value}</Text>
            </View>
          ))}
        </Card>

        {/* App info */}
        <SectionTitle title="App Info" />
        <Card>
          {[
            { label: 'App Version',   value: '1.0.0'                  },
            { label: 'Backend',       value: 'Supabase'               },
            { label: 'ANPR Engine',   value: 'YOLOv8 + PaddleOCR'    },
            { label: 'OCR Variants',  value: '7 preprocessing modes'  },
          ].map((item, i) => (
            <View
              key={item.label}
              style={[styles.infoRow, i < 3 && styles.infoRowBorder]}
            >
              <Text style={styles.infoLabel}>{item.label}</Text>
              <Text style={styles.infoValue}>{item.value}</Text>
            </View>
          ))}
        </Card>

        {/* Sign out */}
        <Button
          title={loading ? 'Signing out…' : 'Sign Out'}
          onPress={handleSignOut}
          variant="danger"
          loading={loading}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 16, paddingBottom: 40 },
  avatarSection:      { alignItems: 'center', paddingVertical: 28 },
  avatar:             { width: 90, height: 90, borderRadius: 45, borderWidth: 2, borderColor: COLORS.border },
  avatarPlaceholder:  {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  displayName:  { color: COLORS.text,  fontSize: 20, fontWeight: '800', marginTop: 12 },
  displayEmail: { color: COLORS.muted, fontSize: 13, marginTop: 4 },
  adminBadge: {
    marginTop: 10, backgroundColor: 'rgba(59,130,246,0.15)',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4,
  },
  adminBadgeText: { color: COLORS.blue, fontSize: 12, fontWeight: '700' },
  userBadge: {
    marginTop: 10, backgroundColor: 'rgba(0,212,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4,
  },
  userBadgeText: { color: COLORS.cyan, fontSize: 12, fontWeight: '700' },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 13,
  },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  infoLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoIcon:  {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(0,212,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  infoLabel: { color: COLORS.muted, fontSize: 13 },
  infoValue: { color: COLORS.text,  fontSize: 13, fontWeight: '600' },
});