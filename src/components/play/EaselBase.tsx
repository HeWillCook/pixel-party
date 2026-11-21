import { useEffect, useRef } from 'react'
import { DETAIL } from '../../scene/detail'
import { EASEL_BASE_W, easelBaseHeight, paintEaselBase } from '../../scene/porch/easelArt'
import { useSceneClock } from '../../scene/useSceneClock'

/**
 * The legs, crossbar and bolted thrusters a hovering easel stands on, with their shadows: drawn from the tray's
 * underside down. `legs` is the leg length in scene units. The canvas holds 2x detail; its CSS box is the scene footprint.
 */
export function EaselBase({ legs, scale = 'scene', className = '' }: { legs: number; scale?: number | 'scene'; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const frame = useSceneClock(12)
  const height = easelBaseHeight(legs)

  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, EASEL_BASE_W * DETAIL, height * DETAIL)
    ctx.setTransform(DETAIL, 0, 0, DETAIL, 0, 0)
    ctx.imageSmoothingEnabled = false
    paintEaselBase(ctx, legs, frame)
  }, [frame, legs, height])

  const size = scale === 'scene'
    ? { width: `calc(var(--px) * ${EASEL_BASE_W})`, height: `calc(var(--px) * ${height})` }
    : { width: EASEL_BASE_W * scale, height: height * scale }
  return (
    <canvas
      ref={ref}
      width={EASEL_BASE_W * DETAIL}
      height={height * DETAIL}
      aria-hidden="true"
      className={`porch-sprite ${className}`.trim()}
      style={{ ...size, imageRendering: 'pixelated' }}
    />
  )
}
