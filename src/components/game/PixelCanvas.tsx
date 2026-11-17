import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { boardCellSize } from '../../game/board-size'
import { canvasIntent } from '../../game/canvas-intent'
import { EMPTY_CANVAS, PALETTE } from '../../game/config'
import type { Tool } from '../../game/tools'

export interface PixelCanvasProps {
  width: number
  height: number
  cells: Uint8Array
  activeColor: number
  tool?: Tool
  canDraw: boolean
  word?: string
  cooldownRemainingMs?: number
  availWidth?: number
  availHeight?: number
  onPlace: (x: number, y: number, color: number) => void
  onFill?: (x: number, y: number) => void
  onPick?: (x: number, y: number) => void
  onStrokeStart?: () => void
  onStrokeEnd?: () => void
  onHoverCell?: (cell: { x: number; y: number } | null) => void
  children?: ReactNode
}

export function PixelCanvas({
  width,
  height,
  cells,
  activeColor,
  tool = 'paint',
  canDraw,
  word,
  cooldownRemainingMs = 0,
  availWidth = 600,
  availHeight = 600,
  onPlace,
  onFill,
  onPick,
  onStrokeStart,
  onStrokeEnd,
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
    const cell = getCellFromEvent(e.clientX, e.clientY)
    if (!cell) return
    setHoverCell(cell)
    onHoverCell?.(cell)
    const intent = canvasIntent({
      tool,
      phase: 'down',
      cell,
      prevCell: null,
      activeColor,
      canDraw,
    })
    if (intent.type === 'none') {
      // Preserve click-to-sign-in / cooldown feedback for paint & erase when unable to draw
      if (!canDraw && (tool === 'paint' || tool === 'erase')) {
        onPlace(cell.x, cell.y, tool === 'erase' ? 0 : activeColor)
      }
      return
    }
    if (intent.type === 'fill') {
      onFill?.(intent.x, intent.y)
      return
    }
    if (intent.type === 'pick') {
      onPick?.(intent.x, intent.y)
      return
    }
    isPointerDownRef.current = true
    lastDragCellRef.current = cell
    onStrokeStart?.()
    for (const point of intent.points) {
      onPlace(point.x, point.y, intent.color)
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cell = getCellFromEvent(e.clientX, e.clientY)
    setHoverCell(cell)
    onHoverCell?.(cell)
    if (!isPointerDownRef.current || !cell) return
    const intent = canvasIntent({
      tool,
      phase: 'move',
      cell,
      prevCell: lastDragCellRef.current,
      activeColor,
      canDraw,
    })
    if (intent.type !== 'place') return
    lastDragCellRef.current = cell
    for (const point of intent.points) {
      onPlace(point.x, point.y, intent.color)
    }
  }

  const endStroke = () => {
    if (!isPointerDownRef.current) return
    isPointerDownRef.current = false
    lastDragCellRef.current = null
    onStrokeEnd?.()
  }

  const handlePointerLeave = () => {
    endStroke()
    setHoverCell(null)
    onHoverCell?.(null)
  }

  const hoverBackground = hoverCell
    ? tool === 'erase'
      ? EMPTY_CANVAS[(hoverCell.x + hoverCell.y) % 2]
      : tool === 'pick'
        ? 'transparent'
        : PALETTE[activeColor]
    : undefined

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
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
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
              backgroundColor: hoverBackground,
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
