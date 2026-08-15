import { cookies } from 'next/headers'
import SocketProvider from '@/components/SocketProvider'
import SuBar from '@/components/SuBar'
import { getUsers, verifyToken } from '@/lib/auth'
import { testToolsOn } from '@/lib/testTools'

// Every authenticated page keeps one socket open: chat pushes ride on it, and the
// set of open sockets is what the online list is built from.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies()
  const session = jar.get('session')?.value
  const originCookie = jar.get('su_origin')?.value
  const me = session ? await verifyToken(session) : null
  const origin = originCookie ? await verifyToken(originCookie) : null

  // the switcher stays reachable after a swap, otherwise there would be no way back
  const maySwitch = testToolsOn() && (me?.role === 'admin' || origin?.role === 'admin')

  return (
    <SocketProvider>
      {children}
      {maySwitch && me && (
        <SuBar
          names={getUsers().map(u => u.username)}
          current={me.username}
          origin={origin?.role === 'admin' ? origin.username : null}
        />
      )}
    </SocketProvider>
  )
}
