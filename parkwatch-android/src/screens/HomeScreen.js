import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  RefreshControl, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS } from '../lib/theme';
import { Card, StatCard, Badge, SectionTitle } from '../components/UI';

export default function HomeScreen({ navigation }) {
  const [user,      setUser]      = useState(null);
  const [occ,       setOcc]       = useState({ total: 0, occupied: 0, vacant: 0, pct: 0 });
  const [sessions,  setSessions]  = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const userIdRef = useRef(null); // ref so real-time callbacks always have current userId

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        userIdRef.current = user.id; // store in ref so real-time callbacks are never stale
        setUser(user);
        fetchData(user.id);
      }
    });

    // Real-time subscription to parking_slots changes
    const slotsSubscription = supabase
      .channel('public:parking_slots')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'parking_slots', filter: 'zone=eq.A' },
        (payload) => {
          const { total, occupied } = payload.new;
          const vacant = Math.max(0, total - occupied);
          const pct = total ? Math.round((occupied / total) * 100) : 0;
          setOcc({ total, occupied, vacant, pct });
        }
      )
      .subscribe();

    // Subscribe to parking_sessions for real-time list updates
    const sessionsSubscription = supabase
      .channel('public:parking_sessions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parking_sessions' },
        () => {
          // Use ref so this callback always reads the latest userId (fixes stale closure bug)
          fetchData(userIdRef.current);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(slotsSubscription);
      supabase.removeChannel(sessionsSubscription);
    };
  }, []);

  async function fetchData(userId) {
    try {
      const [slotRes, sessRes] = await Promise.all([
        supabase
          .from('parking_slots')
          .select('total, occupied')
          .eq('zone', 'A')
          .eq('is_active', true)
          .single(),
        supabase
          .from('parking_sessions')
          .select('plate, status, entry_time, exit_time, duration_mins, is_registered, camera_entry')
          .order('entry_time', { ascending: false })
          .limit(10),
      ]);

      if (slotRes.data) {
        const { total, occupied } = slotRes.data;
        const vacant = Math.max(0, total - occupied);
        const pct    = total ? Math.round(occupied / total * 100) : 0;
        setOcc({ total, occupied, vacant, pct });
      }
      if (sessRes.data) setSessions(sessRes.data);
    } catch (err) {
      console.warn('fetchData error:', err);
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchData(user?.id); // pass userId so the query is scoped correctly
    } finally {
      setRefreshing(false);
    }
  }, [user]);

  function fmtTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  const barColor = occ.pct < 70 ? COLORS.accent : occ.pct < 90 ? COLORS.warn : COLORS.danger;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.cyan}
            colors={[COLORS.cyan]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              Hello, {user?.user_metadata?.full_name?.split(' ')[0] || 'there'} 👋
            </Text>
            <Text style={styles.headerSub}>Live parking overview</Text>
          </View>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Live</Text>
          </View>
        </View>

        {/* Occupancy gauge card */}
        <Card style={styles.gaugeCard}>
          <View style={styles.gaugeHeader}>
            <Text style={styles.gaugeTitle}>Parking Occupancy</Text>
            <Text style={[styles.gaugePct, { color: barColor }]}>{occ.pct}%</Text>
          </View>

          {/* Progress bar */}
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${occ.pct}%`, backgroundColor: barColor }]} />
          </View>
          <View style={styles.barLabels}>
            <Text style={styles.barLabel}>0</Text>
            <Text style={styles.barLabel}>{occ.occupied} / {occ.total} occupied</Text>
            <Text style={styles.barLabel}>{occ.total}</Text>
          </View>
        </Card>

        {/* Stat cards */}
        <View style={styles.statsRow}>
          <StatCard label="Vacant"   value={occ.vacant}   color={COLORS.accent}  subtitle={`of ${occ.total}`} />
          <StatCard label="Occupied" value={occ.occupied} color={COLORS.blue}    subtitle={`${occ.pct}% full`} />
        </View>

        {/* Recent sessions */}
        <SectionTitle title="Recent Sessions" subtitle="Latest ANPR activity" />

        {sessions.length === 0 ? (
          <Card>
            <Text style={{ color: COLORS.muted, textAlign: 'center', padding: 12 }}>
              No sessions yet
            </Text>
          </Card>
        ) : (
          sessions.map((s, i) => (
            <Card key={i} style={styles.sessionCard}>
              <View style={styles.sessionRow}>
                <View style={styles.platePill}>
                  <Text style={styles.plateText}>{s.plate}</Text>
                </View>
                <Badge type={s.status === 'inside' ? 'inside' : 'exited'}>
                  {s.status === 'inside' ? '● Inside' : 'Exited'}
                </Badge>
              </View>
              <View style={[styles.sessionRow, { marginTop: 8 }]}>
                <Text style={styles.sessionMeta}>
                  <Ionicons name="time-outline" size={12} color={COLORS.muted} />{' '}
                  {fmtTime(s.entry_time)}
                </Text>
                {s.duration_mins != null && (
                  <Text style={styles.sessionMeta}>{s.duration_mins} min</Text>
                )}
                {s.is_registered && (
                  <Badge type="warning">★ Member</Badge>
                )}
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 16, paddingBottom: 32 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 20, marginTop: 8,
  },
  greeting:  { color: COLORS.text, fontSize: 20, fontWeight: '800' },
  headerSub: { color: COLORS.muted, fontSize: 13, marginTop: 2 },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  liveDot: {
    width: 7, height: 7, borderRadius: 4, backgroundColor: '#10b981',
  },
  liveText: { color: '#10b981', fontSize: 12, fontWeight: '700' },
  gaugeCard:   { padding: 20, marginBottom: 8 },
  gaugeHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  gaugeTitle:  { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  gaugePct:    { fontSize: 22, fontWeight: '800' },
  barTrack:    { height: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 5, overflow: 'hidden' },
  barFill:     { height: '100%', borderRadius: 5 },
  barLabels:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  barLabel:    { color: COLORS.muted, fontSize: 11 },
  statsRow:    { flexDirection: 'row', marginHorizontal: -4, marginBottom: 16 },
  sessionCard: { padding: 14, marginBottom: 8 },
  sessionRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  platePill:   {
    backgroundColor: 'rgba(0,229,160,0.1)',
    borderWidth: 1, borderColor: 'rgba(0,229,160,0.25)',
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4,
  },
  plateText:   { color: COLORS.accent, fontWeight: '700', fontSize: 14, letterSpacing: 1 },
  sessionMeta: { color: COLORS.muted, fontSize: 12 },
});
