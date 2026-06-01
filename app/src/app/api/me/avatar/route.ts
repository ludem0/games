import { NextRequest, NextResponse } from 'next/server'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { verifyToken, getUsers, saveUsers } from '@/lib/auth'

const AVATARS_DIR = join(process.cwd(), 'public', 'avatars')
const MAX_SIZE = 2 * 1024 * 1024 // 2MB
const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

function ensureDir() {
  if (!existsSync(AVATARS_DIR)) mkdirSync(AVATARS_DIR, { recursive: true })
}

function removeExisting(username: string) {
  for (const ext of Object.values(ALLOWED_MIME)) {
    const p = join(AVATARS_DIR, `${username}.${ext}`)
    if (existsSync(p)) unlinkSync(p)
  }
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('session')?.value
  if (!token) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Невалидный токен' }, { status: 401 })

  const users = getUsers()
  const user = users.find(u => u.username === payload.username)
  const avatarUrl = user?.avatarExt ? `/avatars/${payload.username}.${user.avatarExt}` : null

  return NextResponse.json({ avatarUrl })
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('session')?.value
  if (!token) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Невалидный токен' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Неверный формат запроса' }, { status: 400 })
  }

  const file = formData.get('avatar')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Файл не найден' }, { status: 400 })
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Файл превышает 2MB' }, { status: 400 })
  }

  const ext = ALLOWED_MIME[file.type]
  if (!ext) {
    return NextResponse.json({ error: 'Допустимые форматы: JPG, PNG, WebP' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  ensureDir()
  removeExisting(payload.username)
  writeFileSync(join(AVATARS_DIR, `${payload.username}.${ext}`), buffer)

  const users = getUsers()
  const updated = users.map(u => u.username === payload.username ? { ...u, avatarExt: ext } : u)
  saveUsers(updated)

  return NextResponse.json({ avatarUrl: `/avatars/${payload.username}.${ext}` })
}
