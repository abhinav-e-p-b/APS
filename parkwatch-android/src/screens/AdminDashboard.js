import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { COLORS } from '../lib/theme';
import { Card, StatCard, SectionTitle } from '../components/UI';

export default function AdminDashboard() {
  const [stats, setStats] = useState({ total: 0, occupied: 0, vacant: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async () => {
    try {
      const { data } = await supabase
        .from('parking_slots')
        .select('total, occupied')
        .eq('zone', 'A')
        .single();
        
      if (data) {
        setStats({
          total: data.total,
          occupied: data.occupied,
          vacant: Math.max(0, data.total - data.occupied)
        });
      }
    } catch (err) {
      console.warn(err);
    }
  };

  useEffect(() => {
    fetchStats();
    
    // Real-time subscription for admin dashboard
    const channel = supabase
      .channel('admin-dashboard-slots')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'parking_slots', filter: 'zone=eq.A' },
        (payload) => {
          const { total, occupied } = payload.new;
          setStats({
            total: total,
            occupied: occupied,
            vacant: Math.max(0, total - occupied)
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView 
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.cyan} />}
      >
        <SectionTitle title="Admin Dashboard" subtitle="System Overview" />
        
        <View style={styles.statsRow}>
          <StatCard label="Total Slots" value={stats.total} color={COLORS.text} />
          <StatCard label="Occupied" value={stats.occupied} color={COLORS.blue} />
          <StatCard label="Vacant" value={stats.vacant} color={COLORS.accent} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 16 },
  statsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }
});