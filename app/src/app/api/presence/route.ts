import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { ping, getOnline } from '@/lib/presence'

export async function GET(req: NextRequest) {
  const token = req.cookies.get('session')?.value
  if (!token) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Невалидный токен' }, { status: 401 })

  // the socket registry knows exactly who is connected; the file is the fallback
  const fromSockets = (globalThis as { __onlineUsers?: () => string[] }).__onlineUsers
  const online = fromSockets ? [...new Set([...fromSockets(), ...getOnline()])] : getOnline()
  return NextResponse.json({ online })
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('session')?.value
  if (!token) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Невалидный токен' }, { status: 401 })

  ping(payload.username)
  return NextResponse.json({ ok: true })
}
