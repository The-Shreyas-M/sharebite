import type { SupabaseClient, User } from '@supabase/supabase-js'

let inFlightGetUser: Promise<User | null> | null = null

export async function getUserDeduped(supabase: SupabaseClient): Promise<User | null> {
  if (!inFlightGetUser) {
    inFlightGetUser = (async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) throw error
        return data.session?.user ?? null
      } catch (err: unknown) {
        const maybeErr = err as { name?: unknown; message?: unknown } | null
        const name = maybeErr && typeof maybeErr === 'object' && 'name' in maybeErr ? String(maybeErr.name) : ''
        const message = err instanceof Error ? err.message : String(err)

        // Common, non-actionable cases in dev/testing.
        if (name === 'AuthSessionMissingError' || message.includes('Auth session missing')) {
          return null
        }
        if (name === 'AuthRetryableFetchError' || message.includes('Failed to fetch')) {
          return null
        }
        if (message.includes('Lock "lock:') && (message.includes('stole it') || message.includes('Lock broken'))) {
          return null
        }
        throw err
      } finally {
        inFlightGetUser = null
      }
    })()
  }

  return inFlightGetUser
}
