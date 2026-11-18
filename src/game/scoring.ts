export function coopScore(p: {
  pixelsUsed: number
  totalCells: number
  durationMs: number
  capMs: number
}): number {
  const pixelRatio = p.totalCells > 0 ? p.pixelsUsed / p.totalCells : 1
  const timeRatio = p.capMs > 0 ? p.durationMs / p.capMs : 1
  const raw = 1000 * (0.5 * (1 - pixelRatio) + 0.5 * (1 - timeRatio))
  return Math.max(0, Math.min(1000, Math.round(raw)))
}

export function coopScoreParts(p: {
  pixelsUsed: number
  totalCells: number
  durationMs: number
  capMs: number
}): { pixels: number; time: number; total: number } {
  const total = coopScore(p)
  const pixelRatio = p.totalCells > 0 ? p.pixelsUsed / p.totalCells : 1
  const pixelsRaw = Math.max(0, Math.min(500, 500 * (1 - pixelRatio)))
  const pixels = Math.max(Math.max(0, total - 500), Math.min(total, Math.round(pixelsRaw)))
  const time = total - pixels
  return { pixels, time, total }
}

export function teamWinner(
  red: { matched: boolean; confidence: number },
  blue: { matched: boolean; confidence: number },
): 'red' | 'blue' | 'draw' {
  if (red.matched !== blue.matched) {
    return red.matched ? 'red' : 'blue'
  }
  if (red.confidence > blue.confidence) {
    return 'red'
  }
  if (blue.confidence > red.confidence) {
    return 'blue'
  }
  return 'draw'
}
