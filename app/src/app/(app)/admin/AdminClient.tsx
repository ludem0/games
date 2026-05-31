'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Role } from '@/lib/types'
import styles from './admin.module.css'

interface UserRow { username: string; role: Role }

export default function AdminClient({ username }: { username: string }) {
  const router = useRouter()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<Role>('player')
  const [changingPw, setChangingPw] = useState<string | null>(null)
  const [newPw, setNewPw] = useState('')
  const [error, setError] = useState('')

  async function load() {
    const res = await fetch('/api/admin/users')
    if (res.ok) setUsers(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }),
    })
    if (res.ok) {
      setNewUsername(''); setNewPassword(''); setNewRole('player')
      load()
    } else {
      const d = await res.json()
      setError(d.error ?? 'Ошибка')
    }
  }

  async function handleDelete(target: string) {
    await fetch(`/api/admin/users/${encodeURIComponent(target)}`, { method: 'DELETE' })
    load()
  }

  async function handleChangePw(target: string) {
    if (!newPw) return
    await fetch(`/api/admin/users/${encodeURIComponent(target)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPw }),
    })
    setChangingPw(null); setNewPw('')
    load()
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      <nav className={styles.navbar}>
        <div className={styles.navLeft}>
          <a href="/" className={styles.navLogo}>PG</a>
          <span className={styles.navTitle}>Управление игроками</span>
        </div>
        <div className={styles.navRight}>
          <span className={styles.username}>{username}</span>
          <button className={styles.logoutBtn} onClick={handleLogout}>Выйти</button>
        </div>
      </nav>

      <main className={styles.main}>
        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Добавить игрока</h2>
          <form className={styles.addForm} onSubmit={handleAdd}>
            <input
              className={styles.input}
              placeholder="Имя"
              value={newUsername}
              onChange={e => setNewUsername(e.target.value)}
              required
            />
            <input
              className={styles.input}
              placeholder="Пароль"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
            />
            <select
              className={styles.select}
              value={newRole}
              onChange={e => setNewRole(e.target.value as Role)}
            >
              <option value="player">Игрок</option>
              <option value="viewer">Зритель</option>
              <option value="admin">Админ</option>
            </select>
            <button className={styles.addBtn} type="submit">Добавить</button>
          </form>
          {error && <p className={styles.error}>{error}</p>}
        </section>

        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Игроки</h2>
          {loading ? (
            <p className={styles.muted}>Загрузка...</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Имя</th>
                  <th>Роль</th>
                  <th>Пароль</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.username}>
                    <td className={styles.tdName}>{u.username}</td>
                    <td><span className={`${styles.roleBadge} ${styles[`role_${u.role}`]}`}>{u.role}</span></td>
                    <td>
                      {changingPw === u.username ? (
                        <div className={styles.inlineForm}>
                          <input
                            className={styles.inputSm}
                            placeholder="Новый пароль"
                            value={newPw}
                            onChange={e => setNewPw(e.target.value)}
                            autoFocus
                          />
                          <button className={styles.saveBtn} onClick={() => handleChangePw(u.username)}>Сохранить</button>
                          <button className={styles.cancelBtn} onClick={() => { setChangingPw(null); setNewPw('') }}>✕</button>
                        </div>
                      ) : (
                        <button className={styles.pwBtn} onClick={() => setChangingPw(u.username)}>Сменить пароль</button>
                      )}
                    </td>
                    <td>
                      {u.username !== username && (
                        <button className={styles.deleteBtn} onClick={() => handleDelete(u.username)}>Удалить</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </>
  )
}
