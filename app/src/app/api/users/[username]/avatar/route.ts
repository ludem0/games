import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, getUsers } from '@/lib/auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const token = req.cookies.get('session')?.value
  if (!token) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Невалидный токен' }, { status: 401 })

  const { username } = await params
  const users = getUsers()
  const user = users.find(u => u.username === username)
  const avatarUrl = user?.avatarExt ? `/avatars/${username}.${user.avatarExt}` : null

  return NextResponse.json({ avatarUrl })
}
