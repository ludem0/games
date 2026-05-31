import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import AdminClient from './AdminClient'

export default async function AdminPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) redirect('/login')

  const user = await verifyToken(token)
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/')

  return <AdminClient username={user.username} />
}
