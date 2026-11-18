import { useEffect, useRef } from 'react'
import { BOOSTER_HEIGHT, BOOSTER_WIDTH, drawBooster } from '../../scene/porch/booster'
import { useSceneClock } from '../../scene/useSceneClock'

export interface BoosterSpriteProps {
  scale?: number
  phaseOffset?: number
  className?: string
}

export function BoosterSprite({ scale = 3, phaseOffset = 0, className = '' }: BoosterSpriteProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const frame = useSceneClock(8)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, BOOSTER_WIDTH, BOOSTER_HEIGHT)
    drawBooster(ctx, 0, 0, frame + phaseOffset)
  }, [frame, phaseOffset])

  return (
    <canvas
      ref={ref}
      width={BOOSTER_WIDTH}
      height={BOOSTER_HEIGHT}
      aria-hidden="true"
      className={className}
      style={{
        width: BOOSTER_WIDTH * scale,
        height: BOOSTER_HEIGHT * scale,
        imageRendering: 'pixelated',
      }}
    />
  )
}
