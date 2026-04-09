'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getUserDeduped } from '@/lib/auth-client'
import { CheckCircle2, Clock, MapPin, Users, Info, Lock, Maximize2, X, Pencil, Save, XCircle, BadgeCheck, Star } from 'lucide-react'
import type { RealtimeChannel } from '@supabase/supabase-js'

type FoodStatus = 'available' | 'claimed' | 'picked_up' | 'delivered' | 'confirmed' | 'wasted'

type ProfileLite = {
  id: string
  full_name: string | null
}

type NgoProfileForBid = {
  id: string
  full_name: string | null
  impact_points: number | null
}

type FoodPost = {
  id: string
  donor_id: string
  name: string
  feeds: number
  expiry_time: string
  location: string
  image_url: string | null
  status: FoodStatus
  claimed_by: string | null
  claimed_at?: string | null
  proof_image_url: string | null
  is_edited?: boolean
  ngo_profile?: ProfileLite | null
}

type DonorRatingSummary = {
  avg_rating: number
  ratings_count: number
}

type RescueBid = {
  id: string
  post_id: string
  ngo_id: string
  eta_minutes: number
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
  ngo_profile?: NgoProfileForBid | null
}

export default function FoodList() {
  const [posts, setPosts] = useState<FoodPost[]>([])
  const [bidsByPostId, setBidsByPostId] = useState<Record<string, RescueBid[]>>({})
  const [donorRating, setDonorRating] = useState<DonorRatingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedImage, setExpandedImage] = useState<string | null>(null)
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ name: string; feeds: string; expiry: string; location: string }>({
    name: '',
    feeds: '',
    expiry: '',
    location: '',
  })
  const supabase = createClient()
  const donorIdRef = useRef<string | null>(null)
  const refreshInFlightRef = useRef<Promise<void> | null>(null)
  const refreshQueuedRef = useRef(false)
  const etaTimeoutTriggeredRef = useRef<Set<string>>(new Set())
  const [timingOutByPostId, setTimingOutByPostId] = useState<Record<string, boolean>>({})
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const getAcceptedBidForPost = (postId: string) => {
    return (bidsByPostId[postId] || []).find((b) => b.status === 'accepted') || null
  }

  const computeEtaRemainingMs = (post: FoodPost) => {
    if (post.status !== 'claimed') return null
    const accepted = getAcceptedBidForPost(post.id)
    const claimedAt = post.claimed_at ? new Date(post.claimed_at).getTime() : null
    if (!accepted || !claimedAt) return null
    const dueMs = claimedAt + accepted.eta_minutes * 60_000
    return dueMs - nowMs
  }

  useEffect(() => {
    const overdue = posts
      .filter((p) => p.status === 'claimed')
      .map((p) => ({ post: p, remainingMs: computeEtaRemainingMs(p) }))
      .filter((x) => x.remainingMs !== null && (x.remainingMs as number) <= 0)

    for (const { post } of overdue) {
      if (etaTimeoutTriggeredRef.current.has(post.id)) continue
      etaTimeoutTriggeredRef.current.add(post.id)

      setTimingOutByPostId((m) => ({ ...m, [post.id]: true }))

      void (async () => {
        try {
          const res = await supabase.rpc('handle_pickup_eta_timeout', { post_id: post.id })
          if (res.error) {
            const msg = res.error.message || 'Failed to time out pickup.'
            // Don't spam popups on refresh; log for debugging.
            console.warn('handle_pickup_eta_timeout failed:', msg)
          }
        } finally {
          await refresh()
          setTimingOutByPostId((m) => {
            const next = { ...m }
            delete next[post.id]
            return next
          })
        }
      })()
    }
    // Intentionally depends on nowMs (tick) + current data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowMs, posts, bidsByPostId])

  const fetchPostsFor = async (donorId: string) => {

    // Best-effort: let the DB move expired/overdue posts to wasted
    try {
      await supabase.rpc('expire_overdue_posts')
    } catch {
      // ignore (function may not exist until migration is applied)
    }

    const { data, error } = await supabase
      .from('food_posts')
      .select('*, ngo_profile:profiles!food_posts_claimed_by_fkey(id, full_name)')
      .eq('donor_id', donorId)
      .order('created_at', { ascending: false })

    if (error) console.error('FoodList fetch error:', error)
    if (!error && data) {
      const typedPosts = data as unknown as FoodPost[]
      setPosts(typedPosts)

      // Fetch bids for donor's posts (pending/accepted/rejected are useful for UI)
      const postIds = typedPosts.map((p) => p.id)
      if (postIds.length > 0) {
        const { data: bidRows, error: bidErr } = await supabase
          .from('rescue_bids')
          .select('*, ngo_profile:profiles!rescue_bids_ngo_id_fkey(id, full_name, impact_points)')
          .in('post_id', postIds)
          .order('created_at', { ascending: false })

        if (bidErr) {
          // likely migration not applied yet
          console.warn('Bids fetch warning:', bidErr.message)
          setBidsByPostId({})
        } else {
          const grouped: Record<string, RescueBid[]> = {}
          for (const b of (bidRows || []) as unknown as RescueBid[]) {
            if (!grouped[b.post_id]) grouped[b.post_id] = []
            grouped[b.post_id].push(b)
          }
          setBidsByPostId(grouped)
        }
      } else {
        setBidsByPostId({})
      }

      // Fetch donor's own rating summary (avg food quality rating)
      try {
        const { data: ratingRow, error: ratingErr } = await supabase
          .from('donor_rating_summary')
          .select('avg_rating, ratings_count')
          .eq('donor_id', donorId)
          .maybeSingle()
        if (!ratingErr && ratingRow) {
          setDonorRating({ avg_rating: Number(ratingRow.avg_rating || 0), ratings_count: Number(ratingRow.ratings_count || 0) })
        } else {
          setDonorRating({ avg_rating: 0, ratings_count: 0 })
        }
      } catch {
        setDonorRating({ avg_rating: 0, ratings_count: 0 })
      }
    }
    setLoading(false)
  }

  const refresh = async () => {
    const donorId = donorIdRef.current
    if (!donorId) {
      setLoading(false)
      return
    }

    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true
      return
    }

    refreshInFlightRef.current = (async () => {
      await fetchPostsFor(donorId)
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
    let channelPosts: RealtimeChannel | null = null
    let channelBids: RealtimeChannel | null = null
    const channelId = `${Date.now()}-${Math.random().toString(16).slice(2)}`

    const init = async () => {
      const user = await getUserDeduped(supabase)
      if (!user) return
      donorIdRef.current = user.id

      // Subscribe first so we don't miss bid events that happen while the initial fetch is in-flight.

      channelPosts = supabase
        .channel(`donor-posts-${channelId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'food_posts', filter: `donor_id=eq.${user.id}` },
          () => refresh()
        )
        .subscribe()

      // Can't easily filter bids to only donor's post ids in realtime, so we re-fetch on any bid change.
      channelBids = supabase
        .channel(`donor-bids-${channelId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rescue_bids' }, () => refresh())
        .subscribe()

      await refresh()
    }

    init()

    return () => {
      if (channelPosts) supabase.removeChannel(channelPosts)
      if (channelBids) supabase.removeChannel(channelBids)
    }
  }, [])

  const handleVerifyPickup = async (postId: string) => {
    const { error } = await supabase
      .from('food_posts')
      .update({ status: 'picked_up', picked_up_at: new Date().toISOString() })
      .eq('id', postId)

    if (!error) refresh()
  }

  const handleDecline = async (postId: string, claimedById: string | null) => {
    const { error } = await supabase
      .from('food_posts')
      .update({ status: 'wasted', wasted_at: new Date().toISOString() })
      .eq('id', postId)

    if (!error) {
      if (claimedById) {
        const { error: rpcErr } = await supabase.rpc('increment_impact_points', { user_id: claimedById, points: -1 })
        if (rpcErr) console.error('RPC Error on decline:', rpcErr.message)
      }
      refresh()
    }
  }

  const handleConfirm = async (postId: string, claimedById: string | null) => {
    const { error } = await supabase
      .from('food_posts')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', postId)

    if (!error) {
      if (claimedById) {
        const { error: rpcErr } = await supabase.rpc('increment_impact_points', { user_id: claimedById, points: 1 })
        if (rpcErr) console.error('RPC Error on confirm:', rpcErr.message)
      }
      refresh()
    }
  }

  const handleAcceptBid = async (bidId: string) => {
    const { error } = await supabase.rpc('accept_rescue_bid', { bid_id: bidId })
    if (error) {
      alert(error.message)
      return
    }
    refresh()
  }

  const startEdit = (post: FoodPost) => {
    setEditingPostId(post.id)
    setEditDraft({
      name: post.name || '',
      feeds: String(post.feeds ?? ''),
      expiry: post.expiry_time ? new Date(post.expiry_time).toISOString().slice(0, 16) : '',
      location: post.location || '',
    })
  }

  const cancelEdit = () => {
    setEditingPostId(null)
    setEditDraft({ name: '', feeds: '', expiry: '', location: '' })
  }

  const saveEdit = async (postId: string) => {
    if (!editDraft.name.trim() || !editDraft.location.trim() || !editDraft.expiry || !editDraft.feeds) {
      alert('Please fill all fields.')
      return
    }
    const feedsNum = parseInt(editDraft.feeds, 10)
    if (Number.isNaN(feedsNum) || feedsNum <= 0) {
      alert('Feeds must be a positive number.')
      return
    }
    const expiryIso = new Date(editDraft.expiry).toISOString()

    const { error } = await supabase
      .from('food_posts')
      .update({
        name: editDraft.name.trim(),
        feeds: feedsNum,
        expiry_time: expiryIso,
        location: editDraft.location.trim(),
        is_edited: true,
      })
      .eq('id', postId)

    if (error) {
      alert(error.message)
      return
    }
    cancelEdit()
    refresh()
  }

  const activePosts = useMemo(
    () => posts.filter((p) => !['confirmed', 'wasted'].includes(p.status)),
    [posts]
  )
  const historyPosts = useMemo(
    () => posts.filter((p) => ['confirmed', 'wasted'].includes(p.status)),
    [posts]
  )

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
        {[1, 2, 3].map(i => <div key={i} className="h-64 bg-zinc-800 rounded-2xl" />)}
      </div>
    )
  }

  const renderPostCard = (post: FoodPost) => (
    <div key={post.id} className="card overflow-hidden hover:border-zinc-500 transition-all duration-200">
      {/* Image or placeholder */}
      <div className="h-40 w-full relative bg-zinc-800 border-b border-zinc-800">
        {post.image_url
          ? <img src={post.image_url} alt={post.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-5xl select-none opacity-50">🍽️</div>
        }
        <div className={`absolute top-3 right-3 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-md shadow-sm ${
          post.status === 'confirmed' ? 'badge-confirmed' :
          post.status === 'delivered' ? 'badge-delivered' :
          post.status === 'picked_up' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30' :
          post.status === 'claimed'   ? 'badge-claimed flex items-center gap-1' :
          post.status === 'wasted'    ? 'bg-red-500/10 text-red-400 border border-red-500/30' :
          'bg-zinc-900/80 text-zinc-300 border border-zinc-700'
        }`}>
          {post.status === 'claimed' && <Lock size={10} />}
          {post.status.replace('_', ' ')}
        </div>
      </div>

      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-zinc-100 truncate">{post.name}</h3>
            {donorRating && (
              <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-2 py-1 rounded-full">
                <Star size={12} /> {donorRating.avg_rating.toFixed(1)} ({donorRating.ratings_count})
              </div>
            )}
            {post.is_edited && (
              <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-1 rounded-full">
                <BadgeCheck size={12} /> Edited
              </div>
            )}
          </div>

          {post.status === 'available' && editingPostId !== post.id && (
            <button
              onClick={() => startEdit(post)}
              className="shrink-0 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-2 rounded-xl text-xs font-bold border border-zinc-700 flex items-center gap-2"
              title="Edit post"
            >
              <Pencil size={14} /> Edit
            </button>
          )}
        </div>

        {editingPostId === post.id ? (
          <div className="space-y-2 bg-zinc-800/50 p-4 rounded-xl border border-zinc-700">
            <input
              value={editDraft.name}
              onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-900 text-white text-sm"
              placeholder="Food name"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={editDraft.feeds}
                onChange={(e) => setEditDraft((d) => ({ ...d, feeds: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-900 text-white text-sm"
                placeholder="Feeds"
              />
              <input
                type="datetime-local"
                value={editDraft.expiry}
                onChange={(e) => setEditDraft((d) => ({ ...d, expiry: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-900 text-white text-sm"
              />
            </div>
            <input
              value={editDraft.location}
              onChange={(e) => setEditDraft((d) => ({ ...d, location: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-900 text-white text-sm"
              placeholder="Pickup location"
            />
            <div className="flex gap-2">
              <button
                onClick={cancelEdit}
                className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 py-2 rounded-lg text-xs font-bold border border-zinc-700 flex items-center justify-center gap-2"
              >
                <XCircle size={14} /> Cancel
              </button>
              <button
                onClick={() => saveEdit(post.id)}
                className="flex-1 gradient-donor text-white py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2"
              >
                <Save size={14} /> Save
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center text-sm text-zinc-400 gap-3 mt-1">
              <div className="flex items-center gap-1"><Users size={13} className="text-blue-400" /> {post.feeds} feeds</div>
              <div className="flex items-center gap-1"><MapPin size={13} className="text-blue-400" /> {post.location}</div>
            </div>

            <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
              <Clock size={13} /> Expires {new Date(post.expiry_time).toLocaleString()}
            </div>

            {/* Bids (only while available) */}
            {post.status === 'available' && (bidsByPostId[post.id]?.length || 0) > 0 && (
              <div className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-700 space-y-3">
                <div className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Offers</div>
                <div className="space-y-2">
                  {(bidsByPostId[post.id] || [])
                    .filter((b) => b.status === 'pending')
                    .slice(0, 6)
                    .map((b) => (
                      <div key={b.id} className="flex items-center justify-between gap-2 bg-zinc-900/60 p-3 rounded-xl border border-zinc-800">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-zinc-100 truncate">{b.ngo_profile?.full_name || 'NGO'}</div>
                          <div className="text-[11px] text-zinc-400 mt-0.5">
                            ETA <span className="text-zinc-200 font-bold">{b.eta_minutes} min</span>
                            <span className="mx-2 text-zinc-600">•</span>
                            Impact <span className="text-green-400 font-bold">{b.ngo_profile?.impact_points ?? 0}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleAcceptBid(b.id)}
                          className="shrink-0 bg-green-500/10 hover:bg-green-500/20 text-green-400 px-3 py-2 rounded-lg text-xs font-bold border border-green-500/30"
                        >
                          Accept
                        </button>
                      </div>
                    ))}
                </div>
                {(bidsByPostId[post.id] || []).filter((b) => b.status === 'pending').length === 0 && (
                  <div className="text-xs text-zinc-500">No pending offers.</div>
                )}
              </div>
            )}

            {post.claimed_by && post.status === 'claimed' && (
              <div className="text-sm font-medium text-zinc-300 flex flex-col gap-3 bg-zinc-800/50 p-4 rounded-xl border border-zinc-700">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-400 shrink-0 glow-blue text-xs" />
                  Approved for <strong className="text-white">{post.ngo_profile?.full_name || 'an NGO'}</strong>
                </div>

                {/* Live pickup ETA countdown after donor approval */}
                {(() => {
                  const remainingMs = computeEtaRemainingMs(post)
                  if (remainingMs === null) return null
                  const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000))
                  const mm = String(Math.floor(remainingSeconds / 60)).padStart(2, '0')
                  const ss = String(remainingSeconds % 60).padStart(2, '0')

                  return (
                    <div className="w-full bg-blue-500/10 text-blue-400 px-4 py-2.5 rounded-xl border border-blue-500/20 text-[11px] font-bold flex items-center justify-center gap-2 text-center">
                      {timingOutByPostId[post.id] ? 'Pickup ETA expired — reopening...' : `Pickup ETA: ${mm}:${ss}`}
                    </div>
                  )
                })()}

                <button
                  onClick={() => handleVerifyPickup(post.id)}
                  disabled={Boolean(timingOutByPostId[post.id])}
                  className="w-full bg-orange-500/10 hover:bg-orange-500/20 disabled:opacity-50 disabled:hover:bg-orange-500/10 text-orange-400 py-2 rounded-lg text-xs font-bold border border-orange-500/30 transition-all shadow-sm"
                >
                  Verify Pickup
                </button>
              </div>
            )}

            {post.status === 'picked_up' && (
              <div className="text-sm font-bold text-blue-400 flex items-center justify-center gap-2 bg-blue-500/10 p-3 rounded-xl border border-blue-500/20 animate-pulse">
                Delivery in progress...
              </div>
            )}

            {post.status === 'delivered' && post.proof_image_url && (
              <div className="bg-blue-500/10 p-4 rounded-xl border border-blue-500/20 space-y-3">
                <div className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1">
                  <Info size={12} /> Delivery Proof
                </div>
                <div className="relative group cursor-pointer" onClick={() => setExpandedImage(post.proof_image_url)}>
                  <img src={post.proof_image_url} className="w-full h-32 object-cover rounded-lg border border-blue-500/20 group-hover:opacity-80 transition-opacity" alt="Delivery proof" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-black/50 p-2 rounded-full"><Maximize2 size={20} className="text-white" /></div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button
                    onClick={() => handleDecline(post.id, post.claimed_by)}
                    className="w-full bg-red-500/10 text-red-400 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 hover:bg-red-500/20 transition-all border border-red-500/30"
                  >
                    Mark Wasted (-1)
                  </button>
                  <button
                    onClick={() => handleConfirm(post.id, post.claimed_by)}
                    className="w-full gradient-donor text-white py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 hover:opacity-90 transition-all shadow-lg glow-blue"
                  >
                    <CheckCircle2 size={16} /> Confirm (+1)
                  </button>
                </div>
              </div>
            )}

            {post.status === 'confirmed' && (
              <div className="flex items-center gap-2 text-green-400 font-bold justify-center py-2 bg-green-500/10 rounded-xl border border-green-500/20 shadow-sm glow-green text-sm">
                <CheckCircle2 size={16} /> Delivery Confirmed ✦ +1 pt
              </div>
            )}

            {post.status === 'wasted' && (
              <div className="flex items-center gap-2 text-red-400 font-bold justify-center py-2 bg-red-500/10 rounded-xl border border-red-500/20 text-sm">
                Marked as wasted
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-10">
      {/* Active */}
      <div>
        <h3 className="text-lg font-extrabold text-zinc-100 mb-4">Active</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {activePosts.map(renderPostCard)}
          {posts.length === 0 && (
            <div className="col-span-full py-20 text-center text-zinc-500 border-2 border-dashed border-zinc-800 rounded-3xl">
              <div className="text-5xl mb-4 opacity-50">🍱</div>
              <p className="font-semibold text-lg text-zinc-300">No posts yet</p>
              <p className="text-sm mt-1">Click &quot;Post Surplus Food&quot; above to get started!</p>
            </div>
          )}
        </div>
      </div>

      {/* History */}
      {historyPosts.length > 0 && (
        <div>
          <h3 className="text-lg font-extrabold text-zinc-100 mb-4">History</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {historyPosts.map(renderPostCard)}
          </div>
        </div>
      )}

      {expandedImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm cursor-pointer" onClick={() => setExpandedImage(null)}>
          <button className="absolute top-6 right-6 text-white hover:text-red-400 transition-colors bg-zinc-900 p-2 rounded-full border border-zinc-800"><X size={24} /></button>
          <img src={expandedImage} className="max-w-full max-h-[90vh] rounded-xl object-contain border border-zinc-800 shadow-2xl" alt="Expanded proof" />
        </div>
      )}
    </div>
  )
}
