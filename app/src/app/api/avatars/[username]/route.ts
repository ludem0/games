import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { verifyToken } from '@/lib/auth'

const AVATARS_DIR = join(process.cwd(), 'public', 'avatars')
const EXTS: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const token = req.cookies.get('session')?.value
  if (!token) return new NextResponse(null, { status: 401 })

  const payload = await verifyToken(token)
  if (!payload) return new NextResponse(null, { status: 401 })

  const { username } = await params

  for (const [ext, mime] of Object.entries(EXTS)) {
    const filePath = join(AVATARS_DIR, `${username}.${ext}`)
    if (existsSync(filePath)) {
      const buffer = readFileSync(filePath)
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    }
  }

  return new NextResponse(null, { status: 404 })
}
