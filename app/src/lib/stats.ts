import type { Round, DeathMatch } from './seasons'

export interface SeasonStats {
  slug: string
  seasonName: string
  rank: number | null
  rankTotal: number
  mmParticipations: number
  mmWins: number
  dmParticipations: number
  dmWins: number
  mmWinStreak: number
  dmWinStreak: number
}

export interface PlayerStats {
  username: string
  seasons: SeasonStats[]
  totals: {
    mmParticipations: number
    mmWins: number
    dmParticipations: number
    dmWins: number
    mmWinStreak: number
    dmWinStreak: number
  }
}

interface SeasonMeta {
  slug: string
  seasonName: string
  participants: string[]
  psigems: Record<string, number>
  rounds: Round[]
}

function getDMs(round: Round): DeathMatch[] {
  return round.deathMatches ?? (round.deathMatch ? [round.deathMatch] : [])
}

function buildPsiGroups(players: string[], psigems: Record<string, number>): string[][] {
  const map = new Map<number, string[]>()
  const groups: string[][] = []
  for (const p of players) {
    const psi = psigems[p] ?? 1
    if (!map.has(psi)) { map.set(psi, []); groups.push(map.get(psi)!) }
    map.get(psi)!.push(p)
  }
  return groups
}

function computeRank(
  username: string,
  participants: string[],
  psigems: Record<string, number>,
  rounds: Round[]
): number | null {
  if (!participants.includes(username)) return null

  const eliminatedGroups: string[][] = rounds
    .map(r => getDMs(r).map(dm => dm.eliminated).filter(Boolean) as string[])
    .filter(g => g.length > 0)

  const eliminatedSet = new Set(eliminatedGroups.flat())
  const active = participants.filter(p => !eliminatedSet.has(p))

  const finalRound = rounds.find(r => r.type === 'final')
  const champion = finalRound?.mainMatch.winners[0] ?? null
  const runnerUp = finalRound?.mainMatch.losers[0] ?? null

  const restActive = active.filter(p => p !== champion && p !== runnerUp)
    .sort((a, b) => (psigems[b] ?? 1) - (psigems[a] ?? 1))

  let activeGroups: string[][]
  if (finalRound) {
    activeGroups = [
      ...(champion ? [[champion]] : []),
      ...(runnerUp ? [[runnerUp]] : []),
      ...buildPsiGroups(restActive, psigems),
    ]
  } else {
    const activeSorted = [...active].sort((a, b) => (psigems[b] ?? 1) - (psigems[a] ?? 1))
    activeGroups = buildPsiGroups(activeSorted, psigems)
  }

  if (!eliminatedSet.has(username)) {
    let rank = 1
    for (const group of activeGroups) {
      if (group.includes(username)) return rank
      rank += group.length
    }
    return rank
  }

  const activeSortedFlat = activeGroups.flat()
  const eliminatedGroupsReversed = [...eliminatedGroups].reverse()
  let rank = activeSortedFlat.length + 1
  for (const group of eliminatedGroupsReversed) {
    if (group.includes(username)) return rank
    rank += group.length
  }
  return rank
}

function longestMMWinStreak(username: string, rounds: Round[]): number {
  const sorted = [...rounds].sort((a, b) => a.number - b.number)
  let max = 0, cur = 0
  for (const round of sorted) {
    if (round.mainMatch.winners.includes(username)) {
      cur++
      if (cur > max) max = cur
    } else if (round.mainMatch.participants.includes(username)) {
      cur = 0
    }
  }
  return max
}

function longestDMWinStreak(username: string, rounds: Round[]): number {
  const sorted = [...rounds].sort((a, b) => a.number - b.number)
  let max = 0, cur = 0
  for (const round of sorted) {
    const playerDMs = getDMs(round).filter(dm => dm.participants.includes(username))
    if (playerDMs.length === 0) continue
    if (playerDMs.some(dm => dm.winner === username)) {
      cur++
      if (cur > max) max = cur
    } else {
      cur = 0
    }
  }
  return max
}

export function computePlayerStats(username: string, seasons: SeasonMeta[]): PlayerStats {
  const seasonStats: SeasonStats[] = seasons.map(({ slug, seasonName, participants, psigems, rounds }) => {
    const sortedRounds = [...rounds].sort((a, b) => a.number - b.number)
    const rank = computeRank(username, participants, psigems, sortedRounds)

    let mmParticipations = 0, mmWins = 0, dmParticipations = 0, dmWins = 0
    for (const round of sortedRounds) {
      if (round.mainMatch.participants.includes(username)) mmParticipations++
      if (round.mainMatch.winners.includes(username)) mmWins++
      for (const dm of getDMs(round)) {
        if (dm.participants.includes(username)) {
          dmParticipations++
          if (dm.winner === username) dmWins++
        }
      }
    }

    return {
      slug,
      seasonName,
      rank,
      rankTotal: participants.length,
      mmParticipations,
      mmWins,
      dmParticipations,
      dmWins,
      mmWinStreak: longestMMWinStreak(username, sortedRounds),
      dmWinStreak: longestDMWinStreak(username, sortedRounds),
    }
  })

  const totals = seasonStats.reduce(
    (acc, s) => ({
      mmParticipations: acc.mmParticipations + s.mmParticipations,
      mmWins: acc.mmWins + s.mmWins,
      dmParticipations: acc.dmParticipations + s.dmParticipations,
      dmWins: acc.dmWins + s.dmWins,
      mmWinStreak: Math.max(acc.mmWinStreak, s.mmWinStreak),
      dmWinStreak: Math.max(acc.dmWinStreak, s.dmWinStreak),
    }),
    { mmParticipations: 0, mmWins: 0, dmParticipations: 0, dmWins: 0, mmWinStreak: 0, dmWinStreak: 0 }
  )

  return { username, seasons: seasonStats, totals }
}

export function computeAllPlayerStats(players: string[], seasons: SeasonMeta[]): Record<string, PlayerStats> {
  return Object.fromEntries(players.map(p => [p, computePlayerStats(p, seasons)]))
}

export function computePerformanceScore(stats: PlayerStats): number {
  const { totals, seasons } = stats

  const rankScores = seasons
    .filter(s => s.rank != null && s.rankTotal > 1)
    .map(s => (s.rankTotal - s.rank!) / (s.rankTotal - 1) * 100)
  const avgRank = rankScores.length > 0
    ? rankScores.reduce((a, b) => a + b, 0) / rankScores.length
    : null

  const mmRate = totals.mmParticipations > 0
    ? (totals.mmWins / totals.mmParticipations) * 100
    : null

  const dmRate = totals.dmParticipations > 0
    ? (totals.dmWins / totals.dmParticipations) * 100
    : null

  const components: Array<{ value: number; weight: number }> = [
    ...(avgRank != null ? [{ value: avgRank, weight: 40 }] : []),
    ...(mmRate != null ? [{ value: mmRate, weight: 40 }] : []),
    ...(dmRate != null ? [{ value: dmRate, weight: 20 }] : []),
  ]

  const totalWeight = components.reduce((a, c) => a + c.weight, 0)
  if (totalWeight === 0) return 0

  return Math.round(
    components.reduce((a, c) => a + c.value * (c.weight / totalWeight), 0)
  )
}
