import { NextRequest, NextResponse } from 'next/server'
import { findUser, signToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()

  const user = findUser(username, password)
  if (!user) {
    return NextResponse.json({ error: 'Неверный логин или пароль' }, { status: 401 })
  }

  const token = await signToken({ username: user.username, role: user.role })

  const res = NextResponse.json({ ok: true })
  res.cookies.set('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  })
  return res
}
