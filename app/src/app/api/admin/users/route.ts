import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getUsers, saveUsers } from '@/lib/auth'
import type { Role } from '@/lib/types'

async function requireAdmin(req: NextRequest) {
  const cookie = req.cookies.get('session')?.value
  if (!cookie) return null
  const payload = await verifyToken(cookie)
  if (!payload || payload.role !== 'admin') return null
  return payload
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const users = getUsers().map(({ username, role }) => ({ username, role }))
  return NextResponse.json(users)
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as { username?: string; password?: string; role?: Role }
  const { username, password, role } = body

  if (!username || !password || !role) {
    return NextResponse.json({ error: 'username, password, role required' }, { status: 400 })
  }

  const users = getUsers()
  if (users.find(u => u.username === username)) {
    return NextResponse.json({ error: 'User already exists' }, { status: 409 })
  }

  saveUsers([...users, { username, password, role }])
  return NextResponse.json({ username, role }, { status: 201 })
}
