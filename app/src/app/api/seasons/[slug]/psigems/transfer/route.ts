import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants, getPsigems, savePsigems, getRunningMatch } from '@/lib/seasons'

type Params = { params: Promise<{ slug: string }> }

async function getUser(req: NextRequest) {
  const cookie = req.cookies.get('session')?.value
  if (!cookie) return null
  return await verifyToken(cookie)
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { slug } = await params

  // nothing changes hands while a death match is on
  if (getRunningMatch(slug, 'death')) {
    return NextResponse.json({ error: 'Идёт Death Match, передача закрыта' }, { status: 409 })
  }

  const { to, amount } = await req.json() as { to?: string; amount?: number }
  const count = Math.floor(Number(amount))
  if (!to) return NextResponse.json({ error: 'Не выбран получатель' }, { status: 400 })
  if (!Number.isFinite(count) || count < 1) {
    return NextResponse.json({ error: 'Количество должно быть больше нуля' }, { status: 400 })
  }
  if (to === user.username) {
    return NextResponse.json({ error: 'Нельзя передать самому себе' }, { status: 400 })
  }

  const participants = getParticipants(slug)
  if (!participants.includes(user.username)) {
    return NextResponse.json({ error: 'Вы не участник сезона' }, { status: 403 })
  }
  if (!participants.includes(to)) {
    return NextResponse.json({ error: 'Получатель не участник сезона' }, { status: 400 })
  }

  const psigems = getPsigems(slug)
  const balance = psigems[user.username] ?? 0
  if (balance < count) {
    return NextResponse.json({ error: `У вас только ${balance} Ψ` }, { status: 400 })
  }

  savePsigems(slug, {
    ...psigems,
    [user.username]: balance - count,
    [to]: (psigems[to] ?? 0) + count,
  })

  return NextResponse.json({ from: user.username, to, amount: count, balance: balance - count })
}
