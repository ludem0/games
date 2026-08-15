import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { scanTurns } from '@/lib/gameScan'

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get('session')?.value
  const user = cookie ? await verifyToken(cookie) : null
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mine = scanTurns()
    .filter(t => t.player === user.username)
    .map(({ slug, name, url }) => ({ slug, name, url }))
  return NextResponse.json({ turns: mine })
}
