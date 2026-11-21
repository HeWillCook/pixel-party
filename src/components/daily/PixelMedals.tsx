import { useEffect, useRef } from 'react'
import { P } from '../../scene/palette'
import { DETAIL, DetailGrid } from '../../scene/detail'
import { defineSprite, drawSprite, type Sprite } from '../../scene/sprite'

// Medals and the trophy are authored on the 2x detail grid (11x11 / 11x10 scene units, shown at the same size).
const GLYPHS: Record<1 | 2 | 3, string[]> = {
  1: ['..aa..', 'aaaa..', '..aa..', '..aa..', '..aa..', '..aa..', '..aa..', '..aa..', 'aaaaaa'],
  2: ['.aaaa.', 'aa..aa', '....aa', '...aa.', '..aa..', '.aa...', 'aa....', 'aa....', 'aaaaaa'],
  3: ['.aaaa.', 'aa..aa', '....aa', '..aaa.', '..aaa.', '....aa', '....aa', 'aa..aa', '.aaaa.'],
}

function makeMedalSprite(rank: 1 | 2 | 3, body: string, highlight: string, shadow: string, ribbon: string, ribbonShadow: string): Sprite {
  const g = new DetailGrid(22, 22)
  // Ribbon: two straps converging on the disc, with a dark inner edge.
  for (let y = 0; y < 7; y++) {
    const left = 4 + Math.round(y * 0.7), right = 17 - Math.round(y * 0.7)
    g.rect(left, y, 4, 1, 'r'); g.px(left + 3, y, 'c'); g.rect(right - 3, y, 4, 1, 'r'); g.px(right - 3, y, 'c')
  }
  // Disc lit from the upper right: highlight arc, shadow arc, a groove ring and an embossed numeral.
  const cx = 10.5, cy = 13, radius = 8
  for (let y = 0; y < 22; y++) for (let x = 0; x < 22; x++) {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy)
    if (d > radius + 0.4) continue
    const light = (dx - dy) / (Math.max(d, 0.001) * 1.41)
    let key = 'b'
    if (d > radius - 0.8) key = 'a'
    else if (d > radius - 2) key = light > 0.3 ? 'h' : light < -0.3 ? 's' : 'b'
    else if (d > 5.6 && d <= 6.4) key = light > 0 ? 's' : 'h'
    g.px(x, y, key)
  }
  GLYPHS[rank].forEach((row, gy) => Array.from(row).forEach((cell, gx) => {
    if (cell === 'a') { g.px(8 + gx + 1, 9 + gy + 1, 'h'); g.px(8 + gx, 9 + gy, 'a') }
  }))
  return defineSprite(g.lines(), { a: P.wood[0], b: body, h: highlight, s: shadow, r: ribbon, c: ribbonShadow })
}

const medalSprites: Record<1 | 2 | 3, Sprite> = {
  1: makeMedalSprite(1, P.sun[3], P.sun[4], P.sun[2], P.flame[1], P.flame[0]),
  2: makeMedalSprite(2, P.sea[4], P.paper[4], P.sea[3], P.sea[2], P.sea[1]),
  3: makeMedalSprite(3, P.wood[3], P.wood[4], P.wood[2], P.sky[2], P.sky[1]),
}

function makeTrophySprite(): Sprite {
  const g = new DetailGrid(22, 20)
  const widths = [9, 9, 9, 8, 8, 7, 7, 6, 5, 4]
  widths.forEach((hw, i) => {
    const y = 2 + i
    g.rect(11 - hw, y, hw * 2, 1, 'b'); g.px(11 - hw, y, 'a'); g.px(10 + hw, y, 'a')
    g.rect(11 - hw + 1, y, 2, 1, 's'); g.rect(10 + hw - 2, y, 2, 1, 'h')
  })
  g.rect(2, 2, 18, 1, 'a'); g.rect(3, 2, 15, 1, 'h')
  // Handles: open rings either side of the cup.
  for (const [x0, dir] of [[1, -1], [18, 1]] as const) {
    g.rect(x0, 4, 3, 1, 'a'); g.rect(x0 + (dir < 0 ? 0 : 2), 5, 1, 4, 'a'); g.rect(x0, 9, 3, 1, 'a')
    g.rect(x0 + 1, 5, 1, 4, 'b')
  }
  g.rect(9, 12, 4, 3, 'a'); g.rect(10, 12, 2, 3, 'b'); g.rect(10, 12, 1, 3, 's')
  g.rect(5, 15, 12, 5, 'a'); g.rect(6, 16, 10, 3, 'b'); g.rect(6, 16, 10, 1, 'h'); g.rect(6, 18, 10, 1, 's')
  return defineSprite(g.lines(), { a: P.wood[0], b: P.sun[3], h: P.sun[4], s: P.sun[2] })
}
const trophySprite = makeTrophySprite()

export function PixelIconCanvas({
  sprite,
  scale = 'scene',
  className = '',
  label,
}: {
  sprite: Sprite
  scale?: number | 'scene'
  className?: string
  label?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, sprite.w, sprite.h)
    drawSprite(ctx, sprite, 0, 0)
  }, [sprite])

  const style =
    scale === 'scene'
      ? { width: `calc(var(--px, 3px) * ${sprite.w / DETAIL})`, height: `calc(var(--px, 3px) * ${sprite.h / DETAIL})` }
      : { width: (sprite.w / DETAIL) * scale, height: (sprite.h / DETAIL) * scale }

  return (
    <canvas
      ref={ref}
      width={sprite.w}
      height={sprite.h}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`porch-sprite ${className}`.trim()}
      style={style}
    />
  )
}

export function PixelTrophy({ className = '', scale = 'scene' }: { className?: string; scale?: number | 'scene' }) {
  return <PixelIconCanvas sprite={trophySprite} scale={scale} className={className} />
}

export function PixelMedal({
  medal,
  label,
  className = '',
  scale = 'scene',
}: {
  medal: 1 | 2 | 3
  label: string
  className?: string
  scale?: number | 'scene'
}) {
  return <PixelIconCanvas sprite={medalSprites[medal]} scale={scale} label={label} className={className} />
}
