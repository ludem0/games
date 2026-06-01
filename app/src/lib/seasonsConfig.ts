export interface SeasonConfig {
  name: string
  status: 'done' | 'active' | 'soon'
  statusLabel: string
  accent: string
  glowColor: string
}

export const SEASONS_CONFIG: Record<string, SeasonConfig> = {
  simply: { name: 'PG: Simply',        status: 'done',   statusLabel: 'Завершён', accent: '#FFE033', glowColor: 'rgba(255,220,0,0.4)'   },
  zero:   { name: 'PG: Zero',          status: 'done',   statusLabel: 'Завершён', accent: '#E0E0E0', glowColor: 'rgba(200,200,200,0.3)' },
  gambit: { name: 'PG: Puzzle Gambit', status: 'active', statusLabel: 'Идёт',     accent: '#B026FF', glowColor: 'rgba(176,38,255,0.45)' },
}

export const DONE_SEASONS = Object.entries(SEASONS_CONFIG).filter(([, v]) => v.status === 'done')
