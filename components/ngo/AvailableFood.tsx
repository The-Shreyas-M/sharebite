'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getUserDeduped } from '@/lib/auth-client'
import { MapPin, Users, Clock, ShoppingCart, Loader2, Star } from 'lucide-react'
import type { RealtimeChannel } from '@supabase/supabase-js'

type FoodStatus = 'available' | 'claimed' | 'picked_up' | 'delivered' | 'confirmed' | 'wasted'

type FoodPostRow = {
  id: string
  donor_id: string
  name: string
  feeds: number
  expiry_time: string
  location: string
  image_url: string | null
  status: FoodStatus
  donor_profile?: { full_name: string | null } | null
}

type RescueBidRow = {
  id: string
  post_id: string
  ngo_id: string
  eta_minutes: number
  status: 'pending' | 'accepted' | 'rejected'
}

type DonorRatingSummaryRow = {
  donor_id: string
  avg_rating: number | string | null
  ratings_count: number | string | null
}

export default function AvailableFood({ onClaimed: _onClaimed }: { onClaimed?: () => void }) {
  const [posts, setPosts] = useState<FoodPostRow[]>([])
  const [myBidsByPostId, setMyBidsByPostId] = useState<Record<string, RescueBidRow>>({})
  const [donorRatingById, setDonorRatingById] = useState<Record<string, { avg_rating: number; ratings_count: number }>>({})
  const [loading, setLoading] = useState(true)
  const [biddingPost, setBiddingPost] = useState<string | null>(null)
  const [eta, setEta] = useState('')
  const supabase = createClient()
  const ngoIdRef = useRef<string | null>(null)
  const refreshInFlightRef = useRef<Promise<void> | null>(null)
  const refreshQueuedRef = useRef(false)

  const fetchAvailableFor = async (ngoId: string) => {

    try {
      await supabase.rpc('expire_overdue_posts')
    } catch {
      // ignore if migration not applied yet
    }

    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('food_posts')
      .select('*, donor_profile:profiles!food_posts_donor_id_fkey(full_name)')
      .eq('status', 'available')
      .gt('expiry_time', now)
      .order('expiry_time', { ascending: true })

    const { data: userBids } = await supabase
      .from('rescue_bids')
      .select('*')
      .eq('ngo_id', ngoId)

    if (error) console.error('Fetch error:', error)
    if (!error && data) {
      const typedPosts = data as unknown as FoodPostRow[]
      setPosts(typedPosts)

      // Fetch donor rating summaries for donors in the feed
      const donorIds = Array.from(new Set((typedPosts || []).map((p) => p.donor_id).filter(Boolean)))
      if (donorIds.length > 0) {
        const { data: ratingRows, error: ratingErr } = await supabase
          .from('donor_rating_summary')
          .select('donor_id, avg_rating, ratings_count')
          .in('donor_id', donorIds)
        if (!ratingErr && ratingRows) {
          const map: Record<string, { avg_rating: number; ratings_count: number }> = {}
          for (const r of ratingRows as unknown as DonorRatingSummaryRow[]) {
            map[r.donor_id] = { avg_rating: Number(r.avg_rating || 0), ratings_count: Number(r.ratings_count || 0) }
          }
          setDonorRatingById(map)
        }
      } else {
        setDonorRatingById({})
      }
    }

    if (userBids) {
      const map: Record<string, RescueBidRow> = {}
      for (const b of userBids as unknown as RescueBidRow[]) map[b.post_id] = b
      setMyBidsByPostId(map)
    } else {
      setMyBidsByPostId({})
    }
    setLoading(false)
  }

  const refresh = async () => {
    const ngoId = ngoIdRef.current
    if (!ngoId) {
      setLoading(false)
      return
    }

    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true
      return
    }

    refreshInFlightRef.current = (async () => {
      await fetchAvailableFor(ngoId)
    })()

    try {
      await refreshInFlightRef.current
    } finally {
      refreshInFlightRef.current = null
      if (refreshQueuedRef.current) {
        refreshQueuedRef.current = false
        void refresh()
      }
    }
  }

  useEffect(() => {
    const channelId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    let channelPosts: RealtimeChannel | null = null
    let channelBids: RealtimeChannel | null = null
    let authListener: ReturnType<typeof supabase.auth.onAuthStateChange> | null = null

    const init = async () => {
      const user = await getUserDeduped(supabase)
      if (!user) return
      ngoIdRef.current = user.id

      // Subscribe first to avoid missing events during initial fetch.
      channelPosts = supabase
        .channel(`available-foods-${channelId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'food_posts' }, () => refresh())
        .subscribe()

      channelBids = supabase
        .channel(`ngo-bids-${channelId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rescue_bids' }, () => refresh())
        .subscribe()

      authListener = supabase.auth.onAuthStateChange(() => {
        void refresh()
      })

      await refresh()
    }

    init()

    return () => {
      if (channelPosts) supabase.removeChannel(channelPosts)
      if (channelBids) supabase.removeChannel(channelBids)
      authListener?.data.subscription.unsubscribe()
    }
  }, [])

  const handleBidClick = (postId: string) => {
    setBiddingPost(postId)
    setEta('')
  }

  const submitBid = async (postId: string) => {
    if (!eta || isNaN(Number(eta))) return alert('Please enter a valid ETA in minutes.')
    
    let ngoId = ngoIdRef.current
    if (!ngoId) {
      const user = await getUserDeduped(supabase)
      ngoId = user?.id ?? null
      ngoIdRef.current = ngoId
    }
    if (!ngoId) return

    const payload = {
      post_id: postId,
      ngo_id: ngoId,
      eta_minutes: parseInt(eta),
      status: 'pending',
    }

    // If a pending bid already exists, update it; otherwise insert.
    const existing = myBidsByPostId[postId]
    const { error } = existing
      ? await supabase.from('rescue_bids').update({ eta_minutes: payload.eta_minutes }).eq('id', existing.id)
      : await supabase.from('rescue_bids').insert(payload)

    if (!error) {
      alert('🚀 Offer placed! Awaiting Donor approval.')
      refresh()
      setBiddingPost(null)
    } else {
      alert('Failed to place bid: ' + error.message)
    }
  }

  if (loading) return <div className="text-zinc-500 animate-pulse flex gap-2 items-center"><Loader2 className="animate-spin" size={16}/> Loading available rescues...</div>

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-3">
        <span className="w-1.5 h-8 bg-green-500 rounded-full glow-green" />
        Available Rescues
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {posts.map((post) => (
          <div key={post.id} className="card overflow-hidden hover:border-zinc-500 hover:scale-[1.02] transition-all duration-300">
            {post.image_url ? (
              <img src={post.image_url} alt={post.name} className="h-40 w-full object-cover border-b border-zinc-800" />
            ) : (
               <div className="w-full h-40 bg-zinc-800 border-b border-zinc-800 flex items-center justify-center text-4xl opacity-50">🍲</div>
            )}
            <div className="p-5">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-lg font-bold text-white max-w-[70%] leading-tight truncate">{post.name}</h3>
                <span className="bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider backdrop-blur-sm">
                  Available
                </span>
              </div>
              
              <div className="flex items-center justify-between gap-3 mb-4">
                <p className="text-sm text-zinc-400 font-medium truncate">
                  From: <span className="text-zinc-200">{post.donor_profile?.full_name || 'Donor'}</span>
                </p>
                <div className="shrink-0 flex items-center gap-1 text-[11px] text-zinc-400">
                  <Star size={13} className="text-yellow-400" />
                  <span className="text-zinc-200 font-bold">
                    {(donorRatingById[post.donor_id]?.avg_rating ?? 0).toFixed(1)}
                  </span>
                  <span className="text-zinc-600">({donorRatingById[post.donor_id]?.ratings_count ?? 0})</span>
                </div>
              </div>

              <div className="space-y-2 mb-6 bg-zinc-800/50 p-3 rounded-xl border border-zinc-800">
                <div className="flex items-center text-xs text-zinc-300 gap-2">
                  <Users size={14} className="text-green-400" /> <strong className="text-white">{post.feeds}</strong> feeds
                </div>
                <div className="flex items-center text-xs text-zinc-300 gap-2 truncate">
                  <MapPin size={14} className="text-green-400 shrink-0" /> <span className="truncate">{post.location}</span>
                </div>
                <div className="flex items-center text-xs text-orange-400 font-medium gap-2">
                  <Clock size={14} className="shrink-0" /> Expires {new Date(post.expiry_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </div>
              </div>

              {myBidsByPostId[post.id]?.status === 'pending' ? (
                <div className="w-full bg-blue-500/10 text-blue-400 py-3 rounded-xl font-bold flex items-center justify-center gap-2 border border-blue-500/20 text-sm">
                  ✓ Offer Placed (ETA {myBidsByPostId[post.id]?.eta_minutes}m). Awaiting Approval
                </div>
              ) : myBidsByPostId[post.id]?.status === 'rejected' ? (
                <div className="w-full bg-red-500/10 text-red-400 py-3 rounded-xl font-bold flex items-center justify-center gap-2 border border-red-500/20 text-sm">
                  ✕ Offer Rejected
                </div>
              ) : biddingPost === post.id ? (
                <div className="space-y-2">
                  <input 
                    type="number" 
                    placeholder="Pickup ETA (minutes)" 
                    value={eta}
                    onChange={(e) => setEta(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-zinc-700 bg-zinc-800 text-white placeholder-zinc-500 focus:ring-2 focus:ring-green-500 text-sm"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setBiddingPost(null)} className="flex-1 bg-zinc-800 text-white rounded-xl py-2 font-bold hover:bg-zinc-700 transition">Cancel</button>
                    <button onClick={() => submitBid(post.id)} className="flex-1 gradient-ngo text-white rounded-xl py-2 font-bold hover:opacity-90 shadow-lg glow-green">Submit Offer</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => handleBidClick(post.id)}
                  className="w-full gradient-ngo text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-lg glow-green"
                >
                  <ShoppingCart size={18} /> Offer Rescue
                </button>
              )}
            </div>
          </div>
        ))}
        {posts.length === 0 && (
          <div className="col-span-full py-16 bg-zinc-900 rounded-3xl text-center border-2 border-dashed border-zinc-800 text-zinc-500">
            <div className="text-4xl mb-3 opacity-40">🌱</div>
            <p className="text-lg font-semibold text-zinc-300">No available food right now.</p>
            <p className="text-sm">Check back soon for new rescue opportunities.</p>
          </div>
        )}
      </div>
    </div>
  )
}
