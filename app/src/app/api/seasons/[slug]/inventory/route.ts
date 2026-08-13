import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants, getBalance, addBalances, type Currency } from '@/lib/seasons'

type Params = { params: Promise<{ slug: string }> }

const FIELDS: Currency[] = ['psigems', 'opals', 'tol', 'clearOpals']

async function getUser(req: NextRequest) {
  const cookie = req.cookies.get('session')?.value
  if (!cookie) return null
  return await verifyToken(cookie)
}

export interface InventoryEntry {
  username: string
  psigems: number
  opals: number
  tol: number
  clearOpals: number
}

function entryFor(slug: string, username: string): InventoryEntry {
  const held = Object.fromEntries(FIELDS.map(f => [f, getBalance(slug, f)[username] ?? 0]))
  return { username, ...held } as InventoryEntry
}

// Players see their own inventory, the admin sees everyone's.
export async function GET(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { slug } = await params

  const owners = user.role === 'admin' ? getParticipants(slug) : [user.username]
  return NextResponse.json(owners.map(username => entryFor(slug, username)))
}

export async function PUT(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { slug } = await params

  const body = await req.json() as { username?: string } & Partial<Record<Currency, number>>
  const { username } = body
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 })
  if (!getParticipants(slug).includes(username)) {
    return NextResponse.json({ error: 'Not a season participant' }, { status: 400 })
  }

  for (const field of FIELDS) {
    const value = body[field]
    if (typeof value !== 'number') continue
    const current = getBalance(slug, field)[username] ?? 0
    addBalances(slug, field, { [username]: Math.max(0, Math.round(value)) - current })
  }

  return NextResponse.json(entryFor(slug, username))
}
