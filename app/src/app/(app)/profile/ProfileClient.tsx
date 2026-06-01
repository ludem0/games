'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import styles from './profile.module.css'

const ROLE_LABELS: Record<Role, string> = { admin: 'Админ', player: 'Игрок', viewer: 'Зритель' }

interface Props {
  username: string
  role: Role
  initialAvatarExt: string | null
}

export default function ProfileClient({ username, role, initialAvatarExt }: Props) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    initialAvatarExt ? `/api/avatars/${username}` : null
  )
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    setSuccess(false)
    const file = e.target.files?.[0]
    if (!file) { setPreview(null); return }
    if (file.size > 2 * 1024 * 1024) {
      setError('Файл превышает 2MB')
      setPreview(null)
      return
    }
    const reader = new FileReader()
    reader.onload = () => setPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    setSuccess(false)

    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

    const res = await fetch('/api/me/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl, mimeType: file.type }),
    })
    const data = await res.json()

    if (res.ok) {
      setAvatarUrl(data.avatarUrl + '?t=' + Date.now())
      setPreview(null)
      setSuccess(true)
      if (fileRef.current) fileRef.current.value = ''
    } else {
      setError(data.error ?? 'Ошибка загрузки')
    }
    setUploading(false)
  }

  const displayImg = preview ?? avatarUrl

  return (
    <div className={styles.page}>
      <nav className={styles.navbar}>
        <Link href="/" className={styles.back}>← Главная</Link>
        <div className={styles.navLogo}>PG</div>
        <div style={{ width: 80 }} />
      </nav>

      <div className={styles.content}>
        <div className={styles.avatarSection}>
          {displayImg ? (
            <img src={displayImg} alt="avatar" className={styles.avatarCircle} />
          ) : (
            <div className={styles.avatarPlaceholder}>{username.slice(0, 2).toUpperCase()}</div>
          )}
          <span className={styles.username}>{username}</span>
          <span className={styles.roleBadge}>{ROLE_LABELS[role]}</span>
        </div>

        <div className={styles.uploadSection}>
          <span className={styles.uploadLabel}>Аватар</span>
          <div className={styles.fileInputWrap}>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className={styles.fileInput}
              onChange={handleFileChange}
            />
            <button
              className={styles.uploadBtn}
              onClick={handleUpload}
              disabled={uploading || !preview}
            >
              {uploading ? '...' : 'Загрузить'}
            </button>
          </div>
          <span className={styles.hint}>JPG, PNG или WebP · макс. 2MB</span>
          {error && <span className={styles.errorMsg}>{error}</span>}
          {success && <span className={styles.successMsg}>Аватар обновлён</span>}
        </div>
      </div>
    </div>
  )
}
