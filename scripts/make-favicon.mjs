#!/usr/bin/env node
/**
 * Draws the Pixle favicon: a sky tile carrying a lowercase p from the nav's compact wordmark glyph,
 * with the cyan dot where the i's dot sits. Writes public/favicon.ico (16 and 32 px, PNG entries),
 * public/favicon.svg (the 32 px design as flat rects) and assets/icon.svg (the same drawing).
 *
 * No dependencies: PNG encoding uses node:zlib, and the ICO wrapper is a plain header plus the two
 * PNG blobs. Run it with `node scripts/make-favicon.mjs`; the output is checked in, so the build
 * never runs it.
 */
import { deflateSync } from 'node:zlib'
import { readFile, writeFile } from 'node:fs/promises'

const root = new URL('..', import.meta.url)
/** Ramps straight out of src/scene/palette.ts, so the icon cannot drift from the in-game art. */
async function ramps(names) {
  const source = await readFile(new URL('src/scene/palette.ts', root), 'utf8')
  return Object.fromEntries(names.map((name) => {
    const line = source.match(new RegExp(`^\\s*${name}: \\[([^\\]]+)\\]`, 'm'))
    if (!line) throw new Error(`ramp not found in src/scene/palette.ts: ${name}`)
    return [name, line[1].match(/#[0-9a-f]{6}/g)]
  }))
}
const ramp = await ramps(['sky', 'flame', 'paper'])
const DOT = '#8ce8dc'
const GLINT = ramp.paper[4]
const tile = ramp.sky[0]
/** The compact sign's p, then the i's dot just past its bowl and three rows up, like an i's dot. */
const glyph = {
  rows: ['######.', '##...##', '##...##', '##...##', '##...##', '##...##', '######.', '##.....', '##.....'],
  /** Band per glyph row, indexing the "pix" ramp: rows 0-2, 3-4, then 5-8. */
  bands: [0, 0, 0, 1, 1, 2, 2, 2, 2],
  width: 7,
  height: 9,
  dotGapX: 7,
  dotGapY: 3,
  dotSize: 2,
}

/**
 * Paints one icon into a `size` by `size` grid of colours (null = transparent). The glyph is drawn at
 * 2x for 32 px and 1x for 16 px; the p and its dot are centred together as one mark.
 */
function paint(size) {
  const scale = size / 16
  const grid = Array.from({ length: size }, () => Array(size).fill(null))
  const put = (x, y, colour) => { if (x >= 0 && y >= 0 && x < size && y < size) grid[y][x] = colour }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, tile)
  // Rounded corners: a 2px cut at 32, 1px at 16 — the same L the wordmark board uses.
  const cut = scale * 1
  for (let step = 0; step < cut; step++) for (const [x, y] of [[step, 0], [size - 1 - step, 0], [step, size - 1], [size - 1 - step, size - 1]]) put(x, y, null)
  for (const [x, y] of [[0, 1], [size - 1, 1], [0, size - 2], [size - 1, size - 2]]) put(x, y, null)
  const width = glyph.width * scale, height = glyph.height * scale
  const markWidth = (glyph.dotGapX + glyph.dotSize) * scale, markHeight = (glyph.height + glyph.dotGapY) * scale
  const x = Math.floor((size - markWidth) / 2)
  const y = Math.floor((size - markHeight) / 2) + glyph.dotGapY * scale
  glyph.rows.forEach((row, index) => row.split('').forEach((pixel, column) => {
    if (pixel !== '#') return
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) put(x + column * scale + dx, y + index * scale + dy, ramp.flame[4 - glyph.bands[index]])
  }))
  const dotSize = glyph.dotSize * scale
  const dotX = x + glyph.dotGapX * scale, dotY = y - glyph.dotGapY * scale
  // Same aqua core and paper glint as the nav sign's i dot (Navigation.tsx logoPalette d/e).
  for (let dy = 0; dy < dotSize; dy++) for (let dx = 0; dx < dotSize; dx++) put(dotX + dx, dotY + dy, DOT)
  for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) put(dotX + dx, dotY + dy, GLINT)
  // The dot and the p must both keep a tile pixel of margin.
  const margins = [x, y, size - (x + width), size - (y + height), dotX, dotY, size - (dotX + dotSize), size - (dotY + dotSize)]
  if (Math.min(...margins) < 1) throw new Error(`${size}px icon breaks its 1px margin: ${margins.join(',')}`)
  return grid
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}
function png(grid) {
  const size = grid.length
  const rgba = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    let offset = y * (size * 4 + 1)
    rgba[offset++] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const colour = grid[y][x]
      const hex = colour ? Number.parseInt(colour.slice(1), 16) : 0
      rgba[offset++] = colour ? (hex >> 16) & 0xff : 0
      rgba[offset++] = colour ? (hex >> 8) & 0xff : 0
      rgba[offset++] = colour ? hex & 0xff : 0
      rgba[offset++] = colour ? 0xff : 0
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rgba, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const entries = []
  let offset = 6 + images.length * 16
  for (const image of images) {
    const entry = Buffer.alloc(16)
    entry[0] = image.grid.length === 256 ? 0 : image.grid.length
    entry[1] = image.grid.length === 256 ? 0 : image.grid.length
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(image.png.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += image.png.length
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)])
}

/** Greedy rectangle merge, so the SVG is a handful of rects rather than one per tile pixel. */
function rects(grid) {
  const size = grid.length
  const taken = Array.from({ length: size }, () => Array(size).fill(false))
  const out = []
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const colour = grid[y][x]
    if (!colour || taken[y][x]) continue
    let width = 0
    while (x + width < size && grid[y][x + width] === colour && !taken[y][x + width]) width++
    let height = 1
    const runClear = (row) => Array.from({ length: width }, (_, index) => grid[row][x + index] === colour && !taken[row][x + index]).every(Boolean)
    while (y + height < size && runClear(y + height)) height++
    for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) taken[y + dy][x + dx] = true
    out.push({ x, y, width, height, colour })
  }
  return out
}
const svg = (grid) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">
${rects(grid).map(({ x, y, width, height, colour }) => `  <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${colour}" />`).join('\n')}
</svg>
`

const small = paint(16), large = paint(32)
await writeFile(new URL('public/favicon.ico', root), ico([{ grid: small, png: png(small) }, { grid: large, png: png(large) }]))
const drawing = svg(large)
await writeFile(new URL('public/favicon.svg', root), drawing)
await writeFile(new URL('assets/icon.svg', root), drawing)
console.log(`favicon.ico ${small.length}px + ${large.length}px, ${rects(large).length} rects at 32px`)
