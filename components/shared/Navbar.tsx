'use client'

import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { LogOut, Award, Utensils } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function Navbar({ role }: { role: 'DONOR' | 'NGO' }) {
  const supabase = createClient()
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)

  useEffect(() => {
    let interval: NodeJS.Timeout
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(data)
    }
    fetchProfile()
    interval = setInterval(fetchProfile, 3000)
    return () => clearInterval(interval)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
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

            <button onClick={handleLogout}
              className="text-zinc-500 hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-red-500/10">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
