import { useEffect, useRef } from 'react'
import { EMPTY_CANVAS, PALETTE } from '../../game/config'

/** The painted board as a small still, e.g. on the round-over card. */
export function CanvasThumb({ width, height, cells, className = '' }: { width: number; height: number; cells: Uint8Array; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const color = cells[y * width + x] ?? 0
        ctx.fillStyle = color === 0 ? EMPTY_CANVAS[(x + y) % 2] : (PALETTE[color] ?? EMPTY_CANVAS[(x + y) % 2])
        ctx.fillRect(x, y, 1, 1)
      }
    }
  }, [width, height, cells])
  return (
    <canvas
      ref={ref}
      data-testid="overlay-canvas-preview"
      role="img"
      aria-label="The finished canvas"
      width={width}
      height={height}
      className={`pixelated ${className}`.trim()}
    />
  )
}
