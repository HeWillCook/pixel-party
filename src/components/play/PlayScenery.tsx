import { useEffect, useRef } from 'react'
import { P } from '../../scene/palette'

export function PlayScenery() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const draw = () => {
      const bounds = canvas.getBoundingClientRect()
      const pixel = 2
      canvas.width = Math.ceil(bounds.width / pixel)
      canvas.height = Math.ceil(bounds.height / pixel)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.imageSmoothingEnabled = false
      const width = canvas.width
      const height = canvas.height
      const fill = (color: string, x: number, y: number, w: number, h: number) => {
        ctx.fillStyle = color
        ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
      }
      const horizon = Math.round(height * 0.54)
      const shore = Math.round(height * 0.78)
      const floor = Math.round(height * 0.91)
      P.sky.forEach((color, index) => fill(color, 0, horizon * index / P.sky.length, width, horizon / P.sky.length + 1))
      fill(P.sun[3], width * 0.79, horizon - 26, 40, 26)
      fill(P.sun[4], width * 0.80, horizon - 22, 32, 22)
      fill(P.sea[1], 0, horizon, width, shore - horizon)
      for (let row = 0; row < 12; row++) {
        const y = horizon + 4 + row * (shore - horizon - 8) / 12
        const spread = 6 + row * 2
        for (let column = 0; column < 4; column++) {
          const x = width * 0.83 - spread + ((row * 17 + column * 11) % Math.max(1, spread * 2))
          fill(row % 3 ? P.sun[2] : P.sun[3], x, y, 3 + (row + column) % 5, 1)
        }
        fill(P.sea[2], (row * 73) % width, y + 3, 8 + row % 7, 1)
      }
      fill(P.paper[2], 0, shore, width, floor - shore)
      fill(P.sea[4], 0, shore, width, 2)
      for (let x = 0; x < width; x += 23) fill(P.paper[4], x, shore + (x % 3), 12, 1)
      fill(P.wood[1], 0, floor - 13, width, 4)
      fill(P.wood[3], 0, floor - 13, width, 1)
      for (let x = 12; x < width; x += 48) fill(P.wood[1], x, floor - 9, 3, 9)
      fill(P.wood[2], 0, floor, width, height - floor)
      for (let y = floor + 9; y < height; y += 14) fill(P.wood[1], 0, y, width, 1)
    }
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    draw()
    return () => observer.disconnect()
  }, [])
  return <canvas className="play-scenery" ref={ref} aria-hidden="true" />
}
