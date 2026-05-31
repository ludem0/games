import { readFileSync } from 'fs'
import { join } from 'path'
import type { User } from './types'

export { signToken, verifyToken } from './jwt'

const USERS_PATH = join(process.cwd(), 'users.json')

export function getUsers(): User[] {
  const raw = readFileSync(USERS_PATH, 'utf-8')
  return JSON.parse(raw)
}

export function findUser(username: string, password: string): User | null {
  const users = getUsers()
  return users.find(u => u.username === username && u.password === password) ?? null
}
