/** A shape spanning this share of both canvas axes earns full size credit. */
export const COOP_SIZE_FULL_SPAN = 0.75
/** Below this paint density inside the shape's bounding box, size credit tapers to zero. */
export const COOP_SIZE_MIN_DENSITY = 0.08
/** Size is the bigger half of the score: it is what pushes a team past a doodle. */
const SIZE_WEIGHT = 0.6
const SPEED_WEIGHT = 0.4
const SIZE_POINTS = 600

export interface CoopScoreInput {
  cells: Uint8Array
  width: number
  height: number
  durationMs: number
  capMs: number
}

/** The largest 8-connected painted shape, with the bounding box it spans. */
export interface ShapeStats {
  cells: number
  width: number
  height: number
  /** Painted cells / bounding-box area. */
  density: number
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/**
 * The biggest single blob of painted cells, so a few corner dots cannot claim a large
 * bounding box: four isolated dots are four one-cell shapes, and the largest one is tiny.
 */
export function largestShape(cells: Uint8Array, width: number, height: number): ShapeStats | null {
  const total = width * height
  if (width <= 0 || height <= 0 || cells.length < total) return null
  const seen = new Uint8Array(total)
  const stack: number[] = []
  let best: ShapeStats | null = null
  for (let start = 0; start < total; start++) {
    if (seen[start] || cells[start] === 0) continue
    seen[start] = 1
    stack.push(start)
    let painted = 0
    let minX = width
    let maxX = -1
    let minY = height
    let maxY = -1
    while (stack.length > 0) {
      const idx = stack.pop()!
      const x = idx % width
      const y = (idx - x) / width
      painted += 1
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          const neighbour = ny * width + nx
          if (seen[neighbour] === 0 && cells[neighbour] !== 0) {
            seen[neighbour] = 1
            stack.push(neighbour)
          }
        }
      }
    }
    const shapeWidth = maxX - minX + 1
    const shapeHeight = maxY - minY + 1
    const candidate: ShapeStats = {
      cells: painted,
      width: shapeWidth,
      height: shapeHeight,
      density: painted / (shapeWidth * shapeHeight),
    }
    const better =
      best === null ||
      candidate.cells > best.cells ||
      // Same amount of paint: prefer the one that covers more ground, deterministically.
      (candidate.cells === best.cells && candidate.width * candidate.height > best.width * best.height)
    if (better) best = candidate
  }
  return best
}

/**
 * 0..1 size credit for one canvas. Full marks when the main shape spans 75% of both axes;
 * a sparse shape is tapered out below 8% paint density so scattered dots count for nothing.
 */
export function coopSize(cells: Uint8Array, width: number, height: number): number {
  if (width <= 0 || height <= 0) return 0
  const shape = largestShape(cells, width, height)
  if (!shape) return 0
  const span =
    Math.min(1, shape.width / width / COOP_SIZE_FULL_SPAN) *
    Math.min(1, shape.height / height / COOP_SIZE_FULL_SPAN)
  const density = Math.min(1, shape.density / COOP_SIZE_MIN_DENSITY)
  return clamp01(span * density)
}

/**
 * Co-op score out of 1000: 60% how big the drawing is, 40% how quickly Haiku recognised it.
 * Bigger drawings beat smaller ones, which is the incentive the old "fewer pixels" half inverted.
 */
export function coopScoreParts(p: CoopScoreInput): { size: number; time: number; total: number } {
  const sizeRatio = coopSize(p.cells, p.width, p.height)
  const timeRatio = clamp01(p.capMs > 0 ? p.durationMs / p.capMs : 1)
  const speedRatio = 1 - timeRatio
  const total = Math.max(0, Math.min(1000, Math.round(1000 * (SIZE_WEIGHT * sizeRatio + SPEED_WEIGHT * speedRatio))))
  // Derive the displayed halves from the rounded total so they always add up to it.
  const sizeRaw = Math.max(0, Math.min(SIZE_POINTS, SIZE_POINTS * sizeRatio))
  const size = Math.max(Math.max(0, total - (1000 - SIZE_POINTS)), Math.min(total, Math.round(sizeRaw)))
  return { size, time: total - size, total }
}

export function coopScore(p: CoopScoreInput): number {
  return coopScoreParts(p).total
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
