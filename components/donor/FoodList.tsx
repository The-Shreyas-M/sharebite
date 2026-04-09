'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { CheckCircle2, Clock, MapPin, Users, Info, Lock, Maximize2, X } from 'lucide-react'

export default function FoodList() {
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedImage, setExpandedImage] = useState<string | null>(null)
  const supabase = createClient()

  const fetchPosts = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('food_posts')
      .select('*, ngo_profile:profiles!food_posts_claimed_by_fkey(id, full_name)')
      .eq('donor_id', user.id)
      .order('created_at', { ascending: false })

    if (error) console.error('FoodList fetch error:', error)
    if (!error && data) {
      // Lazy Auto-Decline check: if not delivered and within 30 mins of expiry
      const now = new Date()
      let needsRefresh = false
      for (const p of data) {
        if (p.status === 'claimed' || p.status === 'picked_up') {
          const expiryTime = new Date(p.expiry_time)
          const threshold = new Date(expiryTime.getTime() - 30 * 60000)
          if (now > threshold) {
            await supabase.from('food_posts').update({ status: 'available', claimed_by: null, proof_image_url: null }).eq('id', p.id)
            if (p.claimed_by) {
              const { error: rpcErr } = await supabase.rpc('increment_impact_points', { user_id: p.claimed_by, points: -1 })
              if (rpcErr) console.error('RPC Error on auto-decline:', rpcErr.message)
            }
            needsRefresh = true
          }
        }
      }
      if (needsRefresh) {
        fetchPosts()
        return
      }
      setPosts(data)
    }
    setLoading(false)
  }

  useEffect(() => { fetchPosts() }, [])

  const handleVerifyPickup = async (postId: string) => {
    const { error } = await supabase
      .from('food_posts')
      .update({ status: 'picked_up' })
      .eq('id', postId)

    if (!error) fetchPosts()
  }

  const handleDecline = async (postId: string, claimedById: string) => {
    const { error } = await supabase
      .from('food_posts')
      .update({ status: 'available', claimed_by: null, proof_image_url: null, expiry_time: new Date().toISOString() })
      .eq('id', postId)

    if (!error) {
      const { error: rpcErr } = await supabase.rpc('increment_impact_points', { user_id: claimedById, points: -1 })
      if (rpcErr) console.error('RPC Error on decline:', rpcErr.message)
      fetchPosts()
    }
  }

  const handleConfirm = async (postId: string, claimedById: string) => {
    const { error } = await supabase
      .from('food_posts')
      .update({ status: 'confirmed' })
      .eq('id', postId)

    if (!error) {
      const { error: rpcErr } = await supabase.rpc('increment_impact_points', { user_id: claimedById, points: 1 })
      if (rpcErr) console.error('RPC Error on confirm:', rpcErr.message)
      fetchPosts()
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
        {[1, 2, 3].map(i => <div key={i} className="h-64 bg-zinc-800 rounded-2xl" />)}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {posts.map((post) => (
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
              'bg-zinc-900/80 text-zinc-300 border border-zinc-700'
            }`}>
              {post.status === 'claimed' && <Lock size={10} />}
              {post.status.replace('_', ' ')}
            </div>
          </div>

          <div className="p-5 space-y-3">
            <div>
              <h3 className="text-lg font-bold text-zinc-100">{post.name}</h3>
              <div className="flex flex-wrap items-center text-sm text-zinc-400 gap-3 mt-1">
                <div className="flex items-center gap-1"><Users size={13} className="text-blue-400" /> {post.feeds} feeds</div>
                <div className="flex items-center gap-1"><MapPin size={13} className="text-blue-400" /> {post.location}</div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
              <Clock size={13} /> Expires {new Date(post.expiry_time).toLocaleString()}
            </div>

            {post.claimed_by && post.status === 'claimed' && (
              <div className="text-sm font-medium text-zinc-300 flex flex-col gap-3 bg-zinc-800/50 p-4 rounded-xl border border-zinc-700">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-400 shrink-0 glow-blue text-xs" />
                  Claimed by <strong className="text-white">{post.ngo_profile?.full_name || 'an NGO'}</strong>
                </div>
                <button
                  onClick={() => handleVerifyPickup(post.id)}
                  className="w-full bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 py-2 rounded-lg text-xs font-bold border border-orange-500/30 transition-all shadow-sm"
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
                    Decline (-1)
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
          </div>
        </div>
      ))}

      {posts.length === 0 && (
        <div className="col-span-full py-20 text-center text-zinc-500 border-2 border-dashed border-zinc-800 rounded-3xl">
          <div className="text-5xl mb-4 opacity-50">🍱</div>
          <p className="font-semibold text-lg text-zinc-300">No posts yet</p>
          <p className="text-sm mt-1">Click &quot;Post Surplus Food&quot; above to get started!</p>
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
