'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'

// One socket for the whole app: it carries chat pushes and the online list.
// Every authenticated page mounts this, which is what makes presence accurate.

type Frame = { type: string; [key: string]: unknown }
type Handler = (frame: Frame) => void

interface SocketApi {
  online: string[]
  connected: boolean
  send: (frame: unknown) => void
  addHandler: (fn: Handler) => () => void
}

const RECONNECT_MS = 3000
const SocketContext = createContext<SocketApi | null>(null)

export function useSocket(): SocketApi {
  return useContext(SocketContext) ?? {
    online: [],
    connected: false,
    send: () => {},
    addHandler: () => () => {},
  }
}

export default function SocketProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState<string[]>([])
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)
  const handlers = useRef(new Set<Handler>())

  const send = useCallback((frame: unknown) => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame))
  }, [])

  const addHandler = useCallback((fn: Handler) => {
    handlers.current.add(fn)
    return () => { handlers.current.delete(fn) }
  }, [])

  useEffect(() => {
    let retry: ReturnType<typeof setTimeout> | null = null
    let closed = false

    function connect() {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const socket = new WebSocket(`${proto}://${window.location.host}/api/chat-socket`)
      socketRef.current = socket

      socket.onopen = () => setConnected(true)
      socket.onmessage = event => {
        let frame: Frame
        try { frame = JSON.parse(event.data) } catch { return }
        if (frame.type === 'presence') setOnline(frame.online as string[])
        for (const fn of handlers.current) fn(frame)
      }
      socket.onclose = () => {
        setConnected(false)
        socketRef.current = null
        if (!closed) retry = setTimeout(connect, RECONNECT_MS)
      }
      socket.onerror = () => socket.close()
    }

    connect()
    return () => {
      closed = true
      if (retry) clearTimeout(retry)
      socketRef.current?.close()
    }
  }, [])

  return (
    <SocketContext.Provider value={{ online, connected, send, addHandler }}>
      {children}
    </SocketContext.Provider>
  )
}
