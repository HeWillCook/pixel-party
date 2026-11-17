import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { boardCellSize } from '../../game/board-size'
import { EMPTY_CANVAS, PALETTE } from '../../game/config'
import { strokeCells } from '../../game/stroke'

export interface PixelCanvasProps {
  width: number
  height: number
  cells: Uint8Array
  activeColor: number
  canDraw: boolean
  word?: string
  cooldownRemainingMs?: number
  availWidth?: number
  availHeight?: number
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
  availWidth = 600,
  availHeight = 600,
  onPlace,
  onHoverCell,
  children,
}: PixelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const isPointerDownRef = useRef(false)
  const lastDragCellRef = useRef<{ x: number; y: number } | null>(null)
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null)

  const cellSize = boardCellSize({
    availWidth: Math.max(0, availWidth - 20),
    availHeight: Math.max(0, availHeight - 20),
    cols: width,
    rows: height,
  })
  const cssWidth = cellSize * width
  const cssHeight = cellSize * height

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
        ctx.fillStyle =
          colorIndex === 0
            ? EMPTY_CANVAS[(x + y) % 2]
            : (PALETTE[colorIndex] ?? EMPTY_CANVAS[(x + y) % 2])
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
    if (!canDraw || !isPointerDownRef.current || !cell) return
    const prev = lastDragCellRef.current
    if (prev && prev.x === cell.x && prev.y === cell.y) return
    lastDragCellRef.current = cell
    for (const point of prev ? strokeCells(prev, cell).slice(1) : [cell]) {
      onPlace(point.x, point.y, activeColor)
    }
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

  return (
    <div
      data-testid="pixel-canvas-frame"
      className="pp-frame relative mx-auto inline-flex items-center justify-center"
    >
      <div
        className="relative overflow-hidden [container-type:inline-size]"
        style={{ width: `${cssWidth}px`, height: `${cssHeight}px` }}
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
          className={`pixelated block touch-none select-none ${
            canDraw ? 'cursor-crosshair' : 'cursor-not-allowed'
          }`}
          style={{
            width: `${cssWidth}px`,
            height: `${cssHeight}px`,
            imageRendering: 'pixelated',
          }}
        />

        {/* Local hover cell preview */}
        {hoverCell && canDraw && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute box-border border-2 border-[var(--sunset-1)] shadow-[0_0_0_1px_rgba(0,0,0,0.85)] transition-transform duration-75"
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
                className="pp-chip absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 text-xs"
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
