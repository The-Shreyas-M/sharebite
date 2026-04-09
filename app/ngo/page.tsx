'use client'

import { useState, useCallback } from 'react'
import AvailableFood from '@/components/ngo/AvailableFood'
import MyClaims from '@/components/ngo/MyClaims'
import Navbar from '@/components/shared/Navbar'

export default function NgoDashboard() {
  const [refreshKey, setRefreshKey] = useState(0)
  const triggerRefresh = useCallback(() => setRefreshKey(k => k + 1), [])
  return (
    <div className="min-h-screen bg-[#09090b]">
      <Navbar role="NGO" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Hero Banner */}
        <div className="gradient-hero-ngo text-white p-8 md:p-12 rounded-3xl mb-10 relative overflow-hidden border border-green-900/50 shadow-2xl">
          <div className="absolute inset-0 dot-pattern opacity-30" />
          <div className="relative z-10">
            <h1 className="text-3xl md:text-5xl font-extrabold mb-4 tracking-tight">
              Rescue Food. Feed Lives. <span className="text-4xl">💚</span>
            </h1>
            <p className="text-green-100 text-lg max-w-2xl font-medium">
              Claim available surplus food from donors, deliver it to communities in need, and earn impact points for every successful rescue.
            </p>
          </div>
        </div>

        <AvailableFood onClaimed={triggerRefresh} />
        <div id="active-rescues">
          <MyClaims key={refreshKey} />
        </div>
      </main>
    </div>
  )
}
