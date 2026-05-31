import React from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, TextInput,
} from 'react-native';
import { COLORS } from '../lib/theme';

// ── Card ──────────────────────────────────────────────────────────────────
export function Card({ children, style }) {
  return (
    <View style={[styles.card, style]}>
      {children}
    </View>
  );
}

// ── Button ────────────────────────────────────────────────────────────────
export function Button({ title, onPress, disabled, loading, variant = 'primary', style }) {
  const bg = variant === 'primary' ? COLORS.blue
           : variant === 'danger'  ? COLORS.danger
           : variant === 'success' ? '#10b981'
           : 'transparent';
  const border = variant === 'outline' ? COLORS.border : undefined;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.button,
        { backgroundColor: bg, borderColor: border, borderWidth: border ? 1 : 0 },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={COLORS.white} size="small" />
      ) : (
        <Text style={[styles.buttonText, variant === 'outline' && { color: COLORS.muted }]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────
export function Input({ label, error, style, ...props }) {
  return (
    <View style={{ marginBottom: 16 }}>
      {label && (
        <Text style={styles.label}>{label}</Text>
      )}
      <TextInput
        placeholderTextColor={COLORS.muted}
        style={[
          styles.input,
          error && { borderColor: COLORS.danger },
          style,
        ]}
        {...props}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────
export function Badge({ type, children }) {
  const configs = {
    inside:  { bg: 'rgba(0,229,160,0.12)',  text: COLORS.accent  },
    exited:  { bg: 'rgba(100,116,139,0.15)', text: COLORS.muted  },
    success: { bg: 'rgba(16,185,129,0.12)',  text: '#10b981'     },
    warning: { bg: 'rgba(245,158,11,0.12)',  text: COLORS.warn   },
    danger:  { bg: 'rgba(239,68,68,0.12)',   text: COLORS.danger },
    info:    { bg: 'rgba(59,130,246,0.12)',  text: COLORS.blue   },
  };
  const cfg = configs[type] || configs.info;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.text }]}>{children}</Text>
    </View>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────
export function StatCard({ label, value, color, subtitle }) {
  return (
    <Card style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      {subtitle && <Text style={styles.statSub}>{subtitle}</Text>}
    </Card>
  );
}

// ── SectionTitle ──────────────────────────────────────────────────────────
export function SectionTitle({ title, subtitle }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
    </View>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────
export function Divider({ label }) {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      {label && <Text style={styles.dividerLabel}>{label}</Text>}
      {label && <View style={styles.dividerLine} />}
    </View>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────
export function Row({ left, right, highlight }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLeft}>{left}</Text>
      <Text style={[styles.rowRight, highlight && styles.rowHighlight]}>{right}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 12,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  label: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.bg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: COLORS.text,
    fontSize: 14,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 11,
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statCard: {
    flex: 1,
    marginHorizontal: 4,
    marginBottom: 8,
    padding: 14,
  },
  statLabel: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 30,
  },
  statSub: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 4,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 4,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerLabel: {
    color: COLORS.muted,
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowLeft: {
    color: COLORS.muted,
    fontSize: 13,
  },
  rowRight: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  rowHighlight: {
    color: COLORS.cyan,
    fontSize: 16,
    fontWeight: '800',
  },
});
