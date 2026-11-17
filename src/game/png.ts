import { PALETTE, type Zone } from './config'
import type { Grid } from './grid'

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})

function chunk(type: string, data: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length + 12)
  const view = new DataView(result.buffer)
  view.setUint32(0, data.length)
  for (let index = 0; index < 4; index++) result[index + 4] = type.charCodeAt(index)
  result.set(data, 8)
  let crc = 0xffffffff
  for (let index = 4; index < data.length + 8; index++) crc = CRC_TABLE[(crc ^ result[index]) & 255] ^ (crc >>> 8)
  view.setUint32(data.length + 8, (crc ^ 0xffffffff) >>> 0)
  return result
}

export async function renderZonePng(g: Grid, zone: Zone, outPx: number): Promise<Uint8Array> {
  const scale = Math.floor(outPx / Math.max(zone.w, zone.h))
  if (!Number.isInteger(scale) || scale < 1 || zone.w < 1 || zone.h < 1 || !Number.isInteger(zone.w) || !Number.isInteger(zone.h) || !Number.isInteger(zone.x) || !Number.isInteger(zone.y) || zone.x < 0 || zone.y < 0 || zone.x + zone.w > g.width || zone.y + zone.h > g.height) {
    throw new RangeError('Invalid zone or output size')
  }
  const width = zone.w * scale
  const height = zone.h * scale
  const rows = new Uint8Array((width * 3 + 1) * height)
  const colors = PALETTE.map((color) => [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16)))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (zone.y + Math.floor(y / scale)) * g.width + zone.x + Math.floor(x / scale)
      const color = colors[g.cells[index]]
      if (!color) throw new RangeError('Invalid palette index')
      rows.set(color, y * (width * 3 + 1) + 1 + x * 3)
    }
  }
  const compressed = new Uint8Array(await new Response(new Blob([rows]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer())
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header[8] = 8
  header[9] = 2
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', compressed), chunk('IEND', new Uint8Array())]
  const png = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let offset = 0
  for (const part of parts) {
    png.set(part, offset)
    offset += part.length
  }
  return png
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
