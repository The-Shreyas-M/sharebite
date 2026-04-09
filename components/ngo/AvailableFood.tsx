'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { MapPin, Users, Clock, ShoppingCart, Loader2 } from 'lucide-react'

export default function AvailableFood({ onClaimed }: { onClaimed?: () => void }) {
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState<string | null>(null)
  const supabase = createClient()

  const fetchAvailable = async () => {
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('food_posts')
      .select('*, donor_profile:profiles!food_posts_donor_id_fkey(full_name)')
      .eq('status', 'available')
      .gt('expiry_time', now)
      .order('expiry_time', { ascending: true })

    if (error) console.error('Fetch error:', error)
    if (!error && data) setPosts(data)
    setLoading(false)
  }

  useEffect(() => { fetchAvailable() }, [])

  const handleClaim = async (postId: string) => {
    setClaiming(postId)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('food_posts')
      .update({ 
        status: 'claimed',
        claimed_by: user.id
      })
      .eq('id', postId)

    if (!error) {
      setPosts(posts.filter(p => p.id !== postId))
      alert('🎉 Rescue successfully claimed! Please coordinate pickup for this food.')
      if (onClaimed) onClaimed()
      setTimeout(() => {
        document.getElementById('active-rescues')?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
    setClaiming(null)
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
              
              <p className="text-sm text-zinc-400 mb-4 font-medium">From: <span className="text-zinc-200">{post.donor_profile?.full_name || 'Donor'}</span></p>

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

              <button
                onClick={() => handleClaim(post.id)}
                disabled={claiming === post.id}
                className="w-full gradient-ngo text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-lg glow-green"
              >
                {claiming === post.id ? <Loader2 className="animate-spin" size={18} /> : (
                  <>
                    <ShoppingCart size={18} /> Claim Rescue
                  </>
                )}
              </button>
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
