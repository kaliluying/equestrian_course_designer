import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SVGExportEnhancer } from '../svgExportEnhancer'

// Mock window and document
const mockGetComputedStyle = vi.fn(() => ({
  getPropertyValue: vi.fn((prop: string) => {
    const mockStyles: Record<string, string> = {
      'fill': '#3a6af8',
      'stroke': '#000000',
      'stroke-width': '2',
      'opacity': '1',
      'display': 'block',
      'visibility': 'visible'
    }
    return mockStyles[prop] || ''
  })
}))

// @ts-ignore
global.window = { getComputedStyle: mockGetComputedStyle }

// Helper function to create mock style object
const createMockStyle = (styles: Record<string, string> = {}) => ({
  ...styles,
  getPropertyValue: vi.fn((prop: string) => styles[prop] || ''),
  setProperty: vi.fn(),
  removeProperty: vi.fn()
})

describe('SVGExportEnhancer - Snapshot and Backup Mechanism', () => {
  let enhancer: SVGExportEnhancer

  beforeEach(() => {
    enhancer = new SVGExportEnhancer()
  })

  it('should create SVG snapshot correctly', () => {
    const mockSVGElement = {
      tagName: 'svg',
      id: 'test-svg',
      outerHTML: '<svg width="100" height="100" viewBox="0 0 100 100"></svg>',
      setAttribute: vi.fn(),
      getAttribute: vi.fn((attr: string) => {
        const attrs: Record<string, string> = {
          'width': '100',
          'height': '100',
          'viewBox': '0 0 100 100',
          'transform': ''
        }
        return attrs[attr] || null
      }),
      removeAttribute: vi.fn(),
      style: createMockStyle(),
      getBoundingClientRect: vi.fn(() => ({
        x: 0, y: 0, width: 100, height: 100,
        top: 0, left: 0, bottom: 100, right: 100,
        toJSON: () => ({})
      }))
    } as any

    const snapshot = enhancer.createSVGSnapshot(mockSVGElement)

    expect(snapshot).toBeDefined()
    expect(snapshot.elementId).toBeTruthy()
    expect(snapshot.svgContent).toContain('<svg')
    expect(snapshot.viewBox).toBe('0 0 100 100')
    expect(snapshot.styles).toBeTruthy()
  })

  it('should create multiple SVG snapshots', () => {
    const mockSVG1 = {
      tagName: 'svg',
      id: 'svg1',
      outerHTML: '<svg width="100" height="100"></svg>',
      setAttribute: vi.fn(),
      getAttribute: vi.fn(() => '100'),
      removeAttribute: vi.fn(),
      style: createMockStyle(),
      getBoundingClientRect: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 100 }))
    } as any

    const mockSVG2 = {
      tagName: 'svg',
      id: 'svg2',
      outerHTML: '<svg width="200" height="200"></svg>',
      setAttribute: vi.fn(),
      getAttribute: vi.fn(() => '200'),
      removeAttribute: vi.fn(),
      style: createMockStyle(),
      getBoundingClientRect: vi.fn(() => ({ x: 0, y: 0, width: 200, height: 200 }))
    } as any

    const snapshots = enhancer.createSVGSnapshots([mockSVG1, mockSVG2])

    expect(snapshots).toHaveLength(2)
    expect(snapshots[0].elementId).not.toBe(snapshots[1].elementId)
  })

  it('should create SVG backup data', () => {
    const mockPath = {
      tagName: 'path',
      setAttribute: vi.fn(),
      getAttribute: vi.fn((attr: string) => attr === 'd' ? 'M10,10 L90,90' : null),
      removeAttribute: vi.fn(),
      style: createMockStyle({ stroke: '#ff0000', 'stroke-width': '3' }),
      getBoundingClientRect: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 100 }))
    } as any

    const mockSVG = {
      tagName: 'svg',
      setAttribute: vi.fn(),
      getAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      style: createMockStyle(),
      getBoundingClientRect: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 100 })),
      querySelectorAll: vi.fn(() => [mockPath])
    } as any

    const mockCanvas = {
      className: 'course-canvas',
      querySelectorAll: vi.fn(() => [mockSVG])
    } as any

    // Mock the detectSVGElements method to return our mock SVG
    vi.spyOn(enhancer, 'detectSVGElements').mockReturnValue([mockSVG])

    const backupData = enhancer.createSVGBackup(mockCanvas)

    expect(backupData).toBeDefined()
    expect(backupData.pathElements).toHaveLength(1)
    expect(backupData.styleBackup).toHaveLength(1)
    expect(backupData.attributeBackup).toHaveLength(1)
  })

  it('should restore SVG state from backup', () => {
    const mockPath = {
      tagName: 'path',
      setAttribute: vi.fn(),
      getAttribute: vi.fn((attr: string) => attr === 'd' ? 'M10,10 L90,90' : null),
      removeAttribute: vi.fn(),
      style: createMockStyle({ stroke: '#ff0000', 'stroke-width': '3' }),
      getBoundingClientRect: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 100 }))
    } as any

    const mockSVG = {
      tagName: 'svg',
      setAttribute: vi.fn(),
      getAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      style: createMockStyle(),
      getBoundingClientRect: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 100 })),
      querySelectorAll: vi.fn(() => [mockPath])
    } as any

    const mockCanvas = {
      className: 'course-canvas',
      querySelectorAll: vi.fn(() => [mockSVG])
    } as any

    // Mock the detectSVGElements method
    vi.spyOn(enhancer, 'detectSVGElements').mockReturnValue([mockSVG])

    // Create backup
    const backupData = enhancer.createSVGBackup(mockCanvas)

    // Restore from backup (this should call the mocked methods)
    enhancer.restoreSVGState(backupData)

    // Verify that setAttribute was called (indicating restoration happened)
    expect(mockPath.setAttribute).toHaveBeenCalled()
  })

  it('should provide cache statistics', () => {
    const mockSVG = {
      tagName: 'svg',
      id: 'test',
      outerHTML: '<svg></svg>',
      setAttribute: vi.fn(),
      getAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      style: createMockStyle(),
      getBoundingClientRect: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 100 }))
    } as any

    const mockCanvas = {
      className: 'course-canvas',
      querySelectorAll: vi.fn(() => [])
    } as any

    // Create some snapshots and backups
    enhancer.createSVGSnapshot(mockSVG)
    enhancer.createSVGBackup(mockCanvas)

    const stats = enhancer.getCacheStats()

    expect(stats.snapshots).toBe(1)
    expect(stats.backups).toBe(1)
  })

  it('should clear cache', () => {
    const mockSVG = {
      tagName: 'svg',
      id: 'test',
      outerHTML: '<svg></svg>',
      setAttribute: vi.fn(),
      getAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      style: createMockStyle(),
      getBoundingClientRect: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 100 }))
    } as any

    const mockCanvas = {
      className: 'course-canvas',
      querySelectorAll: vi.fn(() => [])
    } as any

    // Create some data
    enhancer.createSVGSnapshot(mockSVG)
    enhancer.createSVGBackup(mockCanvas)

    // Clear cache
    enhancer.clearCache()

    const stats = enhancer.getCacheStats()
    expect(stats.snapshots).toBe(0)
    expect(stats.backups).toBe(0)
  })
})
