import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import MainClient from './MainClient'

export default async function MainPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) redirect('/login')

  const user = await verifyToken(token)
  if (!user) redirect('/login')

  return <MainClient username={user.username} role={user.role} />
}
