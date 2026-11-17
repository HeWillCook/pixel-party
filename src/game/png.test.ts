import { describe, expect, it } from 'vitest'
import { MODES, PALETTE } from './config'
import { createGrid, setPixel } from './grid'
import { renderZonePng, toBase64 } from './png'

async function decodePng(png: Uint8Array) {
  const moduleName = 'node:zlib'
  const { inflateSync } = await import(/* @vite-ignore */ moduleName) as { inflateSync: (data: Uint8Array) => Uint8Array }
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const chunks: Uint8Array[] = []
  let offset = 8
  let width = 0
  let height = 0
  while (offset < png.length) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(...png.slice(offset + 4, offset + 8))
    const data = png.slice(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8)
      height = view.getUint32(offset + 12)
      expect([...data.slice(8)]).toEqual([8, 2, 0, 0, 0])
    }
    if (type === 'IDAT') chunks.push(data)
    offset += length + 12
  }
  return { width, height, pixels: inflateSync(Buffer.concat(chunks)) }
}

describe('renderZonePng', () => {
  it('renders an RGB PNG with nearest-neighbor pixels and filter 0', async () => {
    const grid = createGrid(32, 32)
    setPixel(grid, 2, 3, 4, 'player')
    const png = await renderZonePng(grid, MODES.coop.zones[0], 512)
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    const { width, height, pixels } = await decodePng(png)
    expect([width, height]).toEqual([512, 512])
    for (let row = 0; row < height; row++) expect(pixels[row * (width * 3 + 1)]).toBe(0)
    const pixel = (x: number, y: number) => [...pixels.slice(y * (width * 3 + 1) + 1 + x * 3, y * (width * 3 + 1) + 4 + x * 3)]
    expect(pixel(32, 48)).toEqual([239, 68, 68])
    expect(pixel(47, 63)).toEqual([239, 68, 68])
    expect(pixel(48, 48)).toEqual([255, 255, 255])
    expect(PALETTE[4]).toBe('#ef4444')
  })

  it('crops the blue zone before scaling', async () => {
    const grid = createGrid(64, 32)
    setPixel(grid, 0, 0, 1, 'red')
    setPixel(grid, 32, 0, 10, 'blue')
    const { width, height, pixels } = await decodePng(await renderZonePng(grid, MODES.team.zones[1], 512))
    expect([width, height]).toEqual([512, 512])
    expect([...pixels.slice(1, 4)]).toEqual([59, 130, 246])
  })

  it('uses the longer side for non-square scaling', async () => {
    const { width, height } = await decodePng(await renderZonePng(createGrid(4, 2), { id: 'all', x: 0, y: 0, w: 4, h: 2 }, 10))
    expect([width, height]).toEqual([8, 4])
  })

  it('png renders 0 and 16 as white', async () => {
    const grid = createGrid(2, 1)
    setPixel(grid, 1, 0, 16, 'player')
    const { width, pixels } = await decodePng(await renderZonePng(grid, { id: 'all', x: 0, y: 0, w: 2, h: 1 }, 4))
    const pixel = (x: number, y: number) => [...pixels.slice(y * (width * 3 + 1) + 1 + x * 3, y * (width * 3 + 1) + 4 + x * 3)]
    expect(pixel(0, 0)).toEqual([255, 255, 255])
    expect(pixel(2, 0)).toEqual([255, 255, 255])
  })
})

it('encodes bytes as base64', () => {
  expect(toBase64(new Uint8Array([0, 1, 2, 253, 254, 255]))).toBe('AAEC/f7/')
})
