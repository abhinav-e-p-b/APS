import { useState, useEffect } from 'react'
import StatCard  from '../../components/admin/StatCard'
import Badge     from '../../components/admin/Badge'
import TableCard from '../../components/admin/TableCard'
import supabase  from '../../supabase'

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

export default function DashboardSection({ onViewAll }) {
  const today = new Date().toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  })

  const [stats, setStats] = useState({
    totalToday:       0,
    currentlyInside:  0,
    availableSlots:   0,
    totalSlots:       0,
    revenue:          '₹0',
    occupancyPercent: 0,
  })
  const [recentBookings, setRecentBookings] = useState([])
  const [loading,        setLoading]        = useState(true)

  useEffect(() => {
    fetchDashboardData()
    
    // Set up Realtime subscriptions for live dashboard updates
    const slotsChannel = supabase
      .channel('dashboard-slots')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'parking_slots', filter: 'zone=eq.A' },
        (payload) => {
          const { total, occupied } = payload.new
          setStats(prev => ({
            ...prev,
            availableSlots: Math.max(0, total - occupied),
            totalSlots: total,
            occupancyPercent: total ? Math.round((occupied / total) * 100) : 0,
            currentlyInside: occupied
          }))
        }
      )
      .subscribe()

    // Optionally also listen to parking_sessions for full reload
    const sessionsChannel = supabase
      .channel('dashboard-sessions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parking_sessions' }, () => {
        fetchDashboardData() // Re-fetch to update "Total Vehicles Today" and "Currently Inside" if needed
      })
      .subscribe()

    return () => {
      supabase.removeChannel(slotsChannel)
      supabase.removeChannel(sessionsChannel)
    }
  }, [])

  async function fetchDashboardData() {
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      // FIX: parking_slots uses an 'occupied' integer count, not individual
      //      rows with a status column. Query zone A for total & occupied.
      // FIX: parking_sessions uses status='inside' (not 'active').
      const [
        { count: totalToday },
        { count: currentlyInside },
        { data: slotData },
        { data: payments },
        { data: bookings },
      ] = await Promise.all([

        // Bookings created today
        supabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', todayStart.toISOString()),

        // Active parking sessions — status is 'inside', not 'active'
        supabase
          .from('parking_sessions')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'inside'),

        // Slot counts from zone A (single row, not per-slot rows)
        supabase
          .from('parking_slots')
          .select('total, occupied')
          .eq('zone', 'A')
          .eq('is_active', true)
          .single(),

        // Today's successful payments
        supabase
          .from('payments')
          .select('amount')
          .eq('status', 'success')
          .gte('paid_at', todayStart.toISOString()),

        // Recent bookings
        supabase
          .from('bookings')
          .select('id, scheduled_entry, status, plan, vehicle_id, user_id')
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      const totalRevenue = payments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0
      const occupied     = slotData?.occupied || 0
      const total        = slotData?.total    || 0
      const available    = Math.max(0, total - occupied)
      const occupancy    = total ? Math.round((occupied / total) * 100) : 0

      setStats({
        totalToday:       totalToday      || 0,
        currentlyInside:  currentlyInside || 0,
        availableSlots:   available,
        totalSlots:       total,
        revenue:          `₹${totalRevenue.toLocaleString('en-IN')}`,
        occupancyPercent: occupancy,
      })

      // Enrich bookings with vehicle + user data
      if (bookings?.length) {
        const enriched = await Promise.all(bookings.map(async (b) => {
          const [{ data: vehicle }, { data: user }] = await Promise.all([
            supabase.from('vehicles').select('plate_number').eq('id', b.vehicle_id).single(),
            supabase.from('users').select('name').eq('id', b.user_id).single(),
          ])
          return { ...b, vehicle, user }
        }))
        setRecentBookings(enriched)
      } else {
        setRecentBookings([])
      }

    } catch (err) {
      console.error('Dashboard fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  function formatTime(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    })
  }

  function statusLabel(status) {
    const map = {
      confirmed: '● Confirmed',
      active:    '● Active',
      completed: 'Completed',
      cancelled: 'Cancelled',
      pending:   'Pending',
    }
    return map[status] || status
  }

  function badgeType(status) {
    if (status === 'confirmed' || status === 'active') return 'inside'
    return 'exited'
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-[22px] font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
            Dashboard
          </h2>
          <p className="text-[13px] text-[#8DA4BF] mt-1">Live overview — updated every 30 seconds</p>
        </div>
        <span className="self-start sm:self-auto px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-semibold whitespace-nowrap">
          Today: {today}
        </span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-5">
        <StatCard label="Total Vehicles Today" value={loading ? '...' : stats.totalToday}       color="text-cyan-400"    trend="↑ Today's entries"  trendUp />
        <StatCard label="Currently Inside"      value={loading ? '...' : stats.currentlyInside} color="text-blue-400"    trend="Active sessions" />
        <StatCard label="Available Slots"       value={loading ? '...' : stats.availableSlots}  color="text-emerald-400" trend={`of ${stats.totalSlots} total`} />
        <StatCard label="Total Revenue"         value={loading ? '...' : stats.revenue}         color="text-orange-400"  trend="↑ Today's earnings" trendUp />
      </div>

      {/* Occupancy bar */}
      <div className="bg-[#132033] border border-[#1E3550] rounded-2xl p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] font-semibold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
            Live Parking Occupancy
          </h3>
          <span className="text-[22px] font-bold text-cyan-400" style={{ fontFamily: 'Syne, sans-serif' }}>
            {loading ? '...' : `${stats.occupancyPercent}%`}
          </span>
        </div>
        <div className="h-2.5 bg-[#0D1B2A] rounded-full overflow-hidden mb-2">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all duration-700"
            style={{ width: `${stats.occupancyPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-[#8DA4BF]">
          <span>0</span>
          <span>{stats.currentlyInside} / {stats.totalSlots} occupied</span>
          <span>{stats.totalSlots}</span>
        </div>
      </div>

      {/* Recent bookings */}
      <TableCard
        title="Recent Bookings"
        action={
          <button
            onClick={onViewAll}
            className="px-4 py-1.5 bg-gradient-to-r from-blue-600 to-blue-800 rounded-lg text-white text-[12px] font-semibold hover:-translate-y-px transition-all"
          >
            View All
          </button>
        }
      >
        <thead>
          <tr>
            <TH>Vehicle No.</TH>
            <TH>Owner</TH>
            <TH>Entry Date</TH>
            <TH>Plan</TH>
            <TH>Status</TH>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} className="px-4 py-6 text-center text-[13px] text-[#8DA4BF]">Loading...</td></tr>
          ) : recentBookings.length === 0 ? (
            <tr><td colSpan={5} className="px-4 py-6 text-center text-[13px] text-[#8DA4BF]">No bookings yet</td></tr>
          ) : (
            recentBookings.map((b) => (
              <tr key={b.id} className="border-b border-[#1E3550] last:border-0 hover:bg-blue-500/10 transition-colors">
                <TD><strong>{b.vehicle?.plate_number || '—'}</strong></TD>
                <TD>{b.user?.name || '—'}</TD>
                <TD>{b.scheduled_entry || '—'}</TD>
                <TD className="capitalize">{b.plan || '—'}</TD>
                <TD>
                  <Badge type={badgeType(b.status)}>
                    {statusLabel(b.status)}
                  </Badge>
                </TD>
              </tr>
            ))
          )}
        </tbody>
      </TableCard>
    </div>
  )
}