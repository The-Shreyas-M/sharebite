'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getUserDeduped } from '@/lib/auth-client'
import { Loader2, Plus, Upload, X } from 'lucide-react'

export default function PostFoodForm({ onPostCreated }: { onPostCreated: () => void }) {
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [name, setName] = useState('')
  const [feeds, setFeeds] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [expiryTime, setExpiryTime] = useState('')
  const [location, setLocation] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const user = await getUserDeduped(supabase)
      if (!user) return

      let imageUrl = null
      if (image) {
        const fileExt = image.name.split('.').pop()
        const fileName = `${Math.random()}.${fileExt}`
        const { error: uploadError } = await supabase.storage.from('food-images').upload(fileName, image)
        if (uploadError) throw uploadError
        const { data: { publicUrl } } = supabase.storage.from('food-images').getPublicUrl(fileName)
        imageUrl = publicUrl
      }

      const expiryDateTime = new Date(`${expiryDate}T${expiryTime}`).toISOString()

      const { error } = await supabase.from('food_posts').insert({
        donor_id: user.id, name, feeds: parseInt(feeds),
        expiry_time: expiryDateTime,
        location, image_url: imageUrl, status: 'available'
      })
      if (error) throw error

      setIsOpen(false)
      setName(''); setFeeds(''); setExpiryDate(''); setExpiryTime(''); setLocation(''); setImage(null)
      onPostCreated()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      alert(message)
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "w-full px-4 py-3 rounded-xl border border-zinc-700 bg-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
  const labelClass = "block text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2"

  return (
    <div className="mb-8">
      {!isOpen ? (
        <button onClick={() => setIsOpen(true)}
          className="gradient-donor text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:opacity-90 transition-all shadow-lg glow-blue">
          <Plus size={18} /> Post Surplus Food
        </button>
      ) : (
        <div className="bg-zinc-900 border border-zinc-700 p-6 rounded-2xl shadow-2xl">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-white">📦 New Food Post</h3>
            <button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-zinc-200 transition-colors">
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Food Name</label>
              <input type="text" required className={inputClass} placeholder="Veg Biryani, Sandwiches…"
                value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Feeds (People)</label>
              <input type="number" required className={inputClass} placeholder="50"
                value={feeds} onChange={(e) => setFeeds(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Expiry Date</label>
              <div className="relative">
                <input type="date" required className={inputClass} style={{ colorScheme: 'dark' }}
                  value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Expiry Time</label>
              <div className="relative">
                <input type="time" required className={inputClass} style={{ colorScheme: 'dark' }}
                  value={expiryTime} onChange={(e) => setExpiryTime(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Pickup Location</label>
              <input type="text" required className={inputClass} placeholder="Grand Plaza, Floor 2"
                value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Food Photo (Optional)</label>
              <div className="relative group cursor-pointer">
                <input type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0] || null)}
                  className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                  image ? 'border-blue-500 bg-blue-500/5' : 'border-zinc-700 hover:border-zinc-500 bg-zinc-800/50'
                }`}>
                  <Upload size={20} className="mx-auto mb-2 text-zinc-500" />
                  <p className="text-sm text-zinc-400">{image ? `✓ ${image.name}` : 'Click or drag to upload'}</p>
                </div>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="md:col-span-2 gradient-donor text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all">
              {loading ? <Loader2 size={18} className="animate-spin" /> : '🚀 Post Surplus Food'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
