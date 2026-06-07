import React, { useState } from 'react';
import { View, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { COLORS } from '../lib/theme';
import { Button, Input, SectionTitle, Card } from '../components/UI';

export default function ManualEntryScreen() {
  const [plate, setPlate] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAction = async (action) => {
    if (plate.trim().length < 4) {
      Alert.alert('Error', 'Enter a valid plate number.');
      return;
    }
    
    setLoading(true);
    try {
      if (action === 'entry') {
        const { error } = await supabase.from('parking_sessions').insert({
          plate: plate.toUpperCase().trim(),
          status: 'inside',
          entry_time: new Date().toISOString(),
          camera_entry: 'MANUAL_OVERRIDE'
        });
        if (error) throw error;
        Alert.alert('Success', `${plate} marked as ENTERED.`);
      } else {
        const { data: updatedRows, error } = await supabase.from('parking_sessions')
          .update({ status: 'exited', exit_time: new Date().toISOString() })
          .eq('plate', plate.toUpperCase().trim())
          .eq('status', 'inside')
          .select();
        if (error) throw error;
        if (!updatedRows || updatedRows.length === 0) {
          Alert.alert('Not Found', `${plate.toUpperCase()} is not currently marked as inside.`);
        } else {
          Alert.alert('Success', `${plate.toUpperCase()} marked as EXITED.`);
        }
      }
      setPlate('');
    } catch (err) {
      Alert.alert('Action Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <SectionTitle title="Manual Override" subtitle="Log vehicles manually if ANPR fails" />
          <Card>
            <Input 
              label="Vehicle Plate Number" 
              placeholder="e.g. KL 11 AB 1234" 
              value={plate} 
              onChangeText={setPlate} 
              autoCapitalize="characters" 
            />
            <View style={styles.btnRow}>
              <Button title="Log Entry" onPress={() => handleAction('entry')} style={{ flex: 1 }} loading={loading} />
              <Button title="Log Exit" onPress={() => handleAction('exit')} variant="outline" style={{ flex: 1 }} loading={loading} />
            </View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 16 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 10 }
});