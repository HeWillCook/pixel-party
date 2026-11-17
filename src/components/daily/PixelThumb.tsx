import { PALETTE } from '../../game/config'
import { decodeCells } from '../../game/grid'

export function PixelThumb({ cells, size }: { cells: string; size: number }) {
  let pixels: Uint8Array
  try {
    pixels = decodeCells(cells, 1024)
  } catch {
    return <div aria-label="Drawing unavailable" className="rounded bg-muted" style={{ width: size, height: size }} />
  }
  return (
    <svg role="img" aria-label="Pixel drawing" width={size} height={size} viewBox="0 0 32 32" shapeRendering="crispEdges" className="shrink-0 rounded bg-white">
      {Array.from(pixels, (color, index) => (
        <rect key={index} x={index % 32} y={Math.floor(index / 32)} width="1" height="1" fill={PALETTE[color] ?? PALETTE[0]} />
      ))}
    </svg>
  )
}
