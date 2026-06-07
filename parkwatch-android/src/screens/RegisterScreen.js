import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS, PARKING_PLANS, VEHICLE_TYPES } from '../lib/theme';
import { Button, Input, Card, Row } from '../components/UI';

// ── Step indicator ────────────────────────────────────────────────────────
function StepBar({ step }) {
  const labels = ['Details', 'Payment', 'Confirm'];
  return (
    <View style={styles.stepBar}>
      {labels.map((label, i) => {
        const n = i + 1;
        const done   = n < step;
        const active = n === step;
        return (
          <React.Fragment key={n}>
            <View style={styles.stepItem}>
              <View style={[
                styles.stepCircle,
                done   && { backgroundColor: '#10b981', borderColor: '#10b981' },
                active && { backgroundColor: COLORS.blue, borderColor: COLORS.blue },
              ]}>
                <Text style={styles.stepNum}>{done ? '✓' : n}</Text>
              </View>
              <Text style={[
                styles.stepLabel,
                done   && { color: '#10b981' },
                active && { color: COLORS.text },
              ]}>
                {label}
              </Text>
            </View>
            {i < 2 && (
              <View style={[styles.stepLine, done && { backgroundColor: '#10b981' }]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ── Payment modal ─────────────────────────────────────────────────────────
function PayModal({ visible, plan, method, onSuccess, onClose }) {
  const [otp, setOtp]     = useState('');
  const [sent, setSent]   = useState(false);
  const [err, setErr]     = useState('');
  const [busy, setBusy]   = useState(false);

  function reset() { setOtp(''); setSent(false); setErr(''); }

  function handleClose() { reset(); onClose(); }

  function verify() {
    if (method === 'upi' && otp !== '1234') {
      setErr('Invalid OTP. (Hint: 1234)');
      return;
    }
    setBusy(true);
    setTimeout(() => { setBusy(false); reset(); onSuccess(); }, 1200);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Complete Payment</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={22} color={COLORS.muted} />
            </TouchableOpacity>
          </View>

          <View style={styles.amountRow}>
            <View>
              <Text style={styles.amountLabel}>Amount Due</Text>
              <Text style={styles.amountPlan}>{plan?.label}</Text>
            </View>
            <Text style={styles.amountValue}>₹{plan?.price}</Text>
          </View>

          {method === 'upi' && (
            <View>
              {!sent ? (
                <Button title="Send OTP →" onPress={() => setSent(true)} />
              ) : (
                <>
                  <Input
                    label="Enter OTP (sent to your UPI app)"
                    value={otp}
                    onChangeText={(v) => { setOtp(v.slice(0, 4)); setErr(''); }}
                    placeholder="• • • •"
                    keyboardType="number-pad"
                    error={err}
                    style={{ textAlign: 'center', letterSpacing: 8, fontSize: 20 }}
                  />
                  <Text style={styles.otpHint}>Demo OTP: <Text style={{ color: COLORS.cyan, fontWeight: '700' }}>1234</Text></Text>
                  <Button
                    title={busy ? 'Processing...' : '✓ Verify & Pay'}
                    onPress={verify}
                    loading={busy}
                    disabled={otp.length !== 4}
                  />
                </>
              )}
            </View>
          )}

          {method === 'card' && (
            <View>
              <Text style={styles.demoNote}>Demo card — pre-filled for testing</Text>
              <Button
                title={busy ? 'Processing...' : `✓ Pay ₹${plan?.price}`}
                onPress={verify}
                loading={busy}
              />
            </View>
          )}

          {method === 'net-banking' && (
            <View>
              <Text style={styles.demoNote}>Select any bank to continue in demo mode</Text>
              <View style={styles.bankGrid}>
                {['SBI', 'HDFC', 'ICICI', 'Axis', 'Kotak'].map((bank) => (
                  <TouchableOpacity key={bank} style={styles.bankBtn}>
                    <Text style={styles.bankBtnText}>{bank}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Button
                title={busy ? 'Processing...' : '✓ Confirm Payment'}
                onPress={verify}
                loading={busy}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────
export default function RegisterScreen() {
  const [user,          setUser]       = useState(null);
  const [step,          setStep]       = useState(1);
  const [success,       setSuccess]    = useState(false);
  const [bookingId,     setBookingId]  = useState('');
  const [saving,        setSaving]     = useState(false);
  const [showPayModal,  setShowModal]  = useState(false);

  // Step 1
  const [plate,      setPlate]      = useState('');
  const [plateErr,   setPlateErr]   = useState('');
  const [arrivalDate, setArrivalDate] = useState(new Date().toISOString().slice(0, 10));
  const [vehicleType, setVehicleType] = useState('2-wheeler');

  // Step 2
  const [selectedPlan, setSelectedPlan] = useState(PARKING_PLANS[0]);
  const [payMethod,    setPayMethod]    = useState('upi');

  // IDs
  const [vehicleId, setVehicleId] = useState(null);
  const [slotId,    setSlotId]    = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUser(user);
    });
  }, []);

  async function handleStep1() {
    if (plate.trim().length < 4) {
      setPlateErr('Enter a valid vehicle number (min 4 chars)');
      return;
    }
    setPlateErr('');
    setSaving(true);
    try {
      const { data: vehicle, error } = await supabase
        .from('vehicles')
        .upsert(
          { user_id: user?.id, plate_number: plate.trim().toUpperCase(), vehicle_type: vehicleType, is_active: true },
          { onConflict: 'plate_number' }
        )
        .select('id').single();
      if (error) throw error;
      setVehicleId(vehicle.id);
      setStep(2);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save vehicle.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStep2() {
    setSaving(true);
    try {
      const { data: slot, error } = await supabase
        .from('parking_slots')
        .select('id, total, occupied')
        .eq('zone', 'A').eq('is_active', true).single();
      if (error || !slot) throw new Error('Could not fetch slot info.');
      if (slot.occupied >= slot.total) {
        Alert.alert('Full', 'Parking is full right now.');
        setSaving(false);
        return;
      }
      setSlotId(slot.id);
      setStep(3);
    } catch (err) {
      Alert.alert('Error', err.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePaymentSuccess() {
    setSaving(true);
    try {
      const entry = new Date(arrivalDate);
      const exit  = new Date(arrivalDate);
      if (selectedPlan.id === 'daily')   exit.setDate(entry.getDate() + 1);
      if (selectedPlan.id === 'weekly')  exit.setDate(entry.getDate() + 7);
      if (selectedPlan.id === 'monthly') exit.setMonth(entry.getMonth() + 1);
      if (selectedPlan.id === 'yearly')  exit.setFullYear(entry.getFullYear() + 1);

      const { data: booking, error: bookErr } = await supabase
        .from('bookings')
        .insert({
          user_id: user.id, vehicle_id: vehicleId, slot_id: slotId,
          plan: selectedPlan.id,
          scheduled_entry: entry.toISOString().slice(0, 10),
          scheduled_exit:  exit.toISOString().slice(0, 10),
          amount: selectedPlan.price, status: 'confirmed',
        })
        .select('id').single();
      if (bookErr) throw bookErr;

      const { error: payErr } = await supabase.from('payments').insert({
        booking_id: booking.id, method: payMethod,
        status: 'success', amount: selectedPlan.price,
        transaction_id: 'SP-' + Math.floor(100000 + Math.random() * 900000),
        paid_at: new Date().toISOString(),
      });
      if (payErr) throw payErr;

      setShowModal(false);
      setBookingId('SP-' + (booking?.id?.slice(0, 8) ?? 'UNKNOWN').toUpperCase());
      setSuccess(true);
    } catch (err) {
      Alert.alert('Error', err.message || 'Payment failed. Try again.');
    } finally {
      setSaving(false);
    }
  }

  function resetAll() {
    setStep(1); setSuccess(false); setBookingId('');
    setPlate(''); setPlateErr('');
    setArrivalDate(new Date().toISOString().slice(0, 10));
    setVehicleType('2-wheeler');
    setSelectedPlan(PARKING_PLANS[0]);
    setPayMethod('upi');
    setVehicleId(null); setSlotId(null);
  }

  // ── Success screen ──────────────────────────────────────────────────────
  if (success) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={[styles.scroll, styles.successScroll]}>
          <Text style={styles.successEmoji}>✅</Text>
          <Text style={styles.successTitle}>You're all set!</Text>
          <Text style={styles.successSub}>
            Your vehicle is registered.{'\n'}Show up — the camera does the rest.
          </Text>
          <View style={styles.bookingIdBox}>
            <Text style={styles.bookingId}>{bookingId}</Text>
          </View>
          <Button title="Register Another Vehicle" onPress={resetAll} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.pageTitle}>Vehicle Registration</Text>
          {user && (
            <Text style={styles.pageSub}>
              Logged in as{' '}
              <Text style={{ color: COLORS.cyan }}>{user.email}</Text>
            </Text>
          )}

          <StepBar step={step} />

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <View>
              <Input
                label="Vehicle Number"
                value={plate}
                onChangeText={(v) => { setPlate(v.toUpperCase()); setPlateErr(''); }}
                placeholder="e.g. KL 11 AB 1234"
                autoCapitalize="characters"
                error={plateErr}
              />

              <Text style={styles.fieldLabel}>Vehicle Type</Text>
              <View style={styles.typeGrid}>
                {VEHICLE_TYPES.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    onPress={() => setVehicleType(v.id)}
                    style={[
                      styles.typeCard,
                      vehicleType === v.id && styles.typeCardActive,
                    ]}
                  >
                    <Text style={styles.typeEmoji}>{v.emoji}</Text>
                    <Text style={[styles.typeLabel, vehicleType === v.id && { color: COLORS.text }]}>
                      {v.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Button
                title={saving ? 'Saving...' : 'Continue to Payment →'}
                onPress={handleStep1}
                loading={saving}
              />
            </View>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <View>
              <Text style={styles.fieldLabel}>Select Plan</Text>
              <View style={styles.planGrid}>
                {PARKING_PLANS.map((plan) => (
                  <TouchableOpacity
                    key={plan.id}
                    onPress={() => setSelectedPlan(plan)}
                    style={[
                      styles.planCard,
                      selectedPlan.id === plan.id && styles.planCardActive,
                    ]}
                  >
                    {plan.popular && (
                      <View style={styles.popularBadge}>
                        <Text style={styles.popularText}>Popular</Text>
                      </View>
                    )}
                    <Text style={styles.planLabel}>{plan.label}</Text>
                    <Text style={styles.planPrice}>₹{plan.price}</Text>
                    <Text style={styles.planPeriod}>{plan.period}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Payment Method</Text>
              <View style={styles.payRow}>
                {[
                  { id: 'upi', icon: '📲', label: 'UPI' },
                  { id: 'card', icon: '💳', label: 'Card' },
                  { id: 'net-banking', icon: '🏦', label: 'Net Banking' },
                ].map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    onPress={() => setPayMethod(m.id)}
                    style={[
                      styles.payCard,
                      payMethod === m.id && styles.payCardActive,
                    ]}
                  >
                    <Text style={styles.payIcon}>{m.icon}</Text>
                    <Text style={[styles.payLabel, payMethod === m.id && { color: COLORS.text }]}>
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.btnRow}>
                <Button title="← Back" onPress={() => setStep(1)} variant="outline" style={{ flex: 1 }} />
                <Button
                  title={saving ? 'Checking...' : 'Review →'}
                  onPress={handleStep2}
                  loading={saving}
                  style={{ flex: 2 }}
                />
              </View>
            </View>
          )}

          {/* ── STEP 3 ── */}
          {step === 3 && (
            <View>
              <Card>
                <Row left="Vehicle" right={plate} />
                <Row left="Type"    right={vehicleType} />
                <Row left="Arrival" right={arrivalDate} />
                <Row left="Plan"    right={selectedPlan.label} />
                <Row left="Method"  right={payMethod.toUpperCase()} />
                <Row left="Total"   right={`₹${selectedPlan.price}`} highlight />
              </Card>

              <View style={styles.availRow}>
                <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                <Text style={styles.availText}>Parking slot available</Text>
              </View>

              <View style={styles.btnRow}>
                <Button title="← Back" onPress={() => setStep(2)} variant="outline" style={{ flex: 1 }} />
                <Button
                  title={saving ? 'Processing...' : '✓ Confirm & Pay'}
                  onPress={() => setShowModal(true)}
                  loading={saving}
                  style={{ flex: 2 }}
                />
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <PayModal
        visible={showPayModal}
        plan={selectedPlan}
        method={payMethod}
        onSuccess={handlePaymentSuccess}
        onClose={() => setShowModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.bg },
  scroll:  { padding: 16, paddingBottom: 40 },
  pageTitle: { color: COLORS.text, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  pageSub:   { color: COLORS.muted, fontSize: 13, marginBottom: 20 },
  stepBar:   { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  stepItem:  { alignItems: 'center', gap: 4 },
  stepCircle: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  stepNum:   { color: COLORS.text, fontSize: 11, fontWeight: '700' },
  stepLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '600' },
  stepLine:  { flex: 1, height: 1.5, backgroundColor: COLORS.border, marginBottom: 14, marginHorizontal: 4 },
  fieldLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  typeGrid: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  typeCard: {
    flex: 1, alignItems: 'center', padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, backgroundColor: COLORS.bg,
  },
  typeCardActive: { borderColor: COLORS.blue, backgroundColor: 'rgba(59,130,246,0.1)' },
  typeEmoji: { fontSize: 24, marginBottom: 6 },
  typeLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '600' },
  planGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  planCard: {
    width: '47%', padding: 14, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  planCardActive: { borderColor: COLORS.cyan, backgroundColor: 'rgba(0,212,255,0.06)' },
  popularBadge: {
    backgroundColor: COLORS.blue, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 6,
  },
  popularText: { color: COLORS.white, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  planLabel:   { color: COLORS.text, fontSize: 13, fontWeight: '600', marginBottom: 4 },
  planPrice:   { color: COLORS.cyan, fontSize: 22, fontWeight: '800' },
  planPeriod:  { color: COLORS.muted, fontSize: 11 },
  payRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  payCard: {
    flex: 1, alignItems: 'center', padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, backgroundColor: COLORS.bg,
  },
  payCardActive: { borderColor: COLORS.blue, backgroundColor: 'rgba(59,130,246,0.1)' },
  payIcon:  { fontSize: 22, marginBottom: 4 },
  payLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '600' },
  btnRow:   { flexDirection: 'row', gap: 10 },
  availRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)',
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  availText: { color: '#10b981', fontSize: 13, fontWeight: '600' },
  successScroll: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  successEmoji: { fontSize: 64, marginBottom: 20 },
  successTitle: { color: COLORS.text, fontSize: 24, fontWeight: '800', marginBottom: 10 },
  successSub:   { color: COLORS.muted, fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  bookingIdBox: {
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24, marginBottom: 24,
  },
  bookingId: { color: COLORS.cyan, fontSize: 20, fontWeight: '800', letterSpacing: 4 },
  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, borderWidth: 1, borderColor: COLORS.border,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:  { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  amountRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(59,130,246,0.08)', borderRadius: 12,
    padding: 16, marginBottom: 20,
  },
  amountLabel: { color: COLORS.muted, fontSize: 12 },
  amountPlan:  { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  amountValue: { color: COLORS.cyan, fontSize: 28, fontWeight: '800' },
  otpHint:  { color: COLORS.muted, fontSize: 12, textAlign: 'center', marginTop: -8, marginBottom: 12 },
  demoNote: { color: COLORS.muted, fontSize: 12, marginBottom: 12 },
  bankGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  bankBtn:  {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  bankBtnText: { color: COLORS.muted, fontSize: 13 },
});
