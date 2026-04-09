import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protected routes logic
  if (!user && (request.nextUrl.pathname.startsWith('/donor') || request.nextUrl.pathname.startsWith('/ngo'))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Role based redirection
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile) {
      if (profile.role === 'DONOR' && request.nextUrl.pathname.startsWith('/ngo')) {
        const url = request.nextUrl.clone()
        url.pathname = '/donor'
        return NextResponse.redirect(url)
      }
      if (profile.role === 'NGO' && request.nextUrl.pathname.startsWith('/donor')) {
        const url = request.nextUrl.clone()
        url.pathname = '/ngo'
        return NextResponse.redirect(url)
      }
      // If they are on the homepage or auth pages, send them to their dashboard
      if (request.nextUrl.pathname === '/' || request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/register')) {
        const url = request.nextUrl.clone()
        url.pathname = profile.role === 'DONOR' ? '/donor' : '/ngo'
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}
