import { P } from './palette'

export function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = seed + 0x6d2b79f5 | 0
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed)
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

export function drawSunsetSky(ctx: CanvasRenderingContext2D, w: number, horizonY: number, _frame: number): void {
  ctx.imageSmoothingEnabled = false
  for (let row = 0; row < horizonY; row++) {
    ctx.fillStyle = P.sky[Math.min(P.sky.length - 1, Math.floor(row / horizonY * P.sky.length))]
    ctx.fillRect(0, row, w, 1)
  }
}

export function drawSea(ctx: CanvasRenderingContext2D, w: number, top: number, h: number, sunX: number, frame: number, rng: () => number): void {
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = P.sea[1]
  ctx.fillRect(0, top, w, h)
  const phase = Math.floor(frame / 4)
  for (let row = 0; row < h; row += 4) {
    const depth = row / Math.max(1, h)
    for (let index = 0; index < Math.ceil(w / 24); index++) {
      const offset = rng() * w + phase * (index % 2 ? 1 : -1)
      const x = Math.floor((offset % w + w) % w)
      ctx.fillStyle = P.sea[2 + Math.floor(rng() * 2)]
      ctx.fillRect(x, top + row, 3 + Math.floor(rng() * 8), 1)
    }
    const reflectionWidth = 2 + Math.floor(depth * w * 0.16)
    const x = Math.floor(sunX + (rng() * 2 - 1) * reflectionWidth)
    ctx.fillStyle = P.sun[1 + Math.floor(rng() * 2)]
    ctx.fillRect(x, top + row, 2 + Math.floor(rng() * 5), 1)
  }
}

export function drawSun(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, horizonY: number): void {
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = P.sun[3]
  for (let offset = -Math.floor(r); offset <= Math.floor(r); offset++) {
    const y = Math.round(cy) + offset
    if (y >= horizonY) break
    const halfWidth = Math.floor(Math.sqrt(r * r - offset * offset))
    ctx.fillRect(Math.round(cx) - halfWidth, y, halfWidth * 2 + 1, 1)
  }
}
