import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { boardCellSize } from '../../game/board-size'
import {
  createStrokeSession,
  strokePointerDown,
  strokePointerEnd,
  strokePointerMove,
  type CanvasIntent,
  type GridPoint,
} from '../../game/canvas-intent'
import { EMPTY_CANVAS, PALETTE } from '../../game/config'
import type { Tool } from '../../game/tools'
import {
  distanceBetween,
  midpoint,
  pinchUpdate,
  toFramePoint,
  usePinchZoom,
  type PinchStart,
  type ZoomPoint,
} from '../../hooks/usePinchZoom'
import './PixelCanvas.css'

/** A second finger usually lands a few dozen ms after the first, so a touch waits this long before painting. */
const TOUCH_DEFER_MS = 120
/** Moving this far means the finger is drawing rather than starting a pinch, so the deferred stroke may commit. */
const TOUCH_MOVE_PX = 6

interface QueuedPoints {
  points: GridPoint[]
  color: number
}

/**
 * A touch stroke held back until it is clear the finger is not the first half of
 * a pinch. `stroke` replays buffered placements, `intent` runs a one-shot intent
 * (fill/pick/sign-in feedback).
 */
type PendingTouch = {
  kind: 'stroke' | 'intent'
  pointerId: number
  start: ZoomPoint
  timer: ReturnType<typeof setTimeout> | null
  queued?: QueuedPoints[]
  run?: () => void
}

