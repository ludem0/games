import { SignJWT, jwtVerify } from 'jose'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { User, SessionPayload } from './types'

const USERS_PATH = join(process.cwd(), 'users.json')
const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? 'fallback-secret')

export function getUsers(): User[] {
  const raw = readFileSync(USERS_PATH, 'utf-8')
  return JSON.parse(raw)
}

export function findUser(username: string, password: string): User | null {
  const users = getUsers()
  return users.find(u => u.username === username && u.password === password) ?? null
}

export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .sign(secret)
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}
