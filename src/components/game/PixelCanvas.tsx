import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { PALETTE } from '../../game/config'

export interface PixelCanvasProps {
  width: number
  height: number
  cells: Uint8Array
  activeColor: number
  canDraw: boolean
  word?: string
  cooldownRemainingMs?: number
  onPlace: (x: number, y: number, color: number) => void
  onHoverCell?: (cell: { x: number; y: number } | null) => void
  children?: ReactNode
}

export function PixelCanvas({
  width,
  height,
  cells,
  activeColor,
  canDraw,
  word,
  cooldownRemainingMs = 0,
  onPlace,
  onHoverCell,
  children,
}: PixelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const isPointerDownRef = useRef(false)
  const lastDragCellRef = useRef<{ x: number; y: number } | null>(null)
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, width, height)
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width
      for (let x = 0; x < width; x++) {
        const colorIndex = cells[rowOffset + x] ?? 0
        ctx.fillStyle = PALETTE[colorIndex] ?? PALETTE[0]
        ctx.fillRect(x, y, 1, 1)
      }
    }
  }, [width, height, cells])

  const getCellFromEvent = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      const x = Math.floor(((clientX - rect.left) / rect.width) * width)
      const y = Math.floor(((clientY - rect.top) / rect.height) * height)
      if (x < 0 || x >= width || y < 0 || y >= height) return null
      return { x, y }
    },
    [width, height],
  )

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.currentTarget.setPointerCapture(e.pointerId)
    isPointerDownRef.current = true
    const cell = getCellFromEvent(e.clientX, e.clientY)
    if (cell) {
      setHoverCell(cell)
      onHoverCell?.(cell)
      lastDragCellRef.current = cell
      onPlace(cell.x, cell.y, activeColor)
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cell = getCellFromEvent(e.clientX, e.clientY)
    setHoverCell(cell)
    onHoverCell?.(cell)
    if (!isPointerDownRef.current || !cell) return
    const prev = lastDragCellRef.current
    if (prev && prev.x === cell.x && prev.y === cell.y) return
    lastDragCellRef.current = cell
    onPlace(cell.x, cell.y, activeColor)
  }

  const handlePointerUpOrCancel = () => {
    isPointerDownRef.current = false
    lastDragCellRef.current = null
  }

  const handlePointerLeave = () => {
    isPointerDownRef.current = false
    lastDragCellRef.current = null
    setHoverCell(null)
    onHoverCell?.(null)
  }

  const aspectRatio = `${width} / ${height}`

  return (
    <div
      data-testid="pixel-canvas-frame"
      className="relative mx-auto flex w-full max-w-[min(100%,440px)] items-center justify-center rounded-lg border-4 border-[#3b3166] bg-[#130f21] p-2 shadow-[0_8px_0_0_rgba(0,0,0,0.55)] sm:p-2.5"
    >
      <div
        className="relative w-full overflow-hidden rounded-sm ring-2 ring-black/80"
        style={{ aspectRatio }}
      >
        <canvas
          ref={canvasRef}
          data-testid="pixel-canvas"
          role="img"
          aria-label={`Shared ${width}×${height} pixel canvas, word: ${word ?? 'loading'}`}
          width={width}
          height={height}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUpOrCancel}
          onPointerCancel={handlePointerUpOrCancel}
          onPointerLeave={handlePointerLeave}
          className={`pixelated block h-full w-full touch-none select-none ${
            canDraw ? 'cursor-crosshair' : 'cursor-not-allowed'
          }`}
          style={{
            imageRendering: 'pixelated',
          }}
        />

        {/* Subtle pixel grid overlay */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(15, 23, 42, 0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(15, 23, 42, 0.35) 1px, transparent 1px)',
            backgroundSize: `${100 / width}% ${100 / height}%`,
          }}
        />

        {/* Local hover cell preview */}
        {hoverCell && canDraw && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute box-border border-2 border-amber-400 shadow-[0_0_0_1px_rgba(0,0,0,0.85)] transition-transform duration-75"
            style={{
              left: `${(hoverCell.x / width) * 100}%`,
              top: `${(hoverCell.y / height) * 100}%`,
              width: `${100 / width}%`,
              height: `${100 / height}%`,
              backgroundColor: PALETTE[activeColor],
              opacity: 0.75,
            }}
          >
            {cooldownRemainingMs > 250 && (
              <span
                data-testid="cursor-cooldown"
                className="font-pixel absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/90 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 ring-1 ring-amber-400/50"
              >
                {(cooldownRemainingMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        )}

        {/* Remote player cursors or overlay children */}
        {children}
      </div>
    </div>
  )
}
