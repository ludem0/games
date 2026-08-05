import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants, getPsigems, savePsigems, getOpals, saveOpals } from '@/lib/seasons'

type Params = { params: Promise<{ slug: string }> }

async function getUser(req: NextRequest) {
  const cookie = req.cookies.get('session')?.value
  if (!cookie) return null
  return await verifyToken(cookie)
}

export interface InventoryEntry {
  username: string
  psigems: number
  opals: number
}

// Players see their own inventory, the admin sees everyone's.
export async function GET(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { slug } = await params

  const psigems = getPsigems(slug)
  const opals = getOpals(slug)
  const owners = user.role === 'admin' ? getParticipants(slug) : [user.username]

  const inventory: InventoryEntry[] = owners.map(username => ({
    username,
    psigems: psigems[username] ?? 0,
    opals: opals[username] ?? 0,
  }))
  return NextResponse.json(inventory)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { slug } = await params

  const { username, psigems, opals } = await req.json() as
    { username?: string; psigems?: number; opals?: number }
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 })
  if (!getParticipants(slug).includes(username)) {
    return NextResponse.json({ error: 'Not a season participant' }, { status: 400 })
  }

  if (typeof psigems === 'number') {
    savePsigems(slug, { ...getPsigems(slug), [username]: Math.max(0, Math.round(psigems)) })
  }
  if (typeof opals === 'number') {
    saveOpals(slug, { ...getOpals(slug), [username]: Math.max(0, Math.round(opals)) })
  }

  return NextResponse.json({
    username,
    psigems: getPsigems(slug)[username] ?? 0,
    opals: getOpals(slug)[username] ?? 0,
  })
}
