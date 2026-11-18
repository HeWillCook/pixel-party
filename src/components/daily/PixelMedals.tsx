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
  numeralRows: [string, string, string, string, string],
  body: string,
  highlight: string,
  shadow: string,
  ribbon: string,
  ribbonShadow: string,
): Sprite {
  const [n0, n1, n2, n3, n4] = numeralRows
  return defineSprite([
    '..arwcwra..',
    '...arcra...',
    '..aaaaaaa..',
    '.abbbbbhha.',
    `abb${n0}bha`,
    `abb${n1}bba`,
    `asb${n2}bba`,
    `asb${n3}bba`,
    `asb${n4}bba`,
    '.asssssssa.',
    '..aaaaaaa..',
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
  1: makeMedalSprite(['.a.bb', 'aa.bb', '.a.bb', '.a.bb', 'aaabb'], P.sun[3], P.sun[4], P.sun[2], P.flame[1], P.flame[0]),
  2: makeMedalSprite(['aaabb', '..abb', 'aaabb', 'a..bb', 'aaabb'], P.sea[4], P.paper[4], P.sea[3], P.sea[2], P.sea[1]),
  3: makeMedalSprite(['aaabb', '..abb', '.aabb', '..abb', 'aaabb'], P.wood[3], P.wood[4], P.wood[2], P.sky[2], P.sky[1]),
}

function PixelIconCanvas({
  sprite,
  scale = 'scene',
  className = '',
  label,
}: {
  sprite: Sprite
  scale?: number | 'scene'
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

  const style =
    scale === 'scene'
      ? { width: `calc(var(--px, 3px) * ${sprite.w})`, height: `calc(var(--px, 3px) * ${sprite.h})` }
      : { width: sprite.w * scale, height: sprite.h * scale }

  return (
    <canvas
      ref={ref}
      width={sprite.w}
      height={sprite.h}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`porch-sprite ${className}`.trim()}
      style={style}
    />
  )
}

export function PixelTrophy({ className = '', scale = 'scene' }: { className?: string; scale?: number | 'scene' }) {
  return <PixelIconCanvas sprite={trophySprite} scale={scale} className={className} />
}

export function PixelMedal({
  medal,
  label,
  className = '',
  scale = 'scene',
}: {
  medal: 1 | 2 | 3
  label: string
  className?: string
  scale?: number | 'scene'
}) {
  return <PixelIconCanvas sprite={medalSprites[medal]} scale={scale} label={label} className={className} />
}
