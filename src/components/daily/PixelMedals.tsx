import { useEffect, useRef } from 'react'
import { P } from '../../scene/palette'
import { defineSprite, drawSprite, type Sprite } from '../../scene/sprite'

const trophySprite = defineSprite([
  '..aaaaaaa..',
  'aaabbbbhaaa',
  'a.abbbhba.a',
  'aaabbbbsaaa',
  '..abbbbsa..',
  '...aasaa...',
  '....asa....',
  '...aabaa...',
  '..abbbbsa..',
  '..aaaaaaa..',
], {
  a: P.wood[0],
  b: P.sun[3],
  h: P.sun[4],
  s: P.sun[2],
})

function makeMedalSprite(
  body: string,
  highlight: string,
  shadow: string,
  ribbon: string,
  ribbonShadow: string,
): Sprite {
  return defineSprite([
    '.arwcwra.',
    '.arwcwra.',
    '..arcra..',
    '..aaaaa..',
    '.abbbbha.',
    'abbbbhbba',
    'abbbhbbba',
    'asbbbbbba',
    '.asssssa.',
    '..aaaaa..',
  ], {
    a: P.wood[0],
    b: body,
    h: highlight,
    s: shadow,
    r: ribbon,
    c: ribbonShadow,
    w: P.paper[4],
  })
}

const medalSprites: Record<1 | 2 | 3, Sprite> = {
  1: makeMedalSprite(P.sun[3], P.sun[4], P.sun[2], P.flame[1], P.flame[0]),
  2: makeMedalSprite(P.stone[4], P.paper[4], P.stone[3], P.sea[2], P.sea[1]),
  3: makeMedalSprite(P.wood[3], P.wood[4], P.wood[2], P.sky[2], P.sky[1]),
}

function PixelIconCanvas({
  sprite,
  scale = 2,
  className = '',
  label,
}: {
  sprite: Sprite
  scale?: number
  className?: string
  label?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, sprite.w, sprite.h)
    drawSprite(ctx, sprite, 0, 0)
  }, [sprite])

  return (
    <canvas
      ref={ref}
      width={sprite.w}
      height={sprite.h}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`porch-sprite ${className}`.trim()}
      style={{ width: sprite.w * scale, height: sprite.h * scale }}
    />
  )
}

export function PixelTrophy({ className = '', scale = 2 }: { className?: string; scale?: number }) {
  return <PixelIconCanvas sprite={trophySprite} scale={scale} className={className} />
}

export function PixelMedal({
  medal,
  label,
  className = '',
  scale = 2,
}: {
  medal: 1 | 2 | 3
  label: string
  className?: string
  scale?: number
}) {
  return <PixelIconCanvas sprite={medalSprites[medal]} scale={scale} label={label} className={className} />
}
