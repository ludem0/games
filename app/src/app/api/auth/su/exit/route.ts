import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { SESSION_COOKIE, testToolsOn } from '@/lib/testTools'

const hidden = () => new NextResponse(null, { status: 404 })

export async function POST(req: NextRequest) {
  if (!testToolsOn()) return hidden()

  const originCookie = req.cookies.get('su_origin')?.value
  const origin = originCookie ? await verifyToken(originCookie) : null
  // the stashed token is signed, so trusting it needs no other proof
  if (!originCookie || origin?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const res = NextResponse.json({ ok: true, username: origin.username })
  res.cookies.set('session', originCookie, SESSION_COOKIE)
  res.cookies.delete('su_origin')
  return res
}
