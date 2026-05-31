import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, StyleSheet, Text, View, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { COLORS } from '../lib/theme';
import { Card, SectionTitle, Badge } from '../components/UI';

export default function VehiclesScreen() {
  const [vehicles, setVehicles] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchVehicles = async () => {
    try {
      const { data } = await supabase.from('vehicles').select('*').order('created_at', { ascending: false });
      if (data) setVehicles(data);
    } catch (err) {
      console.warn(err);
    }
  };

  useEffect(() => { fetchVehicles(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchVehicles();
    setRefreshing(false);
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <SectionTitle title="Registered Vehicles" subtitle="All authorized plates" />
      </View>
      <FlatList
        data={vehicles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.cyan} />}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <Text style={styles.plate}>{item.plate_number}</Text>
            <Badge type="info">{item.vehicle_type}</Badge>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: { padding: 16, paddingBottom: 0 },
  list: { padding: 16 },
  card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  plate: { color: COLORS.text, fontSize: 16, fontWeight: '700', letterSpacing: 1 }
});