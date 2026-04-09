'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getUserDeduped } from '@/lib/auth-client'
import { Camera, Clock, Loader2, MapPin, PackageCheck, Trophy, Users, Star } from 'lucide-react'
import type { RealtimeChannel } from '@supabase/supabase-js'

type FoodStatus = 'available' | 'claimed' | 'picked_up' | 'delivered' | 'confirmed' | 'wasted'

type FoodPostRow = {
  id: string
  donor_id: string
  name: string
  feeds: number
  location: string
  image_url: string | null
  expiry_time: string
  created_at: string
  status: FoodStatus
  proof_image_url: string | null
  donor_profile?: { full_name: string | null } | null
}

type DonorRatingRow = {
  post_id: string
  rating: number
}

export default function MyClaims() {
  const [posts, setPosts] = useState<FoodPostRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [ratedByPostId, setRatedByPostId] = useState<Record<string, number>>({})
  const [ratingSubmitting, setRatingSubmitting] = useState<string | null>(null)
  const supabase = createClient()
  const ngoIdRef = useRef<string | null>(null)
  const refreshInFlightRef = useRef<Promise<void> | null>(null)
  const refreshQueuedRef = useRef(false)

  const fetchClaimsFor = async (ngoId: string) => {

    try {
      await supabase.rpc('expire_overdue_posts')
    } catch {
      // ignore if migration not applied yet
    }

    const { data, error } = await supabase
      .from('food_posts')
      .select('*, donor_profile:profiles!food_posts_donor_id_fkey(full_name)')
      .eq('claimed_by', ngoId)
      .in('status', ['claimed', 'picked_up', 'delivered', 'confirmed', 'wasted'])
      .order('created_at', { ascending: false })

    if (error) console.error('Claims fetch error:', error)
    if (!error && data) {
      const typedPosts = data as unknown as FoodPostRow[]
      setPosts(typedPosts)

      // Load my ratings for these posts (so we don't show rating UI twice)
      const postIds = typedPosts.map((p) => p.id)
      if (postIds.length > 0) {
        const { data: ratings } = await supabase
          .from('donor_ratings')
          .select('post_id, rating')
          .eq('ngo_id', ngoId)
          .in('post_id', postIds)
        const map: Record<string, number> = {}
        for (const r of (ratings || []) as unknown as DonorRatingRow[]) map[r.post_id] = r.rating
        setRatedByPostId(map)
      } else {
        setRatedByPostId({})
      }
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
      await fetchClaimsFor(ngoId)
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
    let channelRatings: RealtimeChannel | null = null
    const channelId = `${Date.now()}-${Math.random().toString(16).slice(2)}`

    const init = async () => {
      const user = await getUserDeduped(supabase)
      if (!user) return
      ngoIdRef.current = user.id

      // Subscribe first to avoid missing updates during the initial fetch.

      channelPosts = supabase
        .channel(`ngo-claims-${channelId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'food_posts', filter: `claimed_by=eq.${user.id}` },
          () => refresh()
        )
        .subscribe()

      channelRatings = supabase
        .channel(`ngo-ratings-${channelId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'donor_ratings', filter: `ngo_id=eq.${user.id}` },
          () => refresh()
        )
        .subscribe()

      await refresh()
    }

    init()

    return () => {
      if (channelPosts) supabase.removeChannel(channelPosts)
      if (channelRatings) supabase.removeChannel(channelRatings)
    }
  }, [])

  const handleComplete = async (postId: string, file: File) => {
    setUploading(postId)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `proof-${postId}-${Math.random()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('delivery-proofs')
        .upload(fileName, file)

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('delivery-proofs')
        .getPublicUrl(fileName)

      const { error: updateError } = await supabase
        .from('food_posts')
        .update({ status: 'delivered', proof_image_url: publicUrl, delivered_at: new Date().toISOString() })
        .eq('id', postId)

      if (updateError) throw updateError
      refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      alert(message)
    } finally {
      setUploading(null)
    }
  }

  if (loading) return null

  const activeClaims = posts.filter(p => p.status === 'claimed' || p.status === 'picked_up')
  const history = posts.filter(p => p.status === 'delivered' || p.status === 'confirmed' || p.status === 'wasted')

  const submitRating = async (post: FoodPostRow, rating: number) => {
    if (ratedByPostId[post.id]) return
    setRatingSubmitting(post.id)
    try {
      let ngoId = ngoIdRef.current
      if (!ngoId) {
        const user = await getUserDeduped(supabase)
        ngoId = user?.id ?? null
        ngoIdRef.current = ngoId
      }
      if (!ngoId) return
      const { error } = await supabase.from('donor_ratings').insert({
        post_id: post.id,
        donor_id: post.donor_id,
        ngo_id: ngoId,
        rating,
      })
      if (error) throw error
      setRatedByPostId((m) => ({ ...m, [post.id]: rating }))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Rating failed'
      alert(message)
    } finally {
      setRatingSubmitting(null)
    }
  }

  return (
    <>
      {/* ── Active Rescues ── */}
      {activeClaims.length > 0 && (
        <div className="mt-12 bg-green-500/5 p-8 rounded-3xl border border-green-500/20">
          <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2 mb-6">
            <PackageCheck className="text-green-400" />
            Active Rescues
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {activeClaims.map((post) => (
              <div key={post.id} className="card p-5 flex gap-4 border-green-500/10 hover:border-green-500/30 transition-colors">
                {post.image_url ? (
                  <img src={post.image_url} className="w-24 h-24 rounded-xl object-cover shrink-0 border border-zinc-700" alt={post.name} />
                ) : (
                  <div className="w-24 h-24 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-700 opacity-50 text-2xl">🍲</div>
                )}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-white text-base truncate">{post.name}</h3>
                    <p className="text-xs text-zinc-500 mt-0.5 mb-2">
                      From: <strong className="text-zinc-300">{post.donor_profile?.full_name || 'Donor'}</strong>
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-400 mb-3">
                      <span className="flex items-center gap-1"><Users size={12} className="text-green-400" /> {post.feeds} feeds</span>
                      <span className="flex items-center gap-1 truncate"><MapPin size={12} className="text-green-400" /> {post.location}</span>
                    </div>
                  </div>

                  {post.status === 'claimed' && (
                    <div className="w-full bg-zinc-800/50 text-orange-400 px-4 py-2.5 rounded-xl border border-orange-500/20 text-[11px] font-bold flex items-center justify-center gap-2 text-center animate-pulse">
                      Collecting in progress...<br/>Awaiting Donor to verify pickup.
                    </div>
                  )}

                  {post.status === 'picked_up' && (
                    <div className="relative inline-block w-full">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => { if (e.target.files?.[0]) handleComplete(post.id, e.target.files[0]) }}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                        disabled={uploading === post.id}
                      />
                      <button
                        type="button"
                        disabled={uploading === post.id}
                        className="w-full bg-zinc-800 text-green-400 px-4 py-2.5 rounded-xl border border-green-500/30 text-xs font-bold flex items-center justify-center gap-2 hover:bg-zinc-700 hover:text-green-300 transition-all pointer-events-none shadow-sm glow-green"
                      >
                        {uploading === post.id
                          ? <Loader2 size={15} className="animate-spin text-green-400" />
                          : <><Camera size={15} /> Upload Delivery Proof</>
                        }
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Rescue History ── */}
      {history.length > 0 && (
        <div className="mt-12">
          <h2 className="text-xl font-bold text-zinc-200 flex items-center gap-2 mb-5">
            <Trophy size={20} className="text-orange-400" /> Rescue History
          </h2>
          <div className="space-y-3">
            {history.map((post) => (
              <div key={post.id} className="card p-4 flex items-center gap-4 hover:bg-zinc-800/50 transition-colors">
                {post.image_url ? (
                  <img src={post.image_url} className="w-14 h-14 rounded-xl object-cover shrink-0 border border-zinc-800" alt={post.name} />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-zinc-800 shrink-0 border border-zinc-800 flex items-center justify-center text-xl opacity-50">🍲</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-zinc-100 truncate">{post.name}</h3>
                    <span className={`text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full shrink-0 ${
                      post.status === 'confirmed'
                        ? 'badge-confirmed'
                        : post.status === 'wasted'
                        ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                        : 'badge-delivered'
                    }`}>
                      {post.status === 'confirmed' ? '✓ Confirmed' : post.status === 'wasted' ? '✕ Wasted' : '⏳ Awaiting'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1 flex items-center gap-3">
                    <span className="flex items-center gap-1 text-zinc-400"><Users size={12} className="text-zinc-600" /> {post.feeds} feeds</span>
                    <span className="flex items-center gap-1"><Clock size={12} className="text-zinc-600" /> {new Date(post.created_at).toLocaleDateString()}</span>
                  </p>
                  {post.status === 'confirmed' && (
                    <p className="text-xs text-green-400 font-bold mt-1.5 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 glow-green" /> +1 impact point earned
                    </p>
                  )}

                  {post.status === 'confirmed' && (
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="text-xs text-zinc-400 font-semibold">
                        Rate donor food quality
                      </div>
                      {ratedByPostId[post.id] ? (
                        <div className="flex items-center gap-1 text-yellow-400">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <Star key={i} size={14} className={i <= ratedByPostId[post.id] ? 'fill-current' : ''} />
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <button
                              key={i}
                              disabled={ratingSubmitting === post.id}
                              onClick={() => submitRating(post, i)}
                              className="text-yellow-400 hover:text-yellow-300 disabled:opacity-50"
                              title={`${i} star${i === 1 ? '' : 's'}`}
                            >
                              <Star size={16} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
