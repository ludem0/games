/**
 * Test helpers let an admin walk through a match alone: switching seats and
 * skipping setup phases. They only exist when the server is started with
 * TEST_TOOLS=1, so a live season cannot be tampered with by accident.
 */
export const testToolsOn = (): boolean => process.env.TEST_TOOLS === '1'

export const SESSION_COOKIE = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
} as const
