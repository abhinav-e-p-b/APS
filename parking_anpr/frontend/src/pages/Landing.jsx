import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Brand from '../components/Brand'
import Toast from '../components/Toast'
import supabase from '../supabase'
 
const FEATURES = [
  { icon: '📷', title: 'Automatic Entry & Exit', desc: 'ANPR reads your plate — gate opens instantly' },
  { icon: '🔒', title: 'Secure & Verified',      desc: 'Only registered, paid vehicles get access' },
  { icon: '📊', title: 'Live Slot Tracking',     desc: 'Real-time slot availability, always accurate' },
]
 
const SLOTS = [
  { occupied: true,  emoji: '🚗' },
  { occupied: true,  emoji: '🚙' },
  { occupied: false, emoji: ''   },
  { occupied: false, emoji: ''   },
  { occupied: true,  emoji: '🚗' },
]

export default function Landing() {
  const navigate = useNavigate()
 
  const [loading, setLoading] = useState(false)
 
  const [toast, setToast] = useState({ message: '', type: 'success' })
  const showToast  = (message, type = 'success') => setToast({ message, type })
  const clearToast = () => setToast({ message: '', type: 'success' })
 
  // ── Google OAuth via Supabase ─────────────────────────────────
  async function handleGoogleLogin() {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`, // redirect after auth
        },
      })
      if (error) throw error
      // Supabase will redirect the browser — no need to navigate manually
    } catch (err) {
      console.error(err)
      showToast('Google sign-in failed. Try again.', 'error')
      setLoading(false)
    }
  }

  return (
    <>
      {/* ── Background ── */}
      <div
        className="fixed inset-0 bg-[#0D1B2A] z-0"
        style={{
          backgroundImage: `linear-gradient(rgba(30,111,255,0.04) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(30,111,255,0.04) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />
      <div className="fixed top-[-120px] right-[-80px] w-[500px] h-[500px] rounded-full pointer-events-none z-0"
        style={{ background: 'rgba(30,111,255,0.18)', filter: 'blur(120px)' }} />
      <div className="fixed bottom-0 left-[-100px] w-[400px] h-[400px] rounded-full pointer-events-none z-0"
        style={{ background: 'rgba(0,212,255,0.10)', filter: 'blur(120px)' }} />
 
      {/* ── Page center ── */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-8">
        <div className="w-full max-w-[960px] grid grid-cols-1 md:grid-cols-[1.1fr_1fr] bg-[#132033] rounded-2xl border border-[#1E3550] shadow-2xl overflow-hidden">
 
          {/* ════ LEFT PANEL ════ */}
          <div className="hidden md:flex p-14 border-r border-[#1E3550] flex-col justify-center">
            <div className="mb-11"><Brand /></div>
 
            <h1
              className="text-[36px] font-extrabold leading-tight tracking-tight text-white mb-3"
              style={{ fontFamily: 'Syne, sans-serif' }}
            >
              Skip the Queue,<br />Park <span className="text-cyan-400">instantly.</span>
            </h1>
            <p className="text-sm text-[#8DA4BF] leading-relaxed mb-9">
              Register once, pay digitally, and let our ANPR cameras handle entry &amp; exit — no tickets, no queues.
            </p>
 
            <div className="flex flex-col gap-4 mb-8">
              {FEATURES.map((f) => (
                <div key={f.title} className="flex items-start gap-3">
                  <div className="w-9 h-9 shrink-0 rounded-[9px] bg-[#0D1B2A] border border-[#1E3550] flex items-center justify-center text-sm">
                    {f.icon}
                  </div>
                  <div>
                    <strong className="block text-[13px] font-medium text-white mb-0.5">{f.title}</strong>
                    <span className="text-[11px] text-[#8DA4BF]">{f.desc}</span>
                  </div>
                </div>
              ))}
            </div>
 
            {/* Animated slots */}
            <div className="flex gap-2 items-end">
              {SLOTS.map((s, i) => (
                <div
                  key={i}
                  className={`w-10 h-13 rounded-md border flex items-center justify-center text-base
                    ${s.occupied ? 'bg-blue-500/15 border-blue-500' : 'bg-emerald-500/8 border-emerald-500/30'}`}
                  style={{ animation: `pulse-slot 3s ease-in-out ${i * 0.4}s infinite` }}
                >
                  {s.emoji}
                </div>
              ))}
              <span className="text-[11px] text-[#8DA4BF] ml-2 self-center">2 slots free</span>
            </div>
          </div>
 
          {/* ════ RIGHT PANEL ════ */}
          <div className="p-10 flex flex-col justify-center">
 
            {/* ══ LOGIN ══ */}
            <div>
              <h2
                className="text-xl font-bold text-white mb-1"
                style={{ fontFamily: 'Syne, sans-serif' }}
              >
                Welcome back
              </h2>
              <p className="text-[13px] text-[#8DA4BF] mb-8">
                Sign in with your Google account to continue
              </p>

              {/* Google Sign-In button */}
              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-[14px] bg-white hover:bg-gray-50 rounded-xl text-[15px] font-semibold text-gray-800 shadow-md hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Redirecting...
                  </>
                ) : (
                  <>
                    {/* Google G logo */}
                    <svg width="20" height="20" viewBox="0 0 48 48">
                      <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.2 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-9 20-20 0-1.3-.1-2.7-.4-4z"/>
                      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/>
                      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.7-3.3-11.3-8H6.1C9.4 37.7 16.2 44 24 44z"/>
                      <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.2-2.2 4-4.1 5.3l6.2 5.2C40.9 35.1 44 30 44 24c0-1.3-.1-2.7-.4-4z"/>
                    </svg>
                    Continue with Google
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-[#1E3550]" />
                <span className="text-[12px] text-[#8DA4BF]">What happens next?</span>
                <div className="flex-1 h-px bg-[#1E3550]" />
              </div>

              {/* Steps info */}
              <div className="space-y-3 mb-6">
                {[
                  { n: '1', text: 'Google verifies your identity instantly' },
                  { n: '2', text: 'We save your name & email automatically' },
                  { n: '3', text: 'Add your vehicle plate & start parking' },
                ].map((s) => (
                  <div key={s.n} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-[11px] font-bold text-blue-400 shrink-0">
                      {s.n}
                    </div>
                    <span className="text-[13px] text-[#8DA4BF]">{s.text}</span>
                  </div>
                ))}
              </div>

              <p className="text-center text-[12px] text-[#8DA4BF]">
                Users and Admins log in via Google OAuth.<br />
                <span className="text-cyan-400 font-medium mt-1 inline-block">
                  New here? We'll set up your account automatically.
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
 
      <Toast message={toast.message} type={toast.type} onClose={clearToast} />
 
      <style>{`
        @keyframes pulse-slot {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-4px); }
        }
      `}</style>
    </>
  )
}