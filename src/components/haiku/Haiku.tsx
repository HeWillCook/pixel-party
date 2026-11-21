import { useEffect, useRef, type ReactNode } from 'react'
import { DETAIL } from '../../scene/detail'
import { HAIKU_HEIGHT, HAIKU_WIDTH, paintHaiku, type HaikuState } from '../../scene/porch/haikuArt'
import { useSceneClock } from '../../scene/useSceneClock'
import './haiku.css'

export type { HaikuState }
export { HAIKU_HEIGHT, HAIKU_WIDTH, paintHaiku }

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
  const effectiveBubble =
    bubble === undefined && state === 'thinking' ? '…' : bubble

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.setTransform(DETAIL, 0, 0, DETAIL, 0, 0)
    ctx.clearRect(0, 0, HAIKU_WIDTH, HAIKU_HEIGHT)
    paintHaiku(state, frame, showBeret).flush(ctx)
  }, [state, frame, showBeret])

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
        width={HAIKU_WIDTH * DETAIL}
        height={HAIKU_HEIGHT * DETAIL}
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
