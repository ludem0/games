import { NextRequest, NextResponse } from 'next/server'
import { getUsers, signToken, verifyToken } from '@/lib/auth'
import { SESSION_COOKIE, testToolsOn } from '@/lib/testTools'

// Middleware waves /api/auth through, so every check has to happen right here.

const hidden = () => new NextResponse(null, { status: 404 })

export async function POST(req: NextRequest) {
  if (!testToolsOn()) return hidden()

  const session = req.cookies.get('session')?.value
  const originCookie = req.cookies.get('su_origin')?.value
  const me = session ? await verifyToken(session) : null
  const origin = originCookie ? await verifyToken(originCookie) : null

  // once swapped the session is no longer an admin, so the stashed token is what
  // keeps the chain going and lets one hop straight to the next player
  let adminToken: string | null = null
  if (originCookie && origin?.role === 'admin') adminToken = originCookie
  else if (session && me?.role === 'admin') adminToken = session
  if (!adminToken) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { username } = await req.json() as { username?: string }
  const target = getUsers().find(u => u.username === username)
  if (!target) return NextResponse.json({ error: 'Нет такого пользователя' }, { status: 404 })

  const res = NextResponse.json({ ok: true, username: target.username })
  res.cookies.set('session', await signToken({ username: target.username, role: target.role }), SESSION_COOKIE)
  res.cookies.set('su_origin', adminToken, SESSION_COOKIE)
  return res
}
