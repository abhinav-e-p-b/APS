import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  RefreshControl, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS } from '../lib/theme';
import { Card, Badge, SectionTitle } from '../components/UI';

const FILTERS = ['All', 'Inside', 'Exited'];

export default function SessionsScreen() {
  const [sessions,   setSessions]   = useState([]);
  const [filter,     setFilter]     = useState('All');
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user,       setUser]       = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      fetchSessions(user?.id);
    });
  }, []);

  async function fetchSessions(userId) {
    try {
      let query = supabase
        .from('parking_sessions')
        .select('id, plate, status, entry_time, exit_time, duration_mins, is_registered, camera_entry')
        .order('entry_time', { ascending: false })
        .limit(50);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data } = await query;
      setSessions(data || []);
    } catch (err) {
      console.warn(err);
    } finally {
      setLoading(false);
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSessions(user?.id);
    setRefreshing(false);
  }, [user]);

  const filtered = sessions.filter((s) => {
    if (filter === 'Inside') return s.status === 'inside';
    if (filter === 'Exited') return s.status === 'exited';
    return true;
  });

  function fmtDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function renderItem({ item: s }) {
    return (
      <Card style={styles.sessionCard}>
        <View style={styles.sessionTop}>
          <View style={styles.platePill}>
            <Text style={styles.plateText}>{s.plate}</Text>
          </View>
          <Badge type={s.status === 'inside' ? 'inside' : 'exited'}>
            {s.status === 'inside' ? '● Inside' : 'Exited'}
          </Badge>
        </View>

        <View style={styles.sessionMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="enter-outline" size={13} color={COLORS.muted} />
            <Text style={styles.metaText}>{fmtDateTime(s.entry_time)}</Text>
          </View>
          {s.exit_time && (
            <View style={styles.metaItem}>
              <Ionicons name="exit-outline" size={13} color={COLORS.muted} />
              <Text style={styles.metaText}>{fmtDateTime(s.exit_time)}</Text>
            </View>
          )}
          {s.duration_mins != null && (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={13} color={COLORS.muted} />
              <Text style={styles.metaText}>{s.duration_mins} min</Text>
            </View>
          )}
        </View>

        <View style={styles.sessionBottom}>
          <Text style={styles.cameraText}>
            {s.camera_entry || 'ANPR'}
          </Text>
          {s.is_registered && <Badge type="warning">★ Member</Badge>}
        </View>
      </Card>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <SectionTitle title="My Sessions" subtitle="Your parking history" />
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
          >
            <Text style={[styles.filterTabText, filter === f && styles.filterTabTextActive]}>
              {f}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(_, i) => i.toString()}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.cyan}
            colors={[COLORS.cyan]}
          />
        }
        ListEmptyComponent={
          <Card>
            <Text style={{ color: COLORS.muted, textAlign: 'center', padding: 20 }}>
              {loading ? 'Loading...' : 'No sessions found'}
            </Text>
          </Card>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.bg },
  header:  { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  filterRow: {
    flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 4,
  },
  filterTab: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: COLORS.border,
  },
  filterTabActive: { backgroundColor: COLORS.blue, borderColor: COLORS.blue },
  filterTabText:   { color: COLORS.muted, fontSize: 13, fontWeight: '600' },
  filterTabTextActive: { color: COLORS.white },
  sessionCard: { marginBottom: 8 },
  sessionTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  platePill: {
    backgroundColor: 'rgba(0,229,160,0.1)',
    borderWidth: 1, borderColor: 'rgba(0,229,160,0.25)',
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4,
  },
  plateText: { color: COLORS.accent, fontWeight: '700', fontSize: 15, letterSpacing: 1 },
  sessionMeta: { gap: 5, marginBottom: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { color: COLORS.muted, fontSize: 12 },
  sessionBottom: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingTop: 8,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  cameraText: { color: COLORS.muted, fontSize: 11, fontFamily: 'monospace' },
});
