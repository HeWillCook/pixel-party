import { useEffect, useRef, type ReactNode } from 'react'
import { P } from '../../scene/palette'
import { useSceneClock } from '../../scene/useSceneClock'
import './haiku.css'

export type HaikuState =
  | 'idle'
  | 'thinking'
  | 'guess'
  | 'correct'
  | 'resting'
  | 'sleeping'

export interface HaikuProps {
  state: HaikuState
  bubble?: ReactNode | boolean
  scale?: number | 'scene'
  beret?: boolean
  paused?: boolean
  stackBubble?: boolean
  className?: string
  'data-testid'?: string
}

export const HAIKU_WIDTH = 28
export const HAIKU_HEIGHT = 26

function px(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

function drawBeret(ctx: CanvasRenderingContext2D, x: number, y: number, tilt = 0) {
  px(ctx, x + 2, y - 1, 2, 1, P.wood[0])
  px(ctx, x, y, 8, 1, P.wood[0])
  px(ctx, x - 1, y + 1, 10, 3, P.wood[0])
  px(ctx, x, y + 1, 8, 2, P.flame[1])
  px(ctx, x + 1, y + 1, 3, 1, P.flame[2])
  px(ctx, x, y + 3, 8, 1, P.flame[0])
  if (tilt !== 0) {
    px(ctx, x + 7, y + 2 + tilt, 2, 1, P.wood[0])
  }
}

function drawTinyZ(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  px(ctx, x, y, 4, 1, color)
  px(ctx, x + 2, y + 1, 1, 1, color)
  px(ctx, x + 1, y + 2, 1, 1, color)
  px(ctx, x, y + 3, 4, 1, color)
}

function drawSittingHaiku(
  ctx: CanvasRenderingContext2D,
  state: 'idle' | 'thinking' | 'guess' | 'correct',
  frame: number,
  beret: boolean,
) {
  const step = frame % 24
  const leanX = state === 'guess' ? 2 : 0
  const jumpY =
    state === 'correct'
      ? frame === 0
        ? -3
        : -[0, 2, 4, 3, 1, 2][frame % 6]
      : 0
  const baseX = 6 + leanX
  const baseY = 7 + jumpY

  // Ground shadow stays anchored on floor
  px(ctx, baseX + 2, 24, 12, 1, P.wood[0])

  // Ears (perk slightly during thinking)
  const earLift = state === 'thinking' ? -1 : 0
  px(ctx, baseX + 1, baseY + 1 + earLift, 3, 3, P.wood[0])
  px(ctx, baseX + 2, baseY + 2 + earLift, 1, 2, P.fur[3])
  px(ctx, baseX + 10, baseY + 1 + earLift, 3, 3, P.wood[0])
  px(ctx, baseX + 11, baseY + 2 + earLift, 1, 2, P.fur[3])

  // Expressive tail behind body (2px flick in idle, rapid wag on guess/correct)
  const tailFlick =
    state === 'guess' || state === 'correct'
      ? (frame % 4 < 2 ? -2 : 0)
      : step >= 17 && step <= 20
        ? -2
        : step === 16 || step === 21
          ? -1
          : 0
  px(ctx, baseX + 13, baseY + 14, 3, 2, P.wood[0])
  px(ctx, baseX + 13, baseY + 14, 2, 1, P.fur[3])
  px(ctx, baseX + 15, baseY + 11 + tailFlick, 3, 4, P.wood[0])
  px(ctx, baseX + 16, baseY + 11 + tailFlick, 1, 3, P.fur[3])
  px(ctx, baseX + 16, baseY + 9 + tailFlick, 3, 3, P.wood[0])
  px(ctx, baseX + 17, baseY + 10 + tailFlick, 1, 1, P.fur[4])

  // Head outline & fur
  px(ctx, baseX + 1, baseY + 3, 12, 8, P.wood[0])
  px(ctx, baseX, baseY + 5, 14, 5, P.wood[0])
  px(ctx, baseX + 2, baseY + 4, 10, 6, P.fur[4])
  px(ctx, baseX + 1, baseY + 5, 12, 4, P.fur[4])
  px(ctx, baseX + 3, baseY + 4, 8, 2, P.fur[3])
  px(ctx, baseX + 2, baseY + 9, 10, 1, P.fur[3])

  // Beret (flies higher during celebration jump)
  if (beret) {
    const beretFly = state === 'correct' ? (jumpY < -1 ? -4 : -2) : 0
    drawBeret(ctx, baseX + 3, baseY + beretFly, state === 'correct' ? -1 : 0)
  }

  // Face / eyes
  const blinking = state === 'idle' && (step === 10 || step === 11 || step === 12)
  if (state === 'correct') {
    // Happy ^ ^ eyes
    px(ctx, baseX + 3, baseY + 6, 3, 1, P.fur[0])
    px(ctx, baseX + 4, baseY + 5, 1, 1, P.fur[0])
    px(ctx, baseX + 8, baseY + 6, 3, 1, P.fur[0])
    px(ctx, baseX + 9, baseY + 5, 1, 1, P.fur[0])
  } else if (blinking) {
    px(ctx, baseX + 3, baseY + 7, 3, 1, P.fur[0])
    px(ctx, baseX + 9, baseY + 7, 3, 1, P.fur[0])
  } else {
    const lookUp = state === 'thinking' ? -1 : 0
    px(ctx, baseX + 3, baseY + 6, 2, 2, P.sun[3])
    px(ctx, baseX + 9, baseY + 6, 2, 2, P.sun[3])
    px(ctx, baseX + 4, baseY + 6 + lookUp, 1, 1, P.fur[0])
    px(ctx, baseX + 10, baseY + 6 + lookUp, 1, 1, P.fur[0])
    if (state === 'guess') {
      px(ctx, baseX + 3, baseY + 6, 1, 1, P.paper[4])
      px(ctx, baseX + 9, baseY + 6, 1, 1, P.paper[4])
    }
  }

  // Nose & mouth
  px(ctx, baseX + 6, baseY + 7, 2, 1, P.flame[1])
  if (state === 'guess' || state === 'correct') {
    px(ctx, baseX + 6, baseY + 8, 2, 2, P.flame[0])
  } else {
    px(ctx, baseX + 5, baseY + 8, 4, 1, P.fur[2])
  }

  // Torso & white painter smock
  px(ctx, baseX + 2, baseY + 11, 10, 6, P.wood[0])
  px(ctx, baseX + 1, baseY + 12, 12, 4, P.wood[0])
  px(ctx, baseX + 3, baseY + 11, 8, 5, P.paper[4])
  px(ctx, baseX + 2, baseY + 12, 2, 3, P.fur[3])
  px(ctx, baseX + 10, baseY + 12, 2, 3, P.fur[3])
  px(ctx, baseX + 5, baseY + 13, 4, 3, P.paper[3])

  // Paws
  if (state === 'thinking') {
    // Left paw resting, right arm bent up to chin in thoughtful pose
    px(ctx, baseX + 3, baseY + 16, 3, 2, P.wood[0])
    px(ctx, baseX + 4, baseY + 16, 1, 1, P.fur[4])
    px(ctx, baseX + 10, baseY + 11, 3, 4, P.wood[0])
    px(ctx, baseX + 11, baseY + 12, 1, 3, P.fur[3])
    px(ctx, baseX + 8, baseY + 9, 3, 3, P.wood[0])
    px(ctx, baseX + 9, baseY + 10, 1, 1, P.fur[4])
  } else if (state === 'correct') {
    // Both paws cheering up wide
    px(ctx, baseX - 1, baseY + 9, 3, 4, P.wood[0])
    px(ctx, baseX, baseY + 10, 1, 2, P.fur[4])
    px(ctx, baseX + 12, baseY + 9, 3, 4, P.wood[0])
    px(ctx, baseX + 13, baseY + 10, 1, 2, P.fur[4])
  } else {
    px(ctx, baseX + 3, baseY + 16, 3, 2, P.wood[0])
    px(ctx, baseX + 4, baseY + 16, 1, 1, P.fur[4])
    px(ctx, baseX + 8, baseY + 16, 3, 2, P.wood[0])
    px(ctx, baseX + 9, baseY + 16, 1, 1, P.fur[4])
  }

  // Confetti sparkles when Haiku celebrates
  if (state === 'correct') {
    const confetti = [
      { x: 2, y: 3, color: P.sun[4] },
      { x: 24, y: 4, color: P.flame[1] },
      { x: 4, y: 12, color: P.sea[3] },
      { x: 23, y: 11, color: P.sky[4] },
      { x: 14, y: 1, color: P.sun[3] },
    ]
    confetti.forEach((bit, idx) => {
      const drift = frame === 0 ? 0 : ((Math.floor(frame / 2) + idx) % 3) - 1
      px(ctx, bit.x, Math.max(0, bit.y + drift), 2, 2, bit.color)
    })
  }
}

function drawSleepingHaiku(
  ctx: CanvasRenderingContext2D,
  frame: number,
  beret: boolean,
) {
  const breath = frame === 0 ? 0 : Math.floor(frame / 8) % 2
  const baseX = 4
  const baseY = 14 + breath

  // Curled cat silhouette
  px(ctx, baseX + 1, baseY + 9, 18, 2, P.wood[0])
  px(ctx, baseX + 2, baseY + 2, 16, 8, P.wood[0])
  px(ctx, baseX + 1, baseY + 4, 18, 5, P.wood[0])

  // Body fur + lighter curled belly/tail
  px(ctx, baseX + 3, baseY + 3, 14, 6, P.fur[3])
  px(ctx, baseX + 2, baseY + 5, 16, 4, P.fur[3])
  px(ctx, baseX + 8, baseY + 6, 8, 3, P.fur[4])
  px(ctx, baseX + 11, baseY + 7, 6, 2, P.fur[2])

  // Tucked ears on left head
  px(ctx, baseX + 2, baseY, 3, 3, P.wood[0])
  px(ctx, baseX + 3, baseY + 1, 1, 2, P.fur[2])
  px(ctx, baseX + 6, baseY, 3, 3, P.wood[0])
  px(ctx, baseX + 7, baseY + 1, 1, 2, P.fur[2])

  if (beret) {
    drawBeret(ctx, baseX + 2, baseY - 2)
  }

  // Closed peaceful eye + nose
  px(ctx, baseX + 3, baseY + 5, 3, 1, P.fur[0])
  px(ctx, baseX + 7, baseY + 6, 1, 1, P.flame[1])

  // Rising & fading pixel "z" glyphs
  if (frame === 0) {
    drawTinyZ(ctx, 18, 8, P.paper[4])
    drawTinyZ(ctx, 22, 3, P.paper[2])
  } else {
    for (let i = 0; i < 2; i++) {
      const cycle = (Math.floor(frame / 3) + i * 7) % 14
      const zx = 17 + i * 4 + (cycle > 7 ? 1 : 0)
      const zy = 11 - cycle
      if (zy < 0 || zy > 12) continue
      const color =
        cycle < 5 ? P.paper[4] : cycle < 10 ? P.paper[3] : P.paper[1]
      drawTinyZ(ctx, zx, zy, color)
    }
  }
}

export function Haiku({
  state,
  bubble,
  scale = 2,
  beret,
  paused = false,
  stackBubble = false,
  className = '',
  'data-testid': testId = 'haiku',
}: HaikuProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const frame = useSceneClock(10, paused)
  const showBeret = beret ?? state !== 'sleeping'
  const isSleeping = state === 'resting' || state === 'sleeping'
  const effectiveBubble =
    bubble === undefined && state === 'thinking' ? '…' : bubble

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, HAIKU_WIDTH, HAIKU_HEIGHT)
    if (isSleeping) {
      drawSleepingHaiku(ctx, frame, showBeret)
    } else {
      drawSittingHaiku(ctx, state, frame, showBeret)
    }
  }, [state, frame, isSleeping, showBeret])

  return (
    <div
      data-testid={testId}
      data-haiku-state={state}
      className={[
        'haiku',
        stackBubble ? 'haiku--stack' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <canvas
        ref={ref}
        width={HAIKU_WIDTH}
        height={HAIKU_HEIGHT}
        className="haiku__canvas"
        style={
          scale === 'scene'
            ? { width: `calc(var(--px, 3px) * ${HAIKU_WIDTH})`, height: `calc(var(--px, 3px) * ${HAIKU_HEIGHT})` }
            : { width: HAIKU_WIDTH * scale, height: HAIKU_HEIGHT * scale }
        }
        aria-hidden="true"
      />
      {effectiveBubble !== undefined &&
        effectiveBubble !== null &&
        effectiveBubble !== false && (
          <div
            data-testid="haiku-bubble"
            className={`haiku__bubble ${state === 'guess' ? 'haiku__bubble--pop' : ''}`.trim()}
          >
            {effectiveBubble}
          </div>
        )}
    </div>
  )
}
