import { useEffect, useRef, useState } from 'react'
import { P } from '../../scene/palette'
import { drawSun } from '../../scene/procedural'

export function GalleryBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0, pixel: 3 })

  useEffect(() => {
    const canvas = ref.current
    const container = canvas?.parentElement
    if (!canvas || !container) return
    const measure = () => {
      const bounds = container.getBoundingClientRect()
      const pixel = Math.max(2, Math.round(parseFloat(getComputedStyle(canvas).getPropertyValue('--px')) || 3))
      const width = Math.max(1, Math.ceil(bounds.width / pixel))
      const height = Math.max(1, Math.ceil(bounds.height / pixel))
      setSize((prev) =>
        prev.width === width && prev.height === height && prev.pixel === pixel
          ? prev
          : { width, height, pixel },
      )
    }
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    measure()
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || size.width <= 0 || size.height <= 0) return
    const { width, height, pixel } = size
    canvas.width = width
    canvas.height = height
    canvas.style.width = `${width * pixel}px`
    canvas.style.height = `${height * pixel}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    const rect = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
    }

    const showWindow = width >= 250
    const ceilingY = 4
    const floorBandH = width < 220 ? 32 : 36
    const dadoY = Math.max(ceilingY + 36, height - floorBandH)
    const floorY = Math.max(dadoY + 14, height - Math.round(floorBandH * 0.48))

    // Slim picture-rail trim beneath navigation bar
    rect(0, 0, width, ceilingY, P.wood[0])
    rect(0, 1, width, 2, P.wood[1])
    rect(0, ceilingY - 1, width, 1, P.wood[3])

    // Continuous wood-panelled gallery wall
    rect(0, ceilingY, width, dadoY - ceilingY, P.wood[2])
    const plankW = 14
    const wallH = dadoY - ceilingY
    for (let x = 0, col = 0; x < width; x += plankW, col++) {
      rect(x, ceilingY, 1, wallH, P.wood[1])
      rect(x + 1, ceilingY, 1, wallH, P.wood[3])
      for (let bandTop = ceilingY + 12; bandTop < dadoY - 24; bandTop += 64) {
        const hash = (((col + 1) * 2654435761 + bandTop * 2246822519) >>> 0)
        const grainY = bandTop + (hash % 32)
        const secondOffset = 12 + ((hash >>> 8) % 10)
        rect(x + 5, grainY, 1, 9, P.wood[1])
        rect(x + 9, grainY + secondOffset, 1, 7, P.wood[3])
      }
    }

    // Bottom wainscoting + dado rail + baseboard
    rect(0, dadoY, width, floorY - dadoY, P.wood[1])
    for (let x = 2; x < width; x += 8) {
      rect(x, dadoY + 4, 4, floorY - dadoY - 7, P.wood[2])
      rect(x + 3, dadoY + 4, 1, floorY - dadoY - 7, P.wood[3])
    }
    rect(0, dadoY, width, 3, P.wood[0])
    rect(0, dadoY + 1, width, 1, P.wood[4])
    rect(0, floorY - 3, width, 3, P.wood[0])
    rect(0, floorY - 2, width, 1, P.wood[3])

    // Warm wooden floorboards
    rect(0, floorY, width, height - floorY, P.wood[2])
    for (let y = floorY; y < height; y += 7) {
      rect(0, y, width, 1, P.wood[0])
      rect(0, y + 1, width, 1, P.wood[3])
      for (let x = (y * 11) % 39; x < width; x += 48) {
        rect(x, y + 2, 1, 5, P.wood[1])
      }
    }

    if (!showWindow) return

    // Sunset window anchored cleanly inside the visible right wall
    const winW = 58
    const winH = 48
    const win = {
      x: Math.max(8, width - winW - 12),
      y: ceilingY + 12,
      w: winW,
      h: winH,
    }

    // Sunlight pool falling across the wooden floorboards from the right window
    for (let y = floorY + 2; y < height - 1; y++) {
      const dy = y - (floorY + 2)
      const left = Math.max(4, win.x - 12 - dy)
      const right = Math.min(width - 4, win.x + win.w - 4 - Math.floor(dy * 0.5))
      for (let x = left; x <= right; x++) {
        if ((x & 1) === 0 && (y & 1) === 0) {
          rect(x, y, 1, 1, P.sun[3])
        } else if ((x + y) % 2 === 0) {
          rect(x, y, 1, 1, P.wood[4])
        }
      }
    }

    // Window frame + sunset ocean vista
    rect(win.x - 3, win.y - 3, win.w + 6, win.h + 7, P.wood[0])
    rect(win.x - 2, win.y - 2, win.w + 4, win.h + 4, P.wood[3])
    rect(win.x - 1, win.y - 1, win.w + 2, win.h + 2, P.wood[0])
    // Sunlit inner left jamb highlight (sun is low & right)
    rect(win.x - 2, win.y - 1, 1, win.h + 2, P.wood[4])

    ctx.save()
    ctx.beginPath()
    ctx.rect(win.x, win.y, win.w, win.h)
    ctx.clip()
    const horizon = win.y + Math.round(win.h * 0.56)
    const shore = win.y + Math.round(win.h * 0.82)
    for (let row = 0; row < horizon - win.y; row++) {
      const band = Math.min(P.sky.length - 1, Math.floor((row / Math.max(1, horizon - win.y)) * P.sky.length))
      rect(win.x, win.y + row, win.w, 1, P.sky[band])
    }
    drawSun(ctx, win.x + Math.round(win.w * 0.68), horizon + 1, 11, horizon)
    rect(win.x, horizon, win.w, shore - horizon, P.sea[1])
    for (let sy = horizon + 2; sy < shore; sy += 3) {
      const sx = win.x + Math.round(win.w * 0.55) + ((sy * 3) % 8) - 4
      rect(sx, sy, 6, 1, P.sun[2])
    }
    rect(win.x, shore, win.w, win.y + win.h - shore, P.paper[3])
    rect(win.x, shore, win.w, 1, P.sea[4])
    ctx.restore()

    // Window cross mullions + sunlit sill
    const midX = win.x + Math.floor(win.w / 2) - 1
    const midY = win.y + Math.floor(win.h / 2) - 1
    rect(midX, win.y, 2, win.h, P.wood[0])
    rect(midX + 1, win.y, 1, win.h, P.wood[4])
    rect(win.x, midY, win.w, 2, P.wood[0])
    rect(win.x, midY + 1, win.w, 1, P.sun[3])
    rect(win.x - 4, win.y + win.h, win.w + 8, 4, P.wood[0])
    rect(win.x - 3, win.y + win.h + 1, win.w + 6, 2, P.sun[3])
  }, [size])

  return (
    <div className="gallery-backdrop" aria-hidden="true">
      <canvas ref={ref} className="gallery-backdrop__canvas" />
    </div>
  )
}
