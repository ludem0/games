import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const CHATS_PATH = join(process.cwd(), 'chats.json')

export interface ChatMessage {
  id: string
  author: string
  text: string
  at: string
}

export interface Chat {
  id: string
  title: string
  members: string[]
  createdBy: string
  createdAt: string
  messages: ChatMessage[]
}

// chats.json holds every season: { [seasonSlug]: Chat[] }
function readAll(): Record<string, Chat[]> {
  if (!existsSync(CHATS_PATH)) return {}
  try {
    return JSON.parse(readFileSync(CHATS_PATH, 'utf-8'))
  } catch {
    return {}
  }
}

function writeAll(data: Record<string, Chat[]>): void {
  writeFileSync(CHATS_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getChats(seasonSlug: string): Chat[] {
  return readAll()[seasonSlug] ?? []
}

export function getChat(seasonSlug: string, chatId: string): Chat | null {
  return getChats(seasonSlug).find(c => c.id === chatId) ?? null
}

export function saveChat(seasonSlug: string, chat: Chat): void {
  const all = readAll()
  const chats = all[seasonSlug] ?? []
  const i = chats.findIndex(c => c.id === chat.id)
  all[seasonSlug] = i >= 0 ? chats.map(c => (c.id === chat.id ? chat : c)) : [...chats, chat]
  writeAll(all)
}

export function deleteChat(seasonSlug: string, chatId: string): void {
  const all = readAll()
  all[seasonSlug] = (all[seasonSlug] ?? []).filter(c => c.id !== chatId)
  writeAll(all)
}

export function canSee(chat: Chat, username: string, isAdmin: boolean): boolean {
  return isAdmin || chat.members.includes(username)
}

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}
