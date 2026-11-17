import { renderToString } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { PixelScene } from './PixelScene'

it('renders on the server without drawing or effect warnings', () => {
  const draw = vi.fn()
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    expect(renderToString(<PixelScene draw={draw} />)).toContain('<canvas')
    expect(draw).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  } finally {
    error.mockRestore()
  }
})
