import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants } from '@/lib/seasons'
import { getChat, saveChat, canSee, newId, type Chat } from '@/lib/chats'

type Params = { params: Promise<{ slug: string; chatId: string }> }

// The custom server puts an emitter here; it pushes the change to the open sockets.
// Access rules stay in this file, the socket layer only forwards what it is given.
function publish(seasonSlug: string, chat: Chat) {
  const bus = (globalThis as { __chatBus?: { emit: (e: string, p: unknown) => void } }).__chatBus
  bus?.emit('chat', { seasonSlug, chatId: chat.id, members: chat.members, chat })
}

async function getUser(req: NextRequest) {
  const cookie = req.cookies.get('session')?.value
  if (!cookie) return null
  return await verifyToken(cookie)
}

// Full chat with history. Polled while the chat is open.
export async function GET(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { slug, chatId } = await params

  const chat = getChat(slug, chatId)
  if (!chat) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canSee(chat, user.username, user.role === 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.json(chat)
}

// Post a message, or add a member when `addMember` is given.
export async function POST(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { slug, chatId } = await params

  const chat = getChat(slug, chatId)
  if (!chat) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const isAdmin = user.role === 'admin'
  if (!canSee(chat, user.username, isAdmin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as { text?: string; addMember?: string }

  if (body.addMember) {
    if (!getParticipants(slug).includes(body.addMember)) {
      return NextResponse.json({ error: 'Not a season participant' }, { status: 400 })
    }
    if (!chat.members.includes(body.addMember)) {
      chat.members = [...chat.members, body.addMember]
      chat.messages = [...chat.messages, {
        id: newId(),
        author: '',
        text: `${user.username} добавил в чат ${body.addMember}`,
        at: new Date().toISOString(),
      }]
      try {
        saveChat(slug, chat)
      } catch {
        return NextResponse.json({ error: 'Не удалось сохранить чат' }, { status: 500 })
      }
      publish(slug, chat)
    }
    return NextResponse.json(chat)
  }

  const text = (body.text ?? '').trim()
  if (!text) return NextResponse.json({ error: 'Empty message' }, { status: 400 })
  if (text.length > 2000) return NextResponse.json({ error: 'Message too long' }, { status: 400 })

  chat.messages = [...chat.messages, {
    id: newId(),
    author: user.username,
    text,
    at: new Date().toISOString(),
  }]
  try {
    saveChat(slug, chat)
  } catch {
    return NextResponse.json({ error: 'Не удалось сохранить чат' }, { status: 500 })
  }
  publish(slug, chat)
  return NextResponse.json(chat)
}
