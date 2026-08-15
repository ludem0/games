export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startNotifier } = await import('./lib/notify')
    startNotifier()
  }
}
