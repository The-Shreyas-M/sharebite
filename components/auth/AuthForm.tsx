'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Loader2, ArrowRight, Utensils } from 'lucide-react'

export default function AuthForm({ type }: { type: 'login' | 'register' }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'DONOR' | 'NGO'>('DONOR')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()
  const router = useRouter()

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (type === 'register') {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, role } },
        })
        if (signUpError) throw signUpError
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
      }
      router.refresh()
      router.push('/')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "w-full px-4 py-3 rounded-xl border border-zinc-700 bg-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
  const labelClass = "block text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2"

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Logo */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl gradient-donor mb-4 shadow-lg glow-blue">
          <Utensils size={24} className="text-white" />
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          Share<span className="text-blue-400">Bite</span>
        </h1>
        <p className="text-zinc-400 text-sm mt-1">
          {type === 'login' ? 'Welcome back — sign in to continue' : 'Join the food rescue movement'}
        </p>
      </div>

      <form onSubmit={handleAuth} className="glass rounded-2xl p-8 space-y-5">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {type === 'register' && (
          <>
            <div>
              <label className={labelClass}>Full Name / Org Name</label>
              <input type="text" required className={inputClass} placeholder="Grand Hotel / Food Bank NGO"
                value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>

            <div>
              <label className={labelClass}>I am a...</label>
              <div className="grid grid-cols-2 gap-3">
                <button type="button"
                  onClick={() => setRole('DONOR')}
                  className={`py-4 rounded-xl border-2 transition-all text-center ${
                    role === 'DONOR'
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                  }`}>
                  <div className="text-2xl mb-1">🏨</div>
                  <div className="font-bold text-sm">Donor</div>
                  <div className="text-xs opacity-60 mt-0.5">Hotels / Halls</div>
                </button>
                <button type="button"
                  onClick={() => setRole('NGO')}
                  className={`py-4 rounded-xl border-2 transition-all text-center ${
                    role === 'NGO'
                      ? 'border-green-500 bg-green-500/10 text-green-400'
                      : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                  }`}>
                  <div className="text-2xl mb-1">💚</div>
                  <div className="font-bold text-sm">NGO</div>
                  <div className="text-xs opacity-60 mt-0.5">Rescue / Distribute</div>
                </button>
              </div>
            </div>
          </>
        )}

        <div>
          <label className={labelClass}>Email Address</label>
          <input type="email" required className={inputClass} placeholder="name@company.com"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div>
          <label className={labelClass}>Password</label>
          <input type="password" required className={inputClass} placeholder="••••••••"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        <button type="submit" disabled={loading}
          className={`w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all shadow-lg ${
            loading ? 'opacity-60 cursor-not-allowed' : ''
          } ${role === 'NGO' && type === 'register' ? 'gradient-ngo hover:opacity-90' : 'gradient-donor hover:opacity-90'}`}>
          {loading ? <Loader2 size={18} className="animate-spin" /> : (
            <>{type === 'login' ? 'Sign In' : 'Create Account'}<ArrowRight size={16} /></>
          )}
        </button>

        <p className="text-center text-sm text-zinc-500">
          {type === 'login' ? (
            <>No account?{' '}
              <button type="button" onClick={() => router.push('/register')}
                className="text-blue-400 font-semibold hover:text-blue-300 transition-colors">Sign Up</button></>
          ) : (
            <>Already registered?{' '}
              <button type="button" onClick={() => router.push('/login')}
                className="text-blue-400 font-semibold hover:text-blue-300 transition-colors">Sign In</button></>
          )}
        </p>
      </form>
    </div>
  )
}
