export const PALETTE: readonly string[] = [
  '#ffffff', // 0: white (empty)
  '#000000', // 1: black
  '#9ca3af', // 2: light gray
  '#4b5563', // 3: dark gray
  '#ef4444', // 4: red
  '#f97316', // 5: orange
  '#eab308', // 6: yellow
  '#22c55e', // 7: green
  '#15803d', // 8: dark green
  '#06b6d4', // 9: cyan
  '#3b82f6', // 10: blue
  '#1d4ed8', // 11: dark blue
  '#a855f7', // 12: purple
  '#ec4899', // 13: pink
  '#92400e', // 14: brown
  '#fde68a', // 15: cream
]

export type Mode = 'coop' | 'team'
export type ZoneId = 'all' | 'red' | 'blue'

export interface Zone {
  id: ZoneId
  x: number
  y: number
  w: number
  h: number
}

export interface ModeConfig {
  width: number
  height: number
  zones: Zone[]
  roundMs: number | null
  capMs: number
  intermissionMs: number
}

export const MODES: Record<Mode, ModeConfig> = {
  coop: {
    width: 32,
    height: 32,
    zones: [{ id: 'all', x: 0, y: 0, w: 32, h: 32 }],
    roundMs: null,
    capMs: 300_000,
    intermissionMs: 8_000,
  },
  team: {
    width: 64,
    height: 32,
    zones: [
      { id: 'red', x: 0, y: 0, w: 32, h: 32 },
      { id: 'blue', x: 32, y: 0, w: 32, h: 32 },
    ],
    roundMs: 180_000,
    capMs: 180_000,
    intermissionMs: 8_000,
  },
}

export const JUDGE = {
  model: 'claude-haiku-5-5',
  maxTokens: 1024,
  renderPx: 512,
  tickMs: 15_000,
  askMinMs: 10_000,
  maxPerMinute: 6,
} as const

export const BUDGET = {
  dailyCalls: 1000,
} as const

export const DAILY = {
  attemptMs: 600_000,
  graceMs: 15_000,
  autoWindowsMs: [120_000, 240_000, 360_000, 480_000] as const,
  autoLateMs: 5_000,
  autoMissAfterMs: 60_000,
  maxAsks: 3,
  askMinGapMs: 20_000,
  inFlightStaleMs: 90_000,
  renderPx: 512,
} as const

export const ROOMS = {
  maxActivePerUser: 5,
  resumeWindowMs: 600_000,
  closeAfterEmptyMs: 1_800_000,
} as const
