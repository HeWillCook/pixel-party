import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { Hotspot } from './Hotspot'

it('renders an accessible link or button without browser APIs', () => {
  const rect = { x: 32, y: 18, w: 64, h: 36 }
  const link = renderToStaticMarkup(createElement(Hotspot, { rect, label: 'Daily', href: '/home' }))
  const button = renderToStaticMarkup(createElement(Hotspot, { rect, label: 'Radio', onClick: () => {} }))
  expect(link).toContain('href="/home"')
  expect(link).toContain('aria-label="Daily"')
  expect(link).toContain('left:10%')
  expect(button).toContain('<button')
  expect(button).toContain('aria-label="Radio"')
})
