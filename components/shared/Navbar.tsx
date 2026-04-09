'use client'

import { createClient } from '@/lib/supabase'
import { getUserDeduped } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import { LogOut, Award, Utensils, Key, X, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

type ProfileRow = {
  id: string
  role: 'DONOR' | 'NGO'
  full_name: string | null
  impact_points: number | null
  is_blacklisted?: boolean
}

export default function Navbar({ role }: { role: 'DONOR' | 'NGO' }) {
  const supabase = createClient()
  const router = useRouter()
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [donorRating, setDonorRating] = useState<{ avg_rating: number; ratings_count: number } | null>(null)
  const [showPwdModal, setShowPwdModal] = useState(false)
  const [newPwd, setNewPwd] = useState('')

  useEffect(() => {
    let channel: RealtimeChannel | null = null
    let cancelled = false
    const channelId = `${Date.now()}-${Math.random().toString(16).slice(2)}`

    const init = async () => {
      const user = await getUserDeduped(supabase)
      if (!user) return

      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!cancelled) setProfile(data as unknown as ProfileRow)

      if (role === 'DONOR') {
        const { data: ratingRow } = await supabase
          .from('donor_rating_summary')
          .select('avg_rating, ratings_count')
          .eq('donor_id', user.id)
          .maybeSingle()

        if (!cancelled) {
          setDonorRating({
            avg_rating: Number((ratingRow as { avg_rating?: unknown } | null)?.avg_rating ?? 0),
            ratings_count: Number((ratingRow as { ratings_count?: unknown } | null)?.ratings_count ?? 0),
          })
        }
      }

      channel = supabase
        .channel(`nav-profile-${channelId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
          (payload: RealtimePostgresChangesPayload<ProfileRow>) => {
            const next = payload.new
            if (next && typeof next === 'object' && 'id' in next) {
              setProfile(next as ProfileRow)
            }
          }
        )
        .subscribe()
    }

    init()

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const handleChangePwd = async () => {
    if (newPwd.length < 6) return alert('Password must be at least 6 characters')
    const { error } = await supabase.auth.updateUser({ password: newPwd })
    if (error) alert(error.message)
    else {
      alert('Password successfully updated!')
      setShowPwdModal(false)
      setNewPwd('')
    }
  }

  const isDonor = role === 'DONOR'

  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-lg ${
              isDonor ? 'gradient-donor' : 'gradient-ngo'
            }`}>
              <Utensils size={17} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-white leading-none">
                Share<span className={isDonor ? 'text-blue-400' : 'text-green-400'}>Bite</span>
              </h1>
              <p className={`text-[9px] font-bold uppercase tracking-widest leading-none mt-0.5 ${
                isDonor ? 'text-orange-400' : 'text-green-500'
              }`}>
                {isDonor ? 'Donor Portal' : 'NGO Rescue Hub'}
              </p>
            </div>
          </div>

          {/* Right */}
          <div className="flex items-center gap-3">
            {/* Impact points for NGO */}
            {!isDonor && profile && (
              <div className="hidden sm:flex items-center gap-2 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-xl">
                <Award size={15} className="text-green-400" />
                <div>
                  <p className="text-[9px] uppercase tracking-wider font-bold text-green-600 leading-none">Impact</p>
                  <p className="text-base font-extrabold text-green-400 leading-none">{profile.impact_points || 0}</p>
                </div>
              </div>
            )}

            {/* Donor rating */}
            {isDonor && donorRating && (
              <div className="hidden sm:flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 px-3 py-1.5 rounded-xl">
                <Star size={15} className="text-yellow-400" />
                <div>
                  <p className="text-[9px] uppercase tracking-wider font-bold text-yellow-600 leading-none">Rating</p>
                  <p className="text-base font-extrabold text-yellow-400 leading-none">
                    {donorRating.avg_rating.toFixed(1)} <span className="text-[11px] text-zinc-400 font-bold">({donorRating.ratings_count})</span>
                  </p>
                </div>
              </div>
            )}

            {/* Name */}
            <div className="hidden md:block text-right">
              <p className="text-sm font-semibold text-zinc-100 leading-none">{profile?.full_name || 'User'}</p>
              <p className={`text-[10px] font-bold uppercase tracking-wider leading-none mt-0.5 ${
                isDonor ? 'text-blue-400' : 'text-green-400'
              }`}>{role}</p>
            </div>

            {/* Avatar */}
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm ${
              isDonor ? 'bg-blue-600' : 'bg-green-600'
            }`}>
              {(profile?.full_name || 'U')[0].toUpperCase()}
            </div>

            <button onClick={() => setShowPwdModal(true)}
              className="text-zinc-500 hover:text-blue-400 transition-colors p-2 rounded-lg hover:bg-blue-500/10" title="Change Password">
              <Key size={17} />
            </button>

            <button onClick={handleLogout}
              className="text-zinc-500 hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-red-500/10" title="Log Out">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </div>

      {showPwdModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-2xl w-full max-w-sm relative">
            <button onClick={() => setShowPwdModal(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white"><X size={18} /></button>
            <h3 className="text-lg font-bold text-white mb-4">Change Password</h3>
            <input 
              type="password" 
              placeholder="New Password (min 6 chars)" 
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-zinc-700 bg-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm mb-4"
            />
            <button 
              onClick={handleChangePwd}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors shadow-lg"
            >
              Update Password
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
