'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import type { DomainView } from '@/lib/domain'
import {
  BOARD_H, BOARD_W, BORDER, SHAPES, bounds, placedRings, radiusOf, shapeById, svgPath,
  type Placement, type ShapeDef,
} from '@/lib/domainShapes'
import { BLUE } from '@/lib/domainRaster'
import RulesCard from '@/components/RulesCard'
import { useGameChannel } from '@/components/useGameChannel'
import { DOMAIN_RULES } from './rules'
import styles from './domain.module.css'
import Countdown from '@/components/Countdown'

const POLL_MS = 3000
const FRAME = '#7030a0'
const INK_BLUE = '#93b3dd'
const INK_RED = '#dd9b9b'
const VOID_INK = '#ffd7ac'

interface Props {
  slug: string
  initialView: DomainView
  username: string
  role: Role
  roster: string[]
}


/**
 * Draws one piece. Rings are unioned by drawing them separately, except where a
 * piece has real holes, which need a single even odd path to punch through.
 */
function ShapeArt({ shape, x, y, rot, fill, opacity = 1 }: {
  shape: ShapeDef; x: number; y: number; rot: number; fill: string; opacity?: number
}) {
  const rings = placedRings(shape, x, y, rot)
  return (
    <g opacity={opacity}>
      {shape.holes.length > 0 ? (
        <path d={[...rings.body, ...rings.holes].map(svgPath).join(' ')} fill={fill} fillRule="evenodd" />
      ) : (
        rings.body.map((ring, i) => <path key={i} d={svgPath(ring)} fill={fill} />)
      )}
      {rings.voids.map((ring, i) => <path key={`v${i}`} d={svgPath(ring)} fill={VOID_INK} />)}
      {rings.caps.map((ring, i) => <path key={`c${i}`} d={svgPath(ring)} fill={fill} />)}
    </g>
  )
}

/** A piece drawn on its own, scaled to fill a small square. */
function Thumb({ shape, fill, size = 64 }: { shape: ShapeDef; fill: string; size?: number }) {
  const box = bounds([...shape.body, ...shape.voids])
  const w = box.x1 - box.x0
  const h = box.y1 - box.y0
  const pad = Math.max(w, h) * 0.06
  return (
    <svg width={size} height={size} viewBox={`${box.x0 - pad} ${box.y0 - pad} ${w + pad * 2} ${h + pad * 2}`}>
      <ShapeArt shape={shape} x={0} y={0} rot={0} fill={fill} />
    </svg>
  )
}

