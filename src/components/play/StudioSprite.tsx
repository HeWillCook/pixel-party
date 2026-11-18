import { useEffect, useRef } from 'react'
import { drawSprite, type Sprite } from '../../scene/sprite'

export function StudioSprite({
  sprite,
  scale = 3,
  className = '',
  flipX = false,
}: {
  sprite: Sprite
  scale?: number
  className?: string
  flipX?: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, sprite.w, sprite.h)
    drawSprite(ctx, sprite, 0, 0, { flipX })
  }, [sprite, flipX])

  return (
    <canvas
      ref={ref}
      className={`porch-sprite ${className}`.trim()}
      width={sprite.w}
      height={sprite.h}
      style={{ width: sprite.w * scale, height: sprite.h * scale }}
      aria-hidden="true"
    />
  )
}
