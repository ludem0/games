import { SignJWT, jwtVerify } from 'jose'
import type { SessionPayload } from './types'

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET ?? 'fallback-secret')
}

export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .sign(getSecret())
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}
