import { useState, useEffect } from 'react'
import Badge         from '../../components/admin/Badge'
import TableCard     from '../../components/admin/TableCard'
import SectionHeader from '../../components/admin/SectionHeader'
import supabase      from '../../supabase'

const TH = ({ children }) => (
  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#8DA4BF] uppercase tracking-wide bg-[#0D1B2A] whitespace-nowrap">
    {children}
  </th>
)
const TD = ({ children, className = '' }) => (
  <td className={`px-4 py-3 text-[13px] text-white whitespace-nowrap ${className}`}>
    {children}
  </td>
)

const inputCls = "w-full bg-[#0D1B2A] border border-[#1E3550] rounded-[10px] py-3 pl-4 text-sm text-white placeholder-[#8DA4BF] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition"
const labelCls = "block text-[11px] font-medium text-[#8DA4BF] uppercase tracking-wide mb-2"

// ── Slot helpers ─────────────────────────────────────────────────────────────
// parking_slots has a single row per zone with an 'occupied' integer counter.
// There is NO per-slot status column. Increment/decrement the counter instead.

async function incrementOccupied(delta) {
  const { data: slot, error } = await supabase
    .from('parking_slots')
    .select('id, occupied, total')
    .eq('zone', 'A')
    .eq('is_active', true)
    .single()

  if (error || !slot) return

  const newVal = Math.max(0, Math.min(slot.total, slot.occupied + delta))
  await supabase
    .from('parking_slots')
    .update({ occupied: newVal, updated_at: new Date().toISOString() })
    .eq('id', slot.id)
}

