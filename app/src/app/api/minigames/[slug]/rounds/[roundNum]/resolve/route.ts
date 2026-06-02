import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import {
  getMinigame, saveMinigame, getPlayerPosition,
  computePsigemGrants, type CrossingResult,
} from '@/lib/minigames'

type Params = { params: Promise<{ slug: string; roundNum: string }> }

export async function POST(_req: Request, { params }: Params) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifyToken(token)
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { slug, roundNum } = await params
  const n = parseInt(roundNum)
  if (isNaN(n) || n < 1 || n > 9) return NextResponse.json({ error: 'Invalid round' }, { status: 400 })

  const game = getMinigame(slug)
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const round = game.rounds.find(r => r.roundNumber === n)
  if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })

  if (round.phase !== 'crossing1_open' && round.phase !== 'crossing2_open') {
    return NextResponse.json({ error: 'No crossing open' }, { status: 400 })
  }
  const crossingNumber: 1 | 2 = round.phase === 'crossing1_open' ? 1 : 2

  const allSubs = round.submissions.filter(s => s.crossingNumber === crossingNumber)
  const allSubmitted = game.participants.every(p => allSubs.some(s => s.username === p))
  const deadlinePassed = round.phaseDeadline ? new Date() > new Date(round.phaseDeadline) : false
  if (!allSubmitted && !deadlinePassed) {
    return NextResponse.json({ error: 'Not all submitted and deadline not passed' }, { status: 400 })
  }

  // --- STEP 1: build submissions map (missing players = stay) ---
  const subMap = new Map(allSubs.map(s => [s.username, s.action]))
  for (const p of game.participants) {
    if (!subMap.has(p)) subMap.set(p, { type: 'stay' })
  }

  // --- STEP 2: get current player positions ---
  const positions: Record<string, 'north' | 'south'> = {}
  for (const p of game.participants) {
    positions[p] = getPlayerPosition(round, p, crossingNumber)
  }

  // --- STEP 3: process switches FIRST ---
  const activatedSwitchIds: string[] = []
  for (const [username, action] of subMap) {
    if (action.type !== 'switch') continue
    const sw = round.layout.switches.find(s => s.id === action.switchId)
    if (!sw || sw.side !== positions[username] || !sw.active) continue
    activatedSwitchIds.push(sw.id)
    // flip isGreyed on both swapped tracks
    for (const trackId of sw.swapsTrackIds) {
      const track = round.layout.tracks.find(t => t.id === trackId)
      if (track) track.isGreyed = !track.isGreyed
    }
  }

  // --- STEP 4: process board actions ---
  const boardGroups: Map<string, string[]> = new Map() // chainId → [usernames]
  const chainToTrack: Map<string, string> = new Map()  // chainId → trackId

  for (const track of round.layout.tracks) {
    if (track.isGreyed) continue
    for (const chain of track.chains) {
      if (crossingNumber === 2 && !round.availableChainsForCrossing2.includes(chain.id)) continue
      chainToTrack.set(chain.id, track.id)
    }
  }

  for (const [username, action] of subMap) {
    if (action.type !== 'board') continue
    if (!boardGroups.has(action.chainId)) boardGroups.set(action.chainId, [])
    boardGroups.get(action.chainId)!.push(username)
  }

  // --- STEP 5: compute departures and points ---
  const pointsAwarded: Record<string, number> = {}
  const departedChainIds: string[] = []
  const newPositions: Record<string, 'north' | 'south'> = { ...positions }

  for (const [username] of subMap) pointsAwarded[username] = 0

  for (const [chainId, riders] of boardGroups) {
    const trackId = chainToTrack.get(chainId)
    if (!trackId) continue
    const track = round.layout.tracks.find(t => t.id === trackId)
    if (!track) continue
    const chain = track.chains.find(c => c.id === chainId)
    if (!chain) continue

    if (riders.length === chain.capacity) {
      // exact match — depart!
      departedChainIds.push(chainId)
      for (const username of riders) {
        pointsAwarded[username] = chain.points
        newPositions[username] = chain.departsTo
      }
    }
    // otherwise: wrong count, nobody moves, 0 points
  }

  // switch activators stay on their side (already set from positions copy)
  // non-riders/non-switchers keep their position too

  // --- STEP 6: psigem milestone check ---
  const psigemGrants = computePsigemGrants(game.totalPoints, pointsAwarded)

  // --- STEP 7: update game state ---
  for (const [username, pts] of Object.entries(pointsAwarded)) {
    game.totalPoints[username] = (game.totalPoints[username] ?? 0) + pts
  }
  for (const [username, grants] of Object.entries(psigemGrants)) {
    game.psigemBalance[username] = (game.psigemBalance[username] ?? 0) + grants
  }

  const result: CrossingResult = {
    crossingNumber,
    resolvedAt: new Date().toISOString(),
    departedChainIds,
    pointsAwarded,
    playerPositions: newPositions,
    psigemGrants,
    activatedSwitchIds,
  }
  round.results.push(result)

  // update available chains for crossing 2
  if (crossingNumber === 1) {
    round.availableChainsForCrossing2 = round.availableChainsForCrossing2.filter(
      id => !departedChainIds.includes(id)
    )
    round.phase = 'crossing1_open' // stays open until admin manually opens crossing 2
    // mark that crossing 1 is done by removing the open state
    round.phase = 'pending' // will be re-opened as crossing2_open by admin
  } else {
    round.phase = 'complete'
  }

  saveMinigame(slug, game)
  return NextResponse.json(result)
}
