import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getUsers } from './auth'
import { scanTurns } from './gameScan'

// "Your move" pushes over Telegram. A timer walks every game once a minute; when
// the turn lands on a new player and that player has bound a chat, the bot pings
// them. Binding happens in the bot itself: the player sends `/bind <логин>`.
//
// Without TELEGRAM_BOT_TOKEN in the environment all of this stays dormant.

const STATE_PATH = join(process.cwd(), 'notify.json')
const TICK_MS = 60_000
const SITE_URL = process.env.SITE_URL ?? 'http://178.105.251.228:8080'

interface NotifyState {
  /** username → telegram chat id */
  chats: Record<string, number>
  /** game slug → whose turn we saw there last */
  lastTurn: Record<string, string>
  /** getUpdates offset so commands are handled exactly once */
  offset: number
}

function readState(): NotifyState {
  if (!existsSync(STATE_PATH)) return { chats: {}, lastTurn: {}, offset: 0 }
  try {
    const raw = JSON.parse(readFileSync(STATE_PATH, 'utf-8'))
    return { chats: raw.chats ?? {}, lastTurn: raw.lastTurn ?? {}, offset: raw.offset ?? 0 }
  } catch {
    return { chats: {}, lastTurn: {}, offset: 0 }
  }
}

function writeState(state: NotifyState): void {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8')
}

const api = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`

async function send(token: string, chatId: number, text: string): Promise<void> {
  try {
    await fetch(api(token, 'sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    })
  } catch {
    // network hiccups are not worth crashing the timer over
  }
}

interface TgUpdate {
  update_id: number
  message?: { chat?: { id?: number }; text?: string }
}

/** Reads fresh bot messages and handles the two commands it understands. */
async function handleCommands(token: string, state: NotifyState): Promise<boolean> {
  let updates: TgUpdate[]
  try {
    const res = await fetch(api(token, 'getUpdates') + `?offset=${state.offset}&timeout=0`)
    const data = await res.json() as { ok: boolean; result?: TgUpdate[] }
    if (!data.ok || !data.result) return false
    updates = data.result
  } catch {
    return false
  }

  let changed = false
  for (const update of updates) {
    state.offset = Math.max(state.offset, update.update_id + 1)
    changed = true
    const chatId = update.message?.chat?.id
    const text = update.message?.text?.trim() ?? ''
    if (!chatId) continue

    if (text.startsWith('/bind')) {
      const wanted = text.slice('/bind'.length).trim()
      const user = getUsers().find(u => u.username.toLowerCase() === wanted.toLowerCase())
      if (!user) {
        await send(token, chatId, wanted ? `Не знаю игрока «${wanted}».` : 'Напишите: /bind ваш_логин')
        continue
      }
      state.chats = { ...state.chats, [user.username]: chatId }
      await send(token, chatId, `Готово, ${user.username}. Буду писать, когда наступит ваш ход.`)
    } else {
      await send(token, chatId, 'Я слежу за играми. Привяжите логин: /bind ваш_логин')
    }
  }
  return changed
}

/** One pass: bot commands first, then the turn scan. */
export async function notifyTick(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return

  const state = readState()
  let changed = await handleCommands(token, state)

  for (const entry of scanTurns()) {
    if (state.lastTurn[entry.slug] === entry.player) continue
    state.lastTurn = { ...state.lastTurn, [entry.slug]: entry.player }
    changed = true
    const chatId = state.chats[entry.player]
    if (chatId) {
      await send(token, chatId, `Ваш ход: ${entry.name}\n${SITE_URL}${entry.url}`)
    }
  }

  if (changed) writeState(state)
}

/** Called once from instrumentation when the server boots. */
export function startNotifier(): void {
  const flag = globalThis as { __notifierStarted?: boolean }
  if (flag.__notifierStarted) return
  flag.__notifierStarted = true
  const timer = setInterval(() => { void notifyTick() }, TICK_MS)
  timer.unref()
}
