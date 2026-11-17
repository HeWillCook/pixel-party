import { describe, expect, it, vi } from 'vitest'
import { defineSprite, drawSprite } from './sprite'
import { mulberry32 } from './procedural'

describe('sprites', () => {
  it('rejects ragged rows', () => {
    expect(() => defineSprite(['aa', 'a'], { a: '#fff' })).toThrow()
  })

  it('rejects unknown palette characters', () => {
    expect(() => defineSprite(['ab'], { a: '#fff' })).toThrow()
  })

  it('produces deterministic random values', () => {
    const first = mulberry32(42)
    const second = mulberry32(42)
    expect(Array.from({ length: 5 }, first)).toEqual(Array.from({ length: 5 }, second))
  })

  it('draws flipped pixels without drawing transparent cells', () => {
    const ctx = { fillRect: vi.fn(), fillStyle: '', imageSmoothingEnabled: true } as unknown as CanvasRenderingContext2D
    drawSprite(ctx, defineSprite(['a.'], { a: '#fff' }), 10, 20, { flipX: true })
    expect(ctx.fillRect).toHaveBeenCalledOnce()
    expect(ctx.fillRect).toHaveBeenCalledWith(11, 20, 1, 1)
    expect(ctx.imageSmoothingEnabled).toBe(false)
  })
})
