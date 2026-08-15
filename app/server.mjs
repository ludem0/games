// Custom server: Next.js plus a WebSocket channel for live chat updates.
//
// The socket layer never touches chat rules. Messages are still posted over HTTP,
// the route saves them and emits on globalThis.__chatBus; this file only forwards
// that event to the sockets of the members who are subscribed to that chat.
import { createServer } from 'node:http'
import { EventEmitter } from 'node:events'
import next from 'next'
import { WebSocketServer } from 'ws'
import { jwtVerify } from 'jose'

const dev = process.env.NODE_ENV !== 'production'
const port = Number(process.env.PORT ?? 3000)
const SOCKET_PATH = '/api/chat-socket'

const bus = new EventEmitter()
bus.setMaxListeners(0)
globalThis.__chatBus = bus

const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? 'fallback-secret')

function sessionFromCookie(header) {
  const raw = (header ?? '')
    .split(';')
    .map(p => p.trim())
    .find(p => p.startsWith('session='))
  return raw ? decodeURIComponent(raw.slice('session='.length)) : null
}

async function userFromRequest(req) {
  const token = sessionFromCookie(req.headers.cookie)
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret)
    return payload
  } catch {
    return null
  }
}

const app = next({ dev })
await app.prepare()
const handle = app.getRequestHandler()

const server = createServer((req, res) => handle(req, res))
const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', async (req, socket, head) => {
  if (!req.url?.startsWith(SOCKET_PATH)) return socket.destroy()

  const user = await userFromRequest(req)
  if (!user) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    return socket.destroy()
  }

  wss.handleUpgrade(req, socket, head, ws => {
    ws.user = user
    ws.rooms = new Set()
    wss.emit('connection', ws, req)
  })
})

// Who is connected right now. Every page holds a socket, so this is the online list.
function onlineUsers() {
  const names = new Set()
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN && ws.user?.username) names.add(ws.user.username)
  }
  return [...names].sort()
}
globalThis.__onlineUsers = onlineUsers

function broadcastPresence() {
  const frame = JSON.stringify({ type: 'presence', online: onlineUsers() })
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN) ws.send(frame)
  }
}

wss.on('connection', ws => {
  ws.isAlive = true
  ws.on('pong', () => { ws.isAlive = true })
  ws.on('close', () => broadcastPresence())
  broadcastPresence()

  ws.on('message', data => {
    let msg
    try { msg = JSON.parse(data.toString()) } catch { return }
    if (msg.type === 'subscribe' && msg.seasonSlug && msg.chatId) {
      ws.rooms.add(`${msg.seasonSlug}:${msg.chatId}`)
    } else if (msg.type === 'unsubscribe' && msg.seasonSlug && msg.chatId) {
      ws.rooms.delete(`${msg.seasonSlug}:${msg.chatId}`)
    }
  })
})

// drop sockets that stopped answering, otherwise they pile up behind the proxy
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue }
    ws.isAlive = false
    ws.ping()
  }
}, 30000)
heartbeat.unref()

// { seasonSlug, chatId, members, chat } — the route already checked who may see it
bus.on('chat', payload => {
  const room = `${payload.seasonSlug}:${payload.chatId}`
  const frame = JSON.stringify({ type: 'chat', chat: payload.chat })
  const listFrame = JSON.stringify({ type: 'chats-changed', seasonSlug: payload.seasonSlug })

  for (const ws of wss.clients) {
    if (ws.readyState !== ws.OPEN) continue
    const isAdmin = ws.user?.role === 'admin'
    const isMember = payload.members.includes(ws.user?.username)
    if (!isAdmin && !isMember) continue
    ws.send(listFrame)
    if (ws.rooms.has(room)) ws.send(frame)
  }
})

// { slug } — a game changed; every page showing it refetches through its own
// session, so broadcasting the bare slug leaks nothing.
bus.on('game', payload => {
  const frame = JSON.stringify({ type: 'game', slug: payload.slug })
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN) ws.send(frame)
  }
})

server.listen(port, () => {
  console.log(`> ready on http://localhost:${port} (ws ${SOCKET_PATH})`)
})