interface PinchSession {
  ids: [number, number]
  start: PinchStart
}

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
  const clipRef = useRef<HTMLDivElement | null>(null)
  const strokeRef = useRef(createStrokeSession())
  /** Live touch pointers, by pointer id, in client coordinates. */
  const touchPointsRef = useRef(new Map<number, ZoomPoint>())
  const pendingRef = useRef<PendingTouch | null>(null)
  const pinchRef = useRef<PinchSession | null>(null)
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null)

  const cellSize = boardCellSize({
    availWidth: Math.max(0, availWidth - 20),
    availHeight: Math.max(0, availHeight - 20),
    cols: width,
    rows: height,
  })
  const cssWidth = cellSize * width
  const cssHeight = cellSize * height
  const { transform, transformRef, apply: applyZoom, reset: resetZoom } = usePinchZoom(cssWidth, cssHeight)
  const zoom = transform.zoom

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

  // Cell mapping reads the canvas's real on-screen rect, so it already accounts for
  // pinch zoom and for any ancestor scene transform (the porch/easel camera).
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

  // Frame-space points undo the scene camera so pinch math is in the board's own pixels.
  const toLocalPoint = useCallback(
    (clientX: number, clientY: number): ZoomPoint => {
      const clip = clipRef.current
      if (!clip) return { x: clientX, y: clientY }
      return toFramePoint(
        clip.getBoundingClientRect(),
        { width: cssWidth, height: cssHeight },
        { x: clientX, y: clientY },
      )
    },
    [cssWidth, cssHeight],
  )

  const applyIntent = (intent: CanvasIntent, cell: GridPoint) => {
    // Preserve click-to-sign-in / cooldown feedback for paint & erase when unable to draw
    if (intent.type === 'none' && !canDraw && (tool === 'paint' || tool === 'erase')) {
      onPlace(cell.x, cell.y, tool === 'erase' ? 0 : activeColor)
    } else if (intent.type === 'fill') {
      onFill?.(intent.x, intent.y)
    } else if (intent.type === 'pick') {
      onPick?.(intent.x, intent.y)
    }
  }

  const cancelPendingTouch = useCallback(() => {
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    if (pending.timer) clearTimeout(pending.timer)
  }, [])

  const commitPendingTouch = useCallback(() => {
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    if (pending.timer) clearTimeout(pending.timer)
    if (pending.kind === 'intent') {
      pending.run?.()
      return
    }
    onStrokeStart?.()
    for (const group of pending.queued ?? []) {
      for (const point of group.points) onPlace(point.x, point.y, group.color)
    }
  }, [onPlace, onStrokeStart])

  const scheduleTouchCommit = useCallback(
    (pending: PendingTouch) => {
      pending.timer = setTimeout(() => {
        if (pendingRef.current !== pending) return
        commitPendingTouch()
      }, TOUCH_DEFER_MS)
    },
    [commitPendingTouch],
  )

  const startPinch = () => {
    const entries = [...touchPointsRef.current.entries()].slice(0, 2)
    if (entries.length < 2) return
    const [first, second] = entries as [[number, ZoomPoint], [number, ZoomPoint]]
    const a = toLocalPoint(first[1].x, first[1].y)
    const b = toLocalPoint(second[1].x, second[1].y)
    pinchRef.current = {
      ids: [first[0], second[0]],
      start: {
        transform: transformRef.current,
        mid: midpoint(a, b),
        distance: distanceBetween(a, b),
      },
    }
  }

  const updatePinch = () => {
    const pinch = pinchRef.current
    if (!pinch) return
    const first = touchPointsRef.current.get(pinch.ids[0])
    const second = touchPointsRef.current.get(pinch.ids[1])
    if (!first || !second) {
      pinchRef.current = null
      return
    }
    const a = toLocalPoint(first.x, first.y)
    const b = toLocalPoint(second.x, second.y)
    applyZoom(pinchUpdate(pinch.start, midpoint(a, b), distanceBetween(a, b), cssWidth, cssHeight))
  }

  const endPinchFor = (pointerId: number) => {
    const pinch = pinchRef.current
    if (!pinch || (pinch.ids[0] !== pointerId && pinch.ids[1] !== pointerId)) return
    pinchRef.current = null
    // A third finger can keep the pinch alive after one of the first two lifts.
    startPinch()
  }

  const handleTouchPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const touches = touchPointsRef.current
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      // Ignore capture errors for synthetic pointer events
    }

    if (pinchRef.current) return

    if (touches.size >= 2) {
      // The second finger arrived first: drop what the first was about to paint.
      const pending = pendingRef.current
      if (pending) {
        cancelPendingTouch()
        if (strokePointerEnd(strokeRef.current, pending.pointerId)) onStrokeEnd?.()
      } else if (strokePointerEnd(strokeRef.current)) {
        onStrokeEnd?.()
      }
      setHoverCell(null)
      onHoverCell?.(null)
      startPinch()
      return
    }

    // A mouse or pen stroke already owns the board.
    if (strokeRef.current.activePointerId !== null) return

    const cell = getCellFromEvent(e.clientX, e.clientY)
    if (!cell) return
    const step = strokePointerDown(strokeRef.current, {
      pointerId: e.pointerId,
      cell,
      tool,
      activeColor,
      canDraw,
    })
    if (step.kind === 'ignore') return
    setHoverCell(cell)
    onHoverCell?.(cell)

    const start = { x: e.clientX, y: e.clientY }
    if (step.kind === 'intent') {
      const pending: PendingTouch = {
        kind: 'intent',
        pointerId: e.pointerId,
        start,
        timer: null,
        run: () => applyIntent(step.intent, cell),
      }
      pendingRef.current = pending
      scheduleTouchCommit(pending)
      return
    }
    const pending: PendingTouch = {
      kind: 'stroke',
      pointerId: e.pointerId,
      start,
      timer: null,
      queued: [{ points: step.points, color: step.color }],
    }
    pendingRef.current = pending
    scheduleTouchCommit(pending)
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    if (e.pointerType === 'touch') {
      handleTouchPointerDown(e)
      return
    }
    if (strokeRef.current.activePointerId !== null) return
    const cell = getCellFromEvent(e.clientX, e.clientY)
    if (!cell) return
    const step = strokePointerDown(strokeRef.current, {
      pointerId: e.pointerId,
      cell,
      tool,
      activeColor,
      canDraw,
    })
    if (step.kind === 'ignore') return
    setHoverCell(cell)
    onHoverCell?.(cell)
    if (step.kind === 'intent') {
      applyIntent(step.intent, cell)
      return
    }
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      // Ignore capture errors for synthetic pointer events
    }
    onStrokeStart?.()
    for (const point of step.points) {
      onPlace(point.x, point.y, step.color)
    }
  }

  const handlePointerMoveCore = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cell = getCellFromEvent(e.clientX, e.clientY)
    const step = strokePointerMove(strokeRef.current, {
      pointerId: e.pointerId,
      cell,
      tool,
      activeColor,
      canDraw,
    })
    if (step.kind === 'ignore') return
    setHoverCell(step.cell)
    onHoverCell?.(step.cell)
    if (step.kind !== 'move') return
    for (const point of step.points) {
      onPlace(point.x, point.y, step.color)
    }
  }

  const handleTouchPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const touches = touchPointsRef.current
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pinchRef.current) {
      updatePinch()
      return
    }

    const pending = pendingRef.current
    if (pending && pending.pointerId === e.pointerId) {
      const travelled = Math.hypot(e.clientX - pending.start.x, e.clientY - pending.start.y)
      if (travelled >= TOUCH_MOVE_PX) {
        commitPendingTouch()
      } else {
        // Still inside the "is this a pinch?" window: buffer cells so an in-order
        // stroke replays if the finger turns out to be drawing.
        const cell = getCellFromEvent(e.clientX, e.clientY)
        const step = strokePointerMove(strokeRef.current, {
          pointerId: e.pointerId,
          cell,
          tool,
          activeColor,
          canDraw,
        })
        if (step.kind === 'ignore') return
        setHoverCell(step.cell)
        onHoverCell?.(step.cell)
        if (step.kind === 'move' && pending.kind === 'stroke') {
          pending.queued?.push({ points: step.points, color: step.color })
        }
        return
      }
    }

    handlePointerMoveCore(e)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') {
      handleTouchPointerMove(e)
      return
    }
    handlePointerMoveCore(e)
  }

  const endStroke = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    if (e?.pointerType === 'touch') {
      touchPointsRef.current.delete(e.pointerId)
      const pending = pendingRef.current
      if (pending && pending.pointerId === e.pointerId) commitPendingTouch()
      endPinchFor(e.pointerId)
    }
    if (!strokePointerEnd(strokeRef.current, e?.pointerId)) return
    onStrokeEnd?.()
  }

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') {
      touchPointsRef.current.delete(e.pointerId)
      const pending = pendingRef.current
      if (pending && pending.pointerId === e.pointerId) cancelPendingTouch()
      endPinchFor(e.pointerId)
    }
    if (strokePointerEnd(strokeRef.current, e.pointerId)) onStrokeEnd?.()
  }

  const handlePointerLeave = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch' && !e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      touchPointsRef.current.delete(e.pointerId)
      endPinchFor(e.pointerId)
    }
    if (strokeRef.current.activePointerId !== null && strokeRef.current.activePointerId !== e.pointerId) {
      return
    }
    endStroke(e)
    setHoverCell(null)
    onHoverCell?.(null)
  }

  useEffect(() => {
    if (canDraw) return
    cancelPendingTouch()
    if (strokePointerEnd(strokeRef.current)) onStrokeEnd?.()
  }, [canDraw, onStrokeEnd, cancelPendingTouch])

  useEffect(
    () => () => {
      const pending = pendingRef.current
      if (pending?.timer) clearTimeout(pending.timer)
    },
    [],
  )

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
        ref={clipRef}
        data-testid="pixel-canvas-clip"
        className="relative touch-none overflow-hidden [container-type:inline-size]"
        style={
          {
            width: `${cssWidth}px`,
            height: `${cssHeight}px`,
            '--pc-zoom': `${zoom}`,
            '--pc-x': `${transform.x}px`,
            '--pc-y': `${transform.y}px`,
          } as CSSProperties
        }
      >
        {/* Zoom and pan the drawing itself. The frame clips it, so the board always fills the easel. */}
        <div
          data-testid="pixel-canvas-zoom"
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: `${cssWidth}px`,
            height: `${cssHeight}px`,
            transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${zoom})`,
          }}
        >
          <canvas
            ref={canvasRef}
            data-testid="pixel-canvas"
            data-zoom={zoom}
            role="img"
            aria-label={`Shared ${width}×${height} pixel canvas, word: ${word ?? 'loading'}`}
            width={width}
            height={height}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endStroke}
            onPointerCancel={handlePointerCancel}
            onLostPointerCapture={endStroke}
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

          {/* Local hover cell preview (inside the zoom layer so it tracks the zoomed cell) */}
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
                  className="pp-chip absolute -top-6 left-1/2 whitespace-nowrap px-1.5 py-0.5 text-xs"
                  style={{
                    // Keep the chip readable at high zoom without losing its cell anchor.
                    transform: `translateX(-50%) scale(${zoom > 0 ? 1 / zoom : 1})`,
                    transformOrigin: '50% 100%',
                  }}
                >
                  {(cooldownRemainingMs / 1000).toFixed(1)}s
                </span>
              )}
            </div>
          )}
        </div>

        {/* Remote player cursors or overlay children (frame space, so dialogs stay readable) */}
        {children}

        {zoom > 1 && (
          <button
            type="button"
            data-testid="zoom-reset"
            aria-label="Reset zoom"
            title="Reset zoom"
            onClick={resetZoom}
            className="pixel-canvas-zoom__reset pp-chip"
          >
            1×
          </button>
        )}
      </div>
    </div>
  )
}
