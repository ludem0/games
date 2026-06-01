export type Role = 'admin' | 'player' | 'viewer'

export interface User {
  username: string
  password: string
  role: Role
  avatarExt?: string
}

export interface SessionPayload {
  username: string
  role: Role
}
