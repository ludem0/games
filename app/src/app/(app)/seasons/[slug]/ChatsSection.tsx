'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import styles from './season.module.css'

interface ChatSummary {
  id: string
  title: string
  members: string[]
  createdBy: string
  messageCount: number
  lastMessage: { author: string; text: string; at: string } | null
  isMember: boolean
}

interface ChatMessage { id: string; author: string; text: string; at: string }
interface Chat { id: string; title: string; members: string[]; createdBy: string; messages: ChatMessage[] }

interface Props {
  slug: string
  accent: string
  isAdmin: boolean
  username: string
  participants: string[]
}

// The socket carries the updates; polling only covers the moments it is down.
const FALLBACK_POLL_MS = 15000
const RECONNECT_MS = 3000

export default function ChatsSection({ slug, accent, isAdmin, username, participants }: Props) {
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [chat, setChat] = useState<Chat | null>(null)
  const [text, setText] = useState('')
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newMembers, setNewMembers] = useState<string[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [error, setError] = useState('')
  const [live, setLive] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const openIdRef = useRef<string | null>(null)

  // a failing route may answer with an HTML error page, so never assume JSON
  async function errorFrom(res: Response) {
    try {
      const data = await res.json()
      return data.error ?? `Ошибка ${res.status}`
    } catch {
      return `Ошибка ${res.status}`
    }
  }

  const loadList = useCallback(async () => {
    const res = await fetch(`/api/seasons/${slug}/chats`)
    if (res.ok) setChats(await res.json())
  }, [slug])

  const loadChat = useCallback(async (id: string) => {
    const res = await fetch(`/api/seasons/${slug}/chats/${id}`)
    if (res.ok) setChat(await res.json())
  }, [slug])

  useEffect(() => {
    loadList()
    const t = setInterval(loadList, FALLBACK_POLL_MS)
    return () => clearInterval(t)
  }, [loadList])

  useEffect(() => {
    if (!openId) { setChat(null); return }
    loadChat(openId)
    const t = setInterval(() => loadChat(openId), FALLBACK_POLL_MS)
    return () => clearInterval(t)
  }, [openId, loadChat])

  // live updates: the server pushes the chat as soon as anyone writes into it
  useEffect(() => {
    let socket: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let closed = false

    function connect() {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      socket = new WebSocket(`${proto}://${window.location.host}/api/chat-socket`)
      socketRef.current = socket

      socket.onopen = () => {
        setLive(true)
        if (openIdRef.current) {
          socket?.send(JSON.stringify({ type: 'subscribe', seasonSlug: slug, chatId: openIdRef.current }))
        }
      }
      socket.onmessage = event => {
        const msg = JSON.parse(event.data)
        if (msg.type === 'chat' && msg.chat.id === openIdRef.current) setChat(msg.chat)
        if (msg.type === 'chats-changed') loadList()
      }
      socket.onclose = () => {
        setLive(false)
        socketRef.current = null
        if (!closed) retry = setTimeout(connect, RECONNECT_MS)
      }
      socket.onerror = () => socket?.close()
    }

    connect()
    return () => {
      closed = true
      if (retry) clearTimeout(retry)
      socket?.close()
    }
  }, [slug, loadList])

  // tell the server which chat is on screen
  useEffect(() => {
    openIdRef.current = openId
    const socket = socketRef.current
    if (socket?.readyState !== WebSocket.OPEN) return
    if (openId) socket.send(JSON.stringify({ type: 'subscribe', seasonSlug: slug, chatId: openId }))
    return () => {
      if (openId && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'unsubscribe', seasonSlug: slug, chatId: openId }))
      }
    }
  }, [openId, slug])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [chat?.messages.length])

  async function createChat() {
    setError('')
    const res = await fetch(`/api/seasons/${slug}/chats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, members: newMembers }),
    })
    if (!res.ok) { setError(await errorFrom(res)); return }
    const created: Chat = await res.json()
    setCreating(false)
    setNewTitle('')
    setNewMembers([])
    await loadList()
    setOpenId(created.id)
  }

  async function send() {
    const value = text.trim()
    if (!value || !openId) return
    setText('')
    const res = await fetch(`/api/seasons/${slug}/chats/${openId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: value }),
    })
    if (res.ok) { setChat(await res.json()); loadList() }
    else setError(await errorFrom(res))
  }

  async function addMember(name: string) {
    if (!openId) return
    setAddOpen(false)
    const res = await fetch(`/api/seasons/${slug}/chats/${openId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addMember: name }),
    })
    if (res.ok) { setChat(await res.json()); loadList() }
    else setError(await errorFrom(res))
  }

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const canAdd = chat ? participants.filter(p => !chat.members.includes(p)) : []

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>ЧАТЫ</span>
        <span className={live ? styles.chatLive : styles.chatOffline}>{live ? 'на связи' : 'переподключение'}</span>
        <button className={styles.btnOutline} onClick={() => setCreating(v => !v)}>
          {creating ? 'Отмена' : '+ Новый чат'}
        </button>
      </div>

      {creating && (
        <div className={styles.chatCreate}>
          <input className={styles.chatInput} placeholder="Название чата"
            value={newTitle} onChange={e => setNewTitle(e.target.value)} />
          <div className={styles.chatPickList}>
            {participants.filter(p => p !== username).map(p => (
              <label key={p} className={styles.chatPick}>
                <input type="checkbox" checked={newMembers.includes(p)}
                  onChange={e => setNewMembers(m => e.target.checked ? [...m, p] : m.filter(x => x !== p))} />
                {p}
              </label>
            ))}
          </div>
          <button className={styles.btnSolid} style={{ background: accent }} onClick={createChat}>Создать</button>
        </div>
      )}

      {/* a failed create has no chat panel to show the error in */}
      {error && !chat && <p className={styles.chatError}>{error}</p>}

      {chats.length === 0 && !creating && <p className={styles.noContent}>Чатов пока нет</p>}

      <div className={styles.chatList}>
        {chats.map(c => (
          <button key={c.id} className={`${styles.chatRow} ${openId === c.id ? styles.chatRowActive : ''}`}
            onClick={() => setOpenId(openId === c.id ? null : c.id)}>
            <span className={styles.chatTitle}>
              {c.title}
              {!c.isMember && <span className={styles.chatAdminTag}>чужой чат</span>}
            </span>
            <span className={styles.chatMeta}>
              {c.members.length} уч. · {c.messageCount} сообщ.
              {c.lastMessage && ` · ${c.lastMessage.author || 'система'}: ${c.lastMessage.text.slice(0, 40)}`}
            </span>
          </button>
        ))}
      </div>

      {chat && (
        <div className={styles.chatPanel}>
          <div className={styles.chatPanelHead}>
            <span className={styles.chatPanelTitle}>{chat.title}</span>
            <span className={styles.chatMembers}>{chat.members.join(', ')}</span>
            {canAdd.length > 0 && (
              <div className={styles.addWrap}>
                <button className={styles.btnOutline} onClick={() => setAddOpen(v => !v)}>+ Участник</button>
                {addOpen && (
                  <ul className={styles.dropdown}>
                    {canAdd.map(p => (
                      <li key={p} className={styles.dropdownItem} onClick={() => addMember(p)}>{p}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className={styles.chatMessages}>
            {chat.messages.length === 0 && <p className={styles.noContent}>Сообщений нет</p>}
            {chat.messages.map(m => (
              m.author === '' ? (
                <div key={m.id} className={styles.chatSystem}>{m.text}</div>
              ) : (
                <div key={m.id} className={`${styles.chatMsg} ${m.author === username ? styles.chatMsgMine : ''}`}>
                  <span className={styles.chatMsgHead}>
                    <span className={styles.chatAuthor}>{m.author}</span>
                    <span className={styles.chatTime}>{time(m.at)}</span>
                  </span>
                  <span className={styles.chatText}>{m.text}</span>
                </div>
              )
            ))}
            <div ref={bottomRef} />
          </div>

          <div className={styles.chatSend}>
            <input className={styles.chatInput} placeholder="Сообщение" value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send() }} />
            <button className={styles.btnSolid} style={{ background: accent }} onClick={send}>→</button>
          </div>
          {isAdmin && !chat.members.includes(username) && (
            <p className={styles.chatAdminNote}>Вы читаете чужой чат как администратор.</p>
          )}
          {error && <p className={styles.chatError}>{error}</p>}
        </div>
      )}
    </div>
  )
}
