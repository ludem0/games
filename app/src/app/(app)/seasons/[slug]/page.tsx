import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import Link from 'next/link'
import CubeSimply from '@/components/CubeSimply'
import CubeZero from '@/components/CubeZero'
import CubeGambit from '@/components/CubeGambit'
import styles from './season.module.css'

const SEASONS: Record<string, {
  name: string
  status: 'done' | 'active' | 'soon'
  statusLabel: string
  Cube: React.ComponentType
  accent: string
}> = {
  simply: {
    name: 'PG: Simply',
    status: 'done',
    statusLabel: 'Завершён',
    Cube: CubeSimply,
    accent: '#FFE033',
  },
  zero: {
    name: 'PG: Zero',
    status: 'done',
    statusLabel: 'Завершён',
    Cube: CubeZero,
    accent: '#E0E0E0',
  },
  gambit: {
    name: 'PG: Puzzle Gambit',
    status: 'active',
    statusLabel: 'Идёт',
    Cube: CubeGambit,
    accent: '#B026FF',
  },
}

export default async function SeasonPage({ params }: { params: Promise<{ slug: string }> }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) redirect('/login')
  const user = await verifyToken(token)
  if (!user) redirect('/login')

  const { slug } = await params
  const season = SEASONS[slug]
  if (!season) notFound()

  const { name, status, statusLabel, Cube, accent } = season

  return (
    <div className={styles.page}>
      <nav className={styles.navbar}>
        <Link href="/" className={styles.back}>← Seasons</Link>
        <div className={styles.navLogo}>PG</div>
        <div className={styles.navUser}>{user.username}</div>
      </nav>

      <main className={styles.content}>
        <div className={styles.cubeWrap}>
          <Cube />
        </div>

        <h1 className={styles.name} style={{ color: accent }}>{name}</h1>

        <span className={`${styles.badge} ${styles[`badge_${status}`]}`}>
          {status === 'active' && <span className={styles.dot} />}
          {statusLabel}
        </span>

        <p className={styles.soon}>Игры скоро появятся</p>
      </main>
    </div>
  )
}
