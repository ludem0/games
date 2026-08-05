import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants } from '@/lib/seasons'
import { getChats, saveChat, canSee, newId, type Chat } from '@/lib/chats'

type Params = { params: Promise<{ slug: string }> }

async function getUser(req: NextRequest) {
  const cookie = req.cookies.get('session')?.value
  if (!cookie) return null
  return await verifyToken(cookie)
}

// Summaries only: the message history is fetched per chat.
export async function GET(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { slug } = await params
  const isAdmin = user.role === 'admin'

  const list = getChats(slug)
    .filter(c => canSee(c, user.username, isAdmin))
    .map(c => {
      const last = c.messages[c.messages.length - 1]
      return {
        id: c.id,
        title: c.title,
        members: c.members,
        createdBy: c.createdBy,
        messageCount: c.messages.length,
        lastMessage: last ? { author: last.author, text: last.text, at: last.at } : null,
        isMember: c.members.includes(user.username),
      }
    })
    .sort((a, b) => (b.lastMessage?.at ?? '').localeCompare(a.lastMessage?.at ?? ''))

  return NextResponse.json(list)
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { slug } = await params

  const { title, members } = await req.json() as { title?: string; members?: string[] }
  const participants = getParticipants(slug)
  const invited = (members ?? []).filter(m => participants.includes(m) && m !== user.username)

  const chat: Chat = {
    id: newId(),
    title: (title ?? '').trim() || `Чат ${new Date().toLocaleDateString('ru-RU')}`,
    members: [user.username, ...invited],
    createdBy: user.username,
    createdAt: new Date().toISOString(),
    messages: [],
  }
  saveChat(slug, chat)
  return NextResponse.json(chat, { status: 201 })
}
