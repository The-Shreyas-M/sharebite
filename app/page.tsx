import Link from 'next/link'
import { ArrowRight, HeartHandshake, ShieldCheck, Utensils } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* ── Navigation ── */}
      <nav className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl gradient-donor flex items-center justify-center glow-blue shadow-lg">
              <Utensils size={16} className="text-white" />
            </div>
            <span className="font-extrabold text-xl tracking-tight">Share<span className="text-blue-400">Bite</span></span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-semibold text-zinc-400 hover:text-white transition-colors">Sign In</Link>
            <Link href="/register" className="text-sm font-bold bg-white text-black px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors">Get Started</Link>
          </div>
        </div>
      </nav>

      <main className="relative overflow-hidden">
        {/* Orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-green-600/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute inset-0 dot-pattern opacity-50 pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 py-24 md:py-32 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 bg-zinc-800/50 border border-zinc-700 px-4 py-2 rounded-full text-sm font-medium text-zinc-300 mb-8 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse glow-green" />
            Zero Hunger. One Meal at a time.
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-tight">
            Rescue surplus food.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-green-400 to-green-500">
              Feed communities.
            </span>
          </h1>

          <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-12">
            The platform connecting food donors with verified NGOs to eliminate food waste and fight hunger.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register" className="w-full sm:w-auto px-8 py-4 bg-white text-black font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-200 transition-colors shadow-xl">
              Join as Donor <ArrowRight size={18} />
            </Link>
            <Link href="/register" className="w-full sm:w-auto px-8 py-4 bg-zinc-800 text-white border border-zinc-700 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-700 transition-colors">
              <HeartHandshake size={18} className="text-green-400" /> Join as NGO
            </Link>
          </div>

          {/* Stats/Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-24 text-left">
            <div className="glass p-6 rounded-2xl border border-zinc-800 relative group overflow-hidden">
              <div className="absolute inset-0 bg-blue-500/5 group-hover:bg-blue-500/10 transition-colors" />
              <Utensils className="text-blue-400 mb-4" size={28} />
              <h3 className="text-lg font-bold text-white mb-2">Post Surplus</h3>
              <p className="text-sm text-zinc-500">Hotels and caterers easily list excess food before it expires.</p>
            </div>
            <div className="glass p-6 rounded-2xl border border-zinc-800 relative group overflow-hidden">
              <div className="absolute inset-0 bg-green-500/5 group-hover:bg-green-500/10 transition-colors" />
              <ShieldCheck className="text-green-400 mb-4" size={28} />
              <h3 className="text-lg font-bold text-white mb-2">Claim & Secure</h3>
              <p className="text-sm text-zinc-500">Verified NGOs claim available food and organize pickup.</p>
            </div>
            <div className="glass p-6 rounded-2xl border border-zinc-800 relative group overflow-hidden">
              <div className="absolute inset-0 bg-orange-500/5 group-hover:bg-orange-500/10 transition-colors" />
              <HeartHandshake className="text-orange-400 mb-4" size={28} />
              <h3 className="text-lg font-bold text-white mb-2">Deliver Impact</h3>
              <p className="text-sm text-zinc-500">Complete the delivery, upload proof, and earn impact points.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
