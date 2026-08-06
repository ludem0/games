import SocketProvider from '@/components/SocketProvider'

// Every authenticated page keeps one socket open: chat pushes ride on it, and the
// set of open sockets is what the online list is built from.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <SocketProvider>{children}</SocketProvider>
}