export default function DomainClient({ slug, initialView, username, role, roster }: Props) {
  const [view, setView] = useState<DomainView>(initialView)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [ec, setEc] = useState('')
  const [opponent, setOpponent] = useState('')
  const [first, setFirst] = useState('')
  const [chosen, setChosen] = useState<number | null>(null)
  const [rot, setRot] = useState(0)
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null)
  const boardRef = useRef<SVGSVGElement | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const isAdmin = role === 'admin'
  const myInk = view.ink[username] === BLUE ? INK_BLUE : INK_RED
  const inkFor = (owner: string) => (view.ink[owner] === BLUE ? INK_BLUE : INK_RED)
  const myDraft = view.phase === 'draft' && view.draftTurn === username
  const myPlace = view.phase === 'place' && view.turn === username

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/domain/${slug}`)
    if (res.ok) setView(await res.json())
  }, [slug])

  useEffect(() => {
    timer.current = setInterval(refresh, POLL_MS)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [refresh])
  useGameChannel(slug, refresh)

  const act = useCallback(async (payload: Record<string, unknown>) => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/domain/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error ?? 'Ошибка')
      else setView(data)
    } catch {
      setError('Сеть недоступна')
    } finally {
      setBusy(false)
    }
  }, [slug])

  const aimAt = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!myPlace || chosen === null) return
    const svg = boardRef.current
    if (!svg) return
    const shape = shapeById(chosen)
    if (!shape) return
    const box = svg.getBoundingClientRect()
    const x = ((event.clientX - box.left) / box.width) * BOARD_W
    const y = ((event.clientY - box.top) / box.height) * BOARD_H

    // hold the piece clear of the frame whenever there is room for its full reach
    const reach = radiusOf(shape)
    const lo = BORDER + reach
    const hiX = BOARD_W - BORDER - reach
    const hiY = BOARD_H - BORDER - reach
    setSpot({
      x: lo < hiX ? Math.min(hiX, Math.max(lo, x)) : x,
      y: lo < hiY ? Math.min(hiY, Math.max(lo, y)) : y,
    })
  }

  const submit = () => {
    if (chosen === null || !spot) return
    act({ action: 'place', shapeId: chosen, x: spot.x, y: spot.y, rot })
    setChosen(null)
    setSpot(null)
  }

  const preview = chosen !== null ? shapeById(chosen) : undefined

  return (
    <div className={styles.page}>
      <nav className={styles.navbar}>
        <Link href="/" className={styles.back}>← назад</Link>
        <span className={styles.navTitle}>{view.name}</span>
        <span className={styles.navUser}>{username}</span>
      </nav>

      <div className={styles.content}>
        <div className={styles.statusRow}>
          <span className={styles.phaseTag}>
            {view.phase === 'setup' && 'Подготовка'}
            {view.phase === 'draft' && (myDraft ? 'Ваш выбор фигуры' : `Выбирает ${view.draftTurn}`)}
            {view.phase === 'place' && (myPlace ? 'Ваш ход' : `Кладёт ${view.turn}`)}
            {view.phase === 'finished' && 'Матч окончен'}
          </span>
          {view.ec && <span className={styles.roles}>{view.ec} (синий) против {view.opponent} (красный)</span>}
          {view.deadline && <span className={styles.deadline}>Осталось <Countdown deadline={view.deadline} /></span>}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {view.winner && (
          <div className={styles.winner}>
            Победил {view.winner}
            {view.score && <> · синий {view.score.blue.toLocaleString('ru')} · красный {view.score.red.toLocaleString('ru')}</>}
          </div>
        )}

        <RulesCard sections={DOMAIN_RULES} />

        {isAdmin && view.phase === 'setup' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Участники</div>
            <select className={styles.select} value={ec} onChange={e => setEc(e.target.value)}>
              <option value="">кандидат на выбывание (синий)</option>
              {roster.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className={styles.select} value={opponent} onChange={e => setOpponent(e.target.value)}>
              <option value="">соперник (красный)</option>
              {roster.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <button className={styles.primary} disabled={busy || !ec || !opponent}
              onClick={() => act({ action: 'roles', ec, opponent })}>Назначить</button>

            {view.ec && (
              <>
                <div className={styles.cardTitle}>Кто открывает разбор</div>
                <select className={styles.select} value={first} onChange={e => setFirst(e.target.value)}>
                  <option value="">выберите игрока</option>
                  {[view.ec, view.opponent].map(p => <option key={p} value={p as string}>{p}</option>)}
                </select>
                <button className={styles.primary} disabled={busy || !first}
                  onClick={() => act({ action: 'start', first })}>Начать разбор</button>
              </>
            )}
          </div>
        )}

        {(view.phase === 'draft' || view.phase === 'setup') && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              Пул фигур · осталось {view.pool.length} из {view.shapesTotal}
            </div>
            {view.phase === 'draft' && (
              <p className={styles.hint}>
                {myDraft ? 'Ваш выбор: кликните по фигуре.' : `Ждём выбора: ${view.draftTurn}.`}
                {' '}Пропусков: {Object.entries(view.skips).map(([p, n]) => `${p} ${n}`).join(', ')}
              </p>
            )}
            <div className={styles.pool}>
              {SHAPES.map(shape => {
                const owner = view.taken[shape.id]
                return (
                  <button
                    key={shape.id}
                    type="button"
                    className={owner ? styles.tileTaken : styles.tile}
                    disabled={!!owner || !myDraft || busy}
                    onClick={() => act({ action: 'draft', shapeId: shape.id })}
                    title={shape.name}
                  >
                    <span className={styles.tileNum}>{shape.id}</span>
                    <Thumb shape={shape} fill={owner ? inkFor(owner) : '#a99ccc'} />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {(view.phase === 'place' || view.phase === 'finished') && (
          <>
            <div className={styles.boardWrap}>
              <svg
                ref={boardRef}
                viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
                className={styles.board}
                onClick={aimAt}
              >
                <rect width={BOARD_W} height={BOARD_H} fill={FRAME} />
                <rect x={BORDER} y={BORDER} width={BOARD_W / 2 - BORDER} height={BOARD_H - BORDER * 2} fill={INK_BLUE} />
                <rect x={BOARD_W / 2} y={BORDER} width={BOARD_W / 2 - BORDER} height={BOARD_H - BORDER * 2} fill={INK_RED} />

                {view.placements.map((p: Placement, i) => {
                  const shape = shapeById(p.shapeId)
                  if (!shape) return null
                  return <ShapeArt key={i} shape={shape} x={p.x} y={p.y} rot={p.rot} fill={inkFor(p.owner)} />
                })}

                {preview && spot && (
                  <ShapeArt shape={preview} x={spot.x} y={spot.y} rot={rot} fill={myInk} opacity={0.6} />
                )}
              </svg>
            </div>

            {myPlace && (
              <div className={styles.card}>
                <div className={styles.cardTitle}>
                  {chosen === null ? 'Выберите фигуру' : spot ? 'Наведите и подтвердите' : 'Кликните по доске'}
                </div>
                <label className={styles.label}>Поворот: {rot}°</label>
                <input
                  className={styles.range}
                  type="range" min={0} max={355} step={5}
                  value={rot}
                  onChange={e => setRot(Number(e.target.value))}
                />
                <button className={styles.primary} disabled={busy || chosen === null || !spot} onClick={submit}>
                  Положить фигуру
                </button>
              </div>
            )}

            {view.isDuelist && view.phase === 'place' && (
              <div className={styles.card}>
                <div className={styles.cardTitle}>
                  Ваши фигуры: {view.hand.length} · у соперника: {view.rivalHand}
                </div>
                <div className={styles.pool}>
                  {view.hand.map(id => {
                    const shape = shapeById(id)
                    if (!shape) return null
                    return (
                      <button
                        key={id}
                        type="button"
                        className={chosen === id ? styles.tileOn : styles.tile}
                        disabled={!myPlace || busy}
                        onClick={() => { setChosen(id); setSpot(null) }}
                        title={shape.name}
                      >
                        <span className={styles.tileNum}>{id}</span>
                        <Thumb shape={shape} fill={myInk} />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}

        <details className={styles.card}>
          <summary className={styles.cardTitle}>Журнал</summary>
          <ul className={styles.log}>
            {[...view.log].reverse().map((entry, i) => (
              <li key={i}><span className={styles.logTime}>{new Date(entry.at).toLocaleTimeString('ru')}</span> {entry.text}</li>
            ))}
          </ul>
        </details>

        {isAdmin && (
          <div className={styles.pool}>
            {view.phase === 'draft' && (
              <button className={styles.ghost} disabled={busy} onClick={() => act({ action: 'autoDraft' })}>
                Тест: разобрать пул автоматически
              </button>
            )}
            <button className={styles.ghost} disabled={busy} onClick={() => act({ action: 'reset' })}>Сбросить матч</button>
          </div>
        )}
      </div>
    </div>
  )
}
