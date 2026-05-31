import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert,
  KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { COLORS } from '../lib/theme';
import { Button, Input, Card } from '../components/UI';

export default function SignupScreen({ navigation }) {
  const [user,    setUser]    = useState(null);
  const [name,    setName]    = useState('');
  const [phone,   setPhone]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [errors,  setErrors]  = useState({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUser(user);
      if (user.user_metadata?.full_name) setName(user.user_metadata.full_name);
    });
  }, []);

  async function handleSubmit() {
    const errs = {};
    if (name.trim().length < 2) errs.name = 'Enter your full name';
    if (!/^\d{10}$/.test(phone))  errs.phone = 'Enter a valid 10-digit number';
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ name: name.trim(), phone: '+91' + phone })
        .eq('id', user.id);
      if (error) throw error;
      Alert.alert('Done!', 'Profile saved. Welcome to SmartPark 🚀');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save. Try again.');
    } finally {
      setSaving(false);
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
          {/* Google account banner */}
          {user && (
            <Card style={styles.accountBanner}>
              <View style={styles.accountRow}>
                {user.user_metadata?.avatar_url && (
                  <Image
                    source={{ uri: user.user_metadata.avatar_url }}
                    style={styles.avatar}
                  />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.accountName}>{user.user_metadata?.full_name}</Text>
                  <Text style={styles.accountEmail}>{user.email}</Text>
                </View>
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedText}>✓ Google</Text>
                </View>
              </View>
            </Card>
          )}

          <Text style={styles.title}>Complete your profile</Text>
          <Text style={styles.subtitle}>Two more things and you're set</Text>

          <Input
            label="Full Name"
            value={name}
            onChangeText={(v) => { setName(v); setErrors({ ...errors, name: '' }); }}
            placeholder="Your full name"
            error={errors.name}
          />

          <Input
            label="Phone Number"
            value={phone}
            onChangeText={(v) => {
              setPhone(v.replace(/\D/g, '').slice(0, 10));
              setErrors({ ...errors, phone: '' });
            }}
            placeholder="10-digit mobile number"
            keyboardType="phone-pad"
            error={errors.phone}
          />

          <Card>
            <Text style={styles.savedLabel}>Already saved from Google</Text>
            <View style={styles.savedRow}>
              <Text style={styles.savedItem}>✓ Email</Text>
              <Text style={styles.savedItem}>✓ Profile photo</Text>
            </View>
          </Card>

          <Button
            title={saving ? 'Saving...' : 'Complete Setup ✓'}
            onPress={handleSubmit}
            loading={saving}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: COLORS.bg },
  scroll:       { padding: 20, paddingBottom: 40 },
  accountBanner: { marginBottom: 20 },
  accountRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar:       { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border },
  accountName:  { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  accountEmail: { color: COLORS.muted, fontSize: 12 },
  verifiedBadge: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)',
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
  },
  verifiedText: { color: '#10b981', fontSize: 10, fontWeight: '700' },
  title:        { color: COLORS.text, fontSize: 22, fontWeight: '800', marginBottom: 6 },
  subtitle:     { color: COLORS.muted, fontSize: 13, marginBottom: 24 },
  savedLabel:   { color: COLORS.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  savedRow:     { flexDirection: 'row', gap: 16 },
  savedItem:    { color: '#10b981', fontSize: 13 },
});
