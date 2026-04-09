'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Camera, CheckCircle2, Clock, Loader2, MapPin, PackageCheck, Trophy, Users } from 'lucide-react'

export default function MyClaims() {
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const supabase = createClient()

  const fetchClaims = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('food_posts')
      .select('*, donor_profile:profiles!food_posts_donor_id_fkey(full_name)')
      .eq('claimed_by', user.id)
      .in('status', ['claimed', 'picked_up', 'delivered', 'confirmed'])
      .order('created_at', { ascending: false })

    if (error) console.error('Claims fetch error:', error)
    if (!error && data) {
      // Lazy Auto-Decline check
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
        fetchClaims()
        return
      }
      setPosts(data)
    }
    setLoading(false)
  }

  useEffect(() => { fetchClaims() }, [])

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
        .update({ status: 'delivered', proof_image_url: publicUrl })
        .eq('id', postId)

      if (updateError) throw updateError
      fetchClaims()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setUploading(null)
    }
  }

  if (loading) return null

  const activeClaims = posts.filter(p => p.status === 'claimed' || p.status === 'picked_up')
  const history = posts.filter(p => p.status === 'delivered' || p.status === 'confirmed')

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
                        : 'badge-delivered'
                    }`}>
                      {post.status === 'confirmed' ? '✓ Confirmed' : '⏳ Awaiting'}
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
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
