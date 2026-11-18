import { EMPTY_CANVAS, PALETTE } from '../../game/config'
import { decodeCells } from '../../game/grid'

export function PixelThumb({ cells, size, className = '' }: { cells: string; size: number; className?: string }) {
  let pixels: Uint8Array
  try {
    pixels = decodeCells(cells, 1024)
  } catch {
    return <div aria-label="Drawing unavailable" className={`shrink-0 border-2 border-border bg-muted ${className}`.trim()} style={{ width: size, height: size }} />
  }
  return (
    <svg role="img" aria-label="Pixel drawing" width={size} height={size} viewBox="0 0 32 32" shapeRendering="crispEdges" className={`pixelated shrink-0 border-2 border-border bg-white ${className}`.trim()}>
      {Array.from(pixels, (color, index) => {
        const x = index % 32
        const y = Math.floor(index / 32)
        const fill = color === 0 ? EMPTY_CANVAS[(x + y) % 2] : (PALETTE[color] ?? EMPTY_CANVAS[(x + y) % 2])
        return <rect key={index} x={x} y={y} width="1" height="1" fill={fill} />
      })}
    </svg>
  )
}
