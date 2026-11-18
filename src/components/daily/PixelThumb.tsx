import { useEffect, useMemo, useRef } from 'react'
import { EMPTY_CANVAS, PALETTE } from '../../game/config'
import { decodeCells } from '../../game/grid'

export function PixelThumb({
  cells,
  size,
  scale = 'scene',
  multiplier = 1,
  className = '',
}: {
  cells: string
  size?: number
  scale?: number | 'scene'
  multiplier?: number
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const pixels = useMemo(() => {
    try {
      return decodeCells(cells, 1024)
    } catch {
      return null
    }
  }, [cells])

  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx || !pixels) return
    ctx.imageSmoothingEnabled = false
    for (let index = 0; index < 1024; index++) {
      const x = index % 32
      const y = Math.floor(index / 32)
      const color = pixels[index]
      ctx.fillStyle = color === 0 ? EMPTY_CANVAS[(x + y) % 2] : (PALETTE[color] ?? EMPTY_CANVAS[(x + y) % 2])
      ctx.fillRect(x, y, 1, 1)
    }
  }, [pixels])

  const dimension =
    size !== undefined
      ? { width: size, height: size }
      : scale === 'scene'
        ? { width: `calc(var(--px, 3px) * ${32 * multiplier})`, height: `calc(var(--px, 3px) * ${32 * multiplier})` }
        : { width: 32 * scale * multiplier, height: 32 * scale * multiplier }

  if (!pixels) {
    return (
      <div
        role="img"
        aria-label="Drawing unavailable"
        className={`flex shrink-0 items-center justify-center border-2 border-border bg-muted text-center text-xs text-muted-foreground ${className}`.trim()}
        style={{ boxSizing: 'content-box', ...dimension }}
      >
        <span>Unavailable</span>
      </div>
    )
  }

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="Pixel drawing"
      width={32}
      height={32}
      className={`pixelated shrink-0 border-2 border-border bg-[#fff0cc] ${className}`.trim()}
      style={{ boxSizing: 'content-box', imageRendering: 'pixelated', ...dimension }}
    />
  )
}
