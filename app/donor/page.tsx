'use client'

import { useState, useCallback } from 'react'
import PostFoodForm from '@/components/donor/PostFoodForm'
import FoodList from '@/components/donor/FoodList'
import Navbar from '@/components/shared/Navbar'

export default function DonorDashboard() {
  const [refreshKey, setRefreshKey] = useState(0)
  const triggerRefresh = useCallback(() => setRefreshKey(k => k + 1), [])

  return (
    <div className="min-h-screen bg-[#09090b]">
      <Navbar role="DONOR" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Hero Banner */}
        <div className="gradient-hero-donor text-white p-8 md:p-12 rounded-3xl mb-10 relative overflow-hidden border border-blue-900/50 shadow-2xl">
          <div className="absolute inset-0 dot-pattern opacity-30" />
          <div className="relative z-10">
            <h1 className="text-3xl md:text-5xl font-extrabold mb-4 tracking-tight">
              Your Surplus, Their Meal <span className="text-4xl">🍽️</span>
            </h1>
            <p className="text-blue-100 text-lg max-w-2xl font-medium">
              Post your surplus food and let verified NGOs rescue it. Together, we&apos;re fighting hunger — one meal at a time.
            </p>
          </div>
        </div>

        <PostFoodForm onPostCreated={triggerRefresh} />
        
        <div className="mt-8">
          <h2 className="text-2xl font-bold text-zinc-100 mb-6 flex items-center gap-3">
            <span className="w-1.5 h-8 bg-blue-500 rounded-full glow-blue" />
            Your Posts
          </h2>
          <FoodList key={refreshKey} />
        </div>
      </main>
    </div>
  )
}
