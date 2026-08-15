import { NextRequest, NextResponse } from 'next/server'
import { findUser, signToken } from '@/lib/auth'

const WINDOW_MS = 10 * 60 * 1000
const MAX_FAILS = 10
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60

// In-memory failure counter per address. Survives until the process restarts,
// which is exactly long enough to make password guessing boring.
const fails = new Map<string, { count: number; reset: number }>()

function clientOf(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

export async function POST(req: NextRequest) {
  const client = clientOf(req)
  const now = Date.now()
  const entry = fails.get(client)
  if (entry && entry.reset > now && entry.count >= MAX_FAILS) {
    return NextResponse.json({ error: 'Слишком много попыток, подождите 10 минут' }, { status: 429 })
  }

  const { username, password } = await req.json()

  const user = findUser(username, password)
  if (!user) {
    const fresh = !entry || entry.reset <= now
    fails.set(client, {
      count: fresh ? 1 : entry.count + 1,
      reset: fresh ? now + WINDOW_MS : entry.reset,
    })
    return NextResponse.json({ error: 'Неверный логин или пароль' }, { status: 401 })
  }

  fails.delete(client)
  const token = await signToken({ username: user.username, role: user.role })

  const res = NextResponse.json({ ok: true })
  res.cookies.set('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // outlive the browser session so the family stays logged in on their phones
    maxAge: COOKIE_MAX_AGE,
  })
  return res
}
