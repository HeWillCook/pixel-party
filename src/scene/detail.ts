import type { Sprite } from './sprite'

/**
 * The scene's logical world stays 320x180 (or 180x320). Art is rendered on a grid DETAIL times finer:
 * one logical unit is DETAIL x DETAIL detail pixels. Draw code keeps using logical units; new art
 * addresses half-unit precision through the `d*` helpers below.
 */
export const DETAIL = 2

type Ctx = CanvasRenderingContext2D

/** Rect in detail pixels (1 detail pixel = 0.5 logical unit). */
export function dRect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color
  ctx.fillRect(x / DETAIL, y / DETAIL, w / DETAIL, h / DETAIL)
}

/** Fill a detail-pixel rect with a checker (1px) dither of two colours, phase-aligned to the detail grid. */
export function dDither(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, phase = 0): void {
  ctx.fillStyle = color
  for (let row = 0; row < h; row++) {
    for (let column = (row + phase) & 1; column < w; column += 2) ctx.fillRect((x + column) / DETAIL, (y + row) / DETAIL, 1 / DETAIL, 1 / DETAIL)
  }
}

const sprites = new WeakMap<Sprite, HTMLCanvasElement>()

function bitmap(sprite: Sprite): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  let canvas = sprites.get(sprite)
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.width = sprite.w
    canvas.height = sprite.h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    sprite.rows.forEach((row, y) => Array.from(row).forEach((pixel, x) => {
      if (pixel === '.') return
      ctx.fillStyle = sprite.palette[pixel]
      ctx.fillRect(x, y, 1, 1)
    }))
    sprites.set(sprite, canvas)
  }
  return canvas
}

/** Draw a sprite authored on the detail grid (one cell = one detail pixel). x/y are logical units (halves allowed). */
export function drawDetailSprite(ctx: Ctx, sprite: Sprite, x: number, y: number, opts?: { flipX?: boolean }): void {
  ctx.imageSmoothingEnabled = false
  const source = typeof ctx.drawImage === 'function' ? bitmap(sprite) : null
  const px = Math.round(x * DETAIL), py = Math.round(y * DETAIL)
  if (source && !opts?.flipX) {
    ctx.drawImage(source, px / DETAIL, py / DETAIL, sprite.w / DETAIL, sprite.h / DETAIL)
    return
  }
  sprite.rows.forEach((row, rowIndex) => Array.from(row).forEach((pixel, column) => {
    if (pixel === '.') return
    ctx.fillStyle = sprite.palette[pixel]
    ctx.fillRect((px + (opts?.flipX ? sprite.w - column - 1 : column)) / DETAIL, (py + rowIndex) / DETAIL, 1 / DETAIL, 1 / DETAIL)
  }))
}

/** Logical-size canvas stub: draw code reads `ctx.canvas.width/height` as scene units, never as backing pixels. */
export function logicalCanvasStub(width: number, height: number): HTMLCanvasElement {
  return { width, height } as unknown as HTMLCanvasElement
}

export function bindLogicalCanvas(ctx: Ctx, width: number, height: number): void {
  Object.defineProperty(ctx, 'canvas', { value: logicalCanvasStub(width, height), configurable: true })
}

export interface Layer { canvas: HTMLCanvasElement; ctx: Ctx; w: number; h: number }

const layers = new Map<string, Layer>()
const MAX_LAYERS = 16

/**
 * A cached static layer of the scene, painted once at detail resolution (transparent background) and
 * re-blitted every frame. `key` must capture everything the paint depends on. Returns false when there is
 * no DOM (tests) so callers can paint directly instead.
 */
export function blitStaticLayer(ctx: Ctx, key: string, w: number, h: number, paint: (ctx: Ctx) => void): boolean {
  if (typeof document === 'undefined' || typeof ctx.drawImage !== 'function') return false
  let layer = layers.get(key)
  if (!layer) {
    const canvas = document.createElement('canvas')
    canvas.width = w * DETAIL
    canvas.height = h * DETAIL
    const layerCtx = canvas.getContext('2d')
    if (!layerCtx) return false
    layerCtx.imageSmoothingEnabled = false
    layerCtx.scale(DETAIL, DETAIL)
    bindLogicalCanvas(layerCtx, w, h)
    paint(layerCtx)
    layer = { canvas, ctx: layerCtx, w, h }
    layers.set(key, layer)
    if (layers.size > MAX_LAYERS) layers.delete(layers.keys().next().value as string)
  }
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(layer.canvas, 0, 0, w, h)
  return true
}

export function clearStaticLayers(): void { layers.clear() }

