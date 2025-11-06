import { vi } from 'vitest'

// Mock DOM APIs that might not be available in jsdom
Object.defineProperty(window, 'getComputedStyle', {
  value: vi.fn(() => ({
    getPropertyValue: vi.fn(() => ''),
  })),
})

// Mock getBoundingClientRect
Element.prototype.getBoundingClientRect = vi.fn(() => ({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  left: 0,
  bottom: 0,
  right: 0,
  toJSON: () => ({}),
})) as any

// Mock SVG namespace methods
document.createElementNS = vi.fn((namespace: string, tagName: string) => {
  const element = document.createElement(tagName)
  // Add SVG-specific methods
  if (tagName === 'svg' || tagName === 'path' || tagName === 'circle' || tagName === 'line') {
    (element as any).getBBox = vi.fn(() => ({
      x: 0,
      y: 0,
      width: 100,
      height: 100
    }))
  }
  return element as any
})
