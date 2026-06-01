import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken, getUsers } from '@/lib/auth'
import ProfileClient from './ProfileClient'

export default async function ProfilePage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) redirect('/login')

  const user = await verifyToken(token)
  if (!user) redirect('/login')

  const users = getUsers()
  const userData = users.find(u => u.username === user.username)
  const avatarExt = userData?.avatarExt ?? null

  return (
    <ProfileClient
      username={user.username}
      role={user.role}
      initialAvatarExt={avatarExt}
    />
  )
}