/** 4x4 Bayer threshold at a detail pixel, in [0, 1). Ordered dither keeps gradients on the pixel grid. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
export function bayer(x: number, y: number): number {
  return (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16
}

/**
 * Ordered dither at quarter-step density. Quantising the level keeps gradients to clean 25/50/75% patterns
 * instead of isolated speckle dots at the sparse end of a raw Bayer ramp.
 */
export function dth(level: number, x: number, y: number, steps = 4): boolean {
  return Math.round(Math.max(0, Math.min(1, level)) * steps) / steps > bayer(x, y)
}

const packed = new Map<string, number>()
function pack(hex: string): number {
  let value = packed.get(hex)
  if (value === undefined) {
    const n = parseInt(hex.slice(1), 16)
    value = (255 << 24 | (n & 255) << 16 | (n >> 8 & 255) << 8 | n >> 16 & 255) >>> 0 // little-endian RGBA
    packed.set(hex, value)
  }
  return value
}

/**
 * Per-pixel shading of a detail-pixel rect: `shader(x, y)` gets absolute detail coordinates and returns a
 * palette hex (or null for transparent). Renders through ImageData so large dithered regions stay cheap.
 */
export function shadeRegion(ctx: Ctx, x: number, y: number, w: number, h: number, shader: (x: number, y: number) => string | null): void {
  if (w <= 0 || h <= 0) return
  if (typeof document === 'undefined' || typeof ctx.drawImage !== 'function') {
    for (let row = 0; row < h; row++) for (let column = 0; column < w; column++) {
      const colour = shader(x + column, y + row)
      if (colour) { ctx.fillStyle = colour; ctx.fillRect((x + column) / DETAIL, (y + row) / DETAIL, 1 / DETAIL, 1 / DETAIL) }
    }
    return
  }
  const scratch = document.createElement('canvas')
  scratch.width = w
  scratch.height = h
  const sctx = scratch.getContext('2d')
  if (!sctx) return
  const image = sctx.createImageData(w, h)
  const words = new Uint32Array(image.data.buffer)
  for (let row = 0; row < h; row++) for (let column = 0; column < w; column++) {
    const colour = shader(x + column, y + row)
    if (colour) words[row * w + column] = pack(colour)
  }
  sctx.putImageData(image, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(scratch, x / DETAIL, y / DETAIL, w / DETAIL, h / DETAIL)
}

/** Grid builder for detail-pixel sprites: paint rects/pixels with single-character palette keys, then freeze. */
export class DetailGrid {
  readonly rows: string[][]
  constructor(readonly w: number, readonly h: number) { this.rows = Array.from({ length: h }, () => Array<string>(w).fill('.')) }
  px(x: number, y: number, key: string): void { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.rows[y][x] = key }
  rect(x: number, y: number, w: number, h: number, key: string): void { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, key) }
  get(x: number, y: number): string { return this.rows[y]?.[x] ?? '.' }
  lines(): string[] { return this.rows.map(row => row.join('')) }
}

const regions = new Map<string, HTMLCanvasElement>()
const MAX_REGIONS = 64

function createRegion(key: string, x: number, y: number, w: number, h: number, paint: (ctx: Ctx) => void, scene?: { w: number; h: number }): boolean {
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(w * DETAIL)
  canvas.height = Math.ceil(h * DETAIL)
  const layerCtx = canvas.getContext('2d')
  if (!layerCtx) return false
  layerCtx.imageSmoothingEnabled = false
  layerCtx.scale(DETAIL, DETAIL)
  layerCtx.translate(-x, -y)
  bindLogicalCanvas(layerCtx, scene?.w ?? w, scene?.h ?? h)
  paint(layerCtx)
  regions.set(key, canvas)
  if (regions.size > MAX_REGIONS) regions.delete(regions.keys().next().value as string)
  return true
}

/**
 * Cached static art for one rectangle of the scene (logical units), stamped at an optional offset (bobbing
 * props). `paint` draws in scene coordinates: the layer is translated so absolute x/y still work. Returns
 * false with no DOM so callers can paint directly instead.
 */
export function stampRegion(ctx: Ctx, key: string, x: number, y: number, w: number, h: number, paint: (ctx: Ctx) => void, opts?: { dx?: number; dy?: number; scene?: { w: number; h: number } }): boolean {
  if (typeof document === 'undefined' || typeof ctx.drawImage !== 'function') return false
  if (!regions.has(key) && !createRegion(key, x, y, w, h, paint, opts?.scene)) return false
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(regions.get(key)!, x + (opts?.dx ?? 0), y + (opts?.dy ?? 0), w, h)
  return true
}
