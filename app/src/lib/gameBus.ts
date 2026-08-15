/**
 * Tells every open socket that a game changed, so pages refresh the moment a move
 * lands instead of on the next poll. The bus lives in server.mjs; inside API
 * routes we only ever emit into it. Views stay permission-filtered because each
 * client refetches through its own session.
 */
export function emitGameUpdate(slug: string): void {
  const bus = (globalThis as { __chatBus?: { emit: (e: string, p: unknown) => void } }).__chatBus
  bus?.emit('game', { slug })
}