export default function VehiclesSection({ showToast }) {
  const [vehicles,  setVehicles]  = useState([])
  const [loading,   setLoading]   = useState(true)

  const [addPlate,  setAddPlate]  = useState('')
  const [addOwner,  setAddOwner]  = useState('')
  const [addType,   setAddType]   = useState('2-wheeler')
  const [addSaving, setAddSaving] = useState(false)

  const [remPlate,  setRemPlate]  = useState('')
  const [remReason, setRemReason] = useState('Overstayed — Force Exit')
  const [remSaving, setRemSaving] = useState(false)

  useEffect(() => { fetchVehicles() }, [])

  async function fetchVehicles() {
    setLoading(true)
    try {
      const { data: vehicleRows, error } = await supabase
        .from('vehicles')
        .select('id, plate_number, vehicle_type, user_id, created_at')
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) throw error
      if (!vehicleRows?.length) { setVehicles([]); return }

      const vehicleIds = vehicleRows.map(v => v.id)
      const userIds    = vehicleRows.map(v => v.user_id).filter(Boolean)

      const [{ data: bookings }, { data: users }, { data: sessions }] = await Promise.all([
        supabase
          .from('bookings')
          .select('id, vehicle_id, plan, status, scheduled_entry')
          .in('vehicle_id', vehicleIds)
          .order('created_at', { ascending: false }),

        userIds.length
          ? supabase.from('users').select('id, name, phone').in('id', userIds)
          : Promise.resolve({ data: [] }),

        // Check which vehicles are currently inside via parking_sessions
        supabase
          .from('parking_sessions')
          .select('vehicle_id, plate, status, entry_time')
          .in('vehicle_id', vehicleIds)
          .eq('status', 'inside'),
      ])

      const merged = vehicleRows.map(v => {
        const vehicleBookings = (bookings || []).filter(b => b.vehicle_id === v.id)
        const latestBooking   = vehicleBookings[0] || null
        const owner           = (users || []).find(u => u.id === v.user_id) || null
        const activeSession   = (sessions || []).find(s => s.vehicle_id === v.id) || null
        return { ...v, booking: latestBooking, owner, activeSession }
      })

      setVehicles(merged)
    } catch (err) {
      console.error('fetchVehicles error:', err)
      showToast('Failed to load vehicles', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd() {
    if (!addPlate.trim()) { showToast('Enter a vehicle number', 'error'); return }
    setAddSaving(true)

    const plate = addPlate.trim().toUpperCase()

    try {
      // 1. Insert vehicle (user_id is nullable for admin manual entries)
      const { data: vehicle, error: vErr } = await supabase
        .from('vehicles')
        .insert({
          plate_number: plate,
          vehicle_type: addType,
          owner_name:   addOwner.trim() || null,
          is_active:    true,
          // user_id omitted — nullable in schema for manual admin entries
        })
        .select('id')
        .single()

      if (vErr) {
        // Duplicate plate — look it up instead
        if (vErr.code === '23505') {
          showToast(`Plate ${plate} already registered`, 'error')
          setAddSaving(false)
          return
        }
        throw vErr
      }

      // 2. Create a parking session — camera_entry is NOT NULL in schema
      const { error: sessErr } = await supabase
        .from('parking_sessions')
        .insert({
          plate:        plate,
          vehicle_id:   vehicle.id,
          camera_entry: 'MANUAL_ADMIN',
          entry_time:   new Date().toISOString(),
          status:       'inside',            // FIX: use 'inside', not 'active'
          is_registered: false,
        })

      if (sessErr) throw sessErr

      // 3. Increment the occupied counter (no per-slot status column exists)
      await incrementOccupied(1)

      showToast(`Vehicle ${plate} added and marked as inside`, 'success')
      setAddPlate(''); setAddOwner('')
      fetchVehicles()

    } catch (err) {
      console.error(err)
      showToast('Failed to add vehicle: ' + (err.message || err), 'error')
    } finally {
      setAddSaving(false)
    }
  }

  async function handleForceExit(plateNumber) {
    const plate = (plateNumber || remPlate).trim().toUpperCase()
    if (!plate) { showToast('Enter a vehicle number', 'error'); return }
    setRemSaving(true)

    try {
      // 1. Find and close the active parking session by plate
      //    Use plate column (indexed) — more reliable than vehicle_id lookup
      const { data: activeSessions, error: findErr } = await supabase
        .from('parking_sessions')
        .select('id, entry_time')
        .eq('plate', plate)
        .eq('status', 'inside')
        .order('entry_time', { ascending: false })
        .limit(1)

      if (findErr) throw findErr

      if (!activeSessions?.length) {
        showToast(`${plate} is not currently inside`, 'error')
        setRemSaving(false)
        return
      }

      const session    = activeSessions[0]
      const exitTime   = new Date().toISOString()
      const entryTime  = new Date(session.entry_time)
      const durationMs = new Date(exitTime) - entryTime
      const duration   = Math.round(durationMs / 60000)

      // 2. Update session to exited — use 'exited' (matches ANPR Python backend)
      const { error: updateErr } = await supabase
        .from('parking_sessions')
        .update({
          status:       'exited',           // FIX: use 'exited', not 'completed'
          exit_time:    exitTime,
          duration_mins: duration,
          camera_exit:  'MANUAL_ADMIN',
        })
        .eq('id', session.id)

      if (updateErr) throw updateErr

      // 3. Update any active/confirmed bookings for this plate's vehicle
      //    (optional — not critical, but keeps booking status consistent)
      const { data: vehicleRow } = await supabase
        .from('vehicles')
        .select('id')
        .eq('plate_number', plate)
        .single()

      if (vehicleRow) {
        await supabase
          .from('bookings')
          .update({ status: 'completed' })
          .eq('vehicle_id', vehicleRow.id)
          .in('status', ['confirmed', 'active'])
      }

      // 4. Decrement the occupied counter
      await incrementOccupied(-1)

      showToast(`${plate} force exited (${duration} min)`, 'success')
      if (!plateNumber) setRemPlate('')
      fetchVehicles()

    } catch (err) {
      console.error(err)
      showToast('Failed to force exit: ' + (err.message || err), 'error')
    } finally {
      setRemSaving(false)
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    })
  }

  function formatTime(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  }

  // A vehicle is "inside" if it has an active parking_session (status='inside')
  function isInside(vehicle) {
    return !!vehicle.activeSession
  }

  return (
    <div className="space-y-6">
      <SectionHeader title="Vehicles & Manual Controls" subtitle="All registered vehicles + manual entry/exit overrides" />

      {/* ── Manual controls ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Add vehicle */}
        <div className="bg-[#132033] border border-[#1E3550] rounded-2xl p-6">
          <h3 className="text-[15px] font-semibold text-white mb-5" style={{ fontFamily: 'Syne, sans-serif' }}>
            ➕ Add Vehicle Manually
          </h3>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Vehicle Number</label>
              <input value={addPlate} onChange={(e) => setAddPlate(e.target.value.toUpperCase())}
                placeholder="e.g. KL 22 AA 9999" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Owner Name (optional)</label>
              <input value={addOwner} onChange={(e) => setAddOwner(e.target.value)}
                placeholder="Owner's name" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Vehicle Type</label>
              <select value={addType} onChange={(e) => setAddType(e.target.value)}
                className={inputCls + ' cursor-pointer'} style={{ WebkitAppearance: 'none' }}>
                <option value="2-wheeler">2-Wheeler</option>
                <option value="4-wheeler">4-Wheeler</option>
                <option value="suv-van">SUV / Van</option>
              </select>
            </div>
            <button onClick={handleAdd} disabled={addSaving}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-800 rounded-xl text-white text-[14px] font-semibold hover:-translate-y-px hover:shadow-lg hover:shadow-blue-600/30 transition-all disabled:opacity-60">
              {addSaving ? 'Adding...' : 'Add to System'}
            </button>
          </div>
        </div>

        {/* Force exit */}
        <div className="bg-[#132033] border border-[#1E3550] rounded-2xl p-6">
          <h3 className="text-[15px] font-semibold text-white mb-5" style={{ fontFamily: 'Syne, sans-serif' }}>
            ❌ Remove / Force Exit
          </h3>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Vehicle Number</label>
              <input value={remPlate} onChange={(e) => setRemPlate(e.target.value.toUpperCase())}
                placeholder="e.g. KL 11 AB 1234" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Reason</label>
              <select value={remReason} onChange={(e) => setRemReason(e.target.value)}
                className={inputCls + ' cursor-pointer'} style={{ WebkitAppearance: 'none' }}>
                <option>Overstayed — Force Exit</option>
                <option>Emergency removal</option>
                <option>Wrong vehicle detected</option>
                <option>Payment issue resolved</option>
              </select>
            </div>
            <div className="h-[18px]" />
            <button onClick={() => handleForceExit(null)} disabled={remSaving}
              className="w-full py-3 bg-gradient-to-r from-red-500 to-red-700 rounded-xl text-white text-[14px] font-semibold hover:-translate-y-px hover:shadow-lg transition-all disabled:opacity-60">
              {remSaving ? 'Processing...' : 'Force Exit Vehicle'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Vehicles table ── */}
      <TableCard title="All Registered Vehicles">
        <thead>
          <tr>
            <TH>Vehicle No.</TH>
            <TH>Owner</TH>
            <TH>Type</TH>
            <TH>Entry Time</TH>
            <TH>Plan</TH>
            <TH>Status</TH>
            <TH>Action</TH>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="px-4 py-6 text-center text-[13px] text-[#8DA4BF]">Loading...</td></tr>
          ) : vehicles.length === 0 ? (
            <tr><td colSpan={7} className="px-4 py-6 text-center text-[13px] text-[#8DA4BF]">No vehicles yet</td></tr>
          ) : (
            vehicles.map((v) => (
              <tr key={v.id} className="border-b border-[#1E3550] last:border-0 hover:bg-blue-500/10 transition-colors">
                <TD><strong>{v.plate_number}</strong></TD>
                <TD>{v.owner?.name || v.owner_name || '—'}</TD>
                <TD className="capitalize">{v.vehicle_type || '—'}</TD>
                <TD>{v.activeSession ? formatTime(v.activeSession.entry_time) : formatDate(v.booking?.scheduled_entry)}</TD>
                <TD className="capitalize">{v.booking?.plan || '—'}</TD>
                <TD>
                  <Badge type={isInside(v) ? 'inside' : 'exited'}>
                    {isInside(v) ? '● Inside' : 'Exited'}
                  </Badge>
                </TD>
                <TD>
                  {isInside(v)
                    ? <button onClick={() => handleForceExit(v.plate_number)}
                        className="px-3 py-1 bg-gradient-to-r from-red-500 to-red-700 rounded-lg text-white text-[11px] font-semibold hover:-translate-y-px transition-all">
                        Force Exit
                      </button>
                    : <span className="text-[#8DA4BF] text-[12px]">—</span>
                  }
                </TD>
              </tr>
            ))
          )}
        </tbody>
      </TableCard>
    </div>
  )
}