import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getUsers, saveUsers } from '@/lib/auth'

async function requireAdmin(req: NextRequest) {
  const cookie = req.cookies.get('session')?.value
  if (!cookie) return null
  const payload = await verifyToken(cookie)
  if (!payload || payload.role !== 'admin') return null
  return payload
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { username } = await params
  if (username === admin.username) {
    return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 })
  }

  const users = getUsers()
  const filtered = users.filter(u => u.username !== username)
  if (filtered.length === users.length) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  saveUsers(filtered)
  return NextResponse.json({ ok: true })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { username } = await params
  const body = await req.json() as { password?: string }
  if (!body.password) {
    return NextResponse.json({ error: 'password required' }, { status: 400 })
  }

  const users = getUsers()
  const idx = users.findIndex(u => u.username === username)
  if (idx === -1) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const updated = users.map((u, i) => i === idx ? { ...u, password: body.password! } : u)
  saveUsers(updated)
  return NextResponse.json({ ok: true })
}
