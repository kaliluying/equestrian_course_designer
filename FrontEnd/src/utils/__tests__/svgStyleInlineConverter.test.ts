/**
 * SVG样式内联转换系统测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SVGStyleInlineConverter, svgStyleConverter, convertSVGStyles, restoreSVGStyles } from '../svgStyleInlineConverter'

// Mock DOM环境
const mockComputedStyle = {
  getPropertyValue: vi.fn(),
} as unknown as CSSStyleDeclaration

const mockDocumentElement = {
  style: {
    getPropertyValue: vi.fn(),
  }
} as unknown as HTMLElement

// Mock window.getComputedStyle
Object.defineProperty(window, 'getComputedStyle', {
  value: vi.fn(() => mockComputedStyle),
  writable: true,
})

// Mock document.documentElement
Object.defineProperty(document, 'documentElement', {
  value: mockDocumentElement,
  writable: true,
})

describe('SVGStyleInlineConverter', () => {
  let converter: SVGStyleInlineConverter
  let mockSVGElement: SVGElement
  let mockContainer: HTMLElement

  beforeEach(() => {
    converter = new SVGStyleInlineConverter()

    // 创建模拟的SVG元素
    mockSVGElement = {
      tagName: 'path',
      style: {
        getPropertyValue: vi.fn(),
        setProperty: vi.fn(),
        removeProperty: vi.fn(),
      },
      getAttribute: vi.fn(),
    } as unknown as SVGElement

    // 创建模拟的容器元素
    mockContainer = {
      querySelectorAll: vi.fn(),
    } as unknown as HTMLElement

    // 重置所有mock
    vi.clearAllMocks()
  })

  afterEach(() => {
    converter.clearCache()
  })

  describe('CSS变量解析', () => {
    it('应该正确解析简单的CSS变量', () => {
      const mockGetComputedStyle = vi.mocked(window.getComputedStyle)
      mockGetComputedStyle.mockReturnValue({
        getPropertyValue: vi.fn((prop: string) => {
          if (prop === '--primary-color') return '#3a6af8'
          return ''
        }),
      } as unknown as CSSStyleDeclaration)

      const mockElementStyle = vi.mocked(mockSVGElement.style.getPropertyValue)
      mockElementStyle.mockReturnValue('var(--primary-color)')

      const result = converter.convertElementStyles(mockSVGElement)

      expect(result.inlinedStyles.stroke).toBe('#3a6af8')
      expect(result.appliedProperties).toContain('stroke')
    })

    it('应该处理带有回退值的CSS变量', () => {
      const mockGetComputedStyle = vi.mocked(window.getComputedStyle)
      mockGetComputedStyle.mockReturnValue({
        getPropertyValue: vi.fn((prop: string) => {
          if (prop === '--undefined-color') return ''
          return ''
        }),
      } as unknown as CSSStyleDeclaration)

      const mockElementStyle = vi.mocked(mockSVGElement.style.getPropertyValue)
      mockElementStyle.mockReturnValue('var(--undefined-color, #ff0000)')

      const result = converter.convertElementStyles(mockSVGElement)

      expect(result.inlinedStyles.stroke).toBe('#ff0000')
    })

    it('应该缓存CSS变量解析结果', () => {
      const mockGetComputedStyle = vi.mocked(window.getComputedStyle)
      const getPropertyValueSpy = vi.fn((prop: string) => {
        if (prop === '--primary-color') return '#3a6af8'
        return ''
      })

      mockGetComputedStyle.mockReturnValue({
        getPropertyValue: getPropertyValueSpy,
      } as unknown as CSSStyleDeclaration)

      const mockElementStyle = vi.mocked(mockSVGElement.style.getPropertyValue)
      mockElementStyle.mockReturnValue('var(--primary-color)')

      // 第一次转换
      converter.convertElementStyles(mockSVGElement)

      // 第二次转换
      converter.convertElementStyles(mockSVGElement)

      // 验证CSS变量只被解析了一次（因为有缓存）
      expect(getPropertyValueSpy).toHaveBeenCalledWith('--primary-color')

      const cacheStats = converter.getCacheStats()
      expect(cacheStats.size).toBe(1)
      expect(cacheStats.entries).toContainEqual(['--primary-color', '#3a6af8'])
    })
  })

  describe('SVG默认样式应用', () => {
    it('应该为path元素应用默认样式', () => {
      const mockGetComputedStyle = vi.mocked(window.getComputedStyle)
      mockGetComputedStyle.mockReturnValue({
        getPropertyValue: vi.fn(() => ''),
      } as unknown as CSSStyleDeclaration)

      const mockElementStyle = vi.mocked(mockSVGElement.style.getPropertyValue)
      mockElementStyle.mockReturnValue('')

      const mockGetAttribute = vi.mocked(mockSVGElement.getAttribute)
      mockGetAttribute.mockReturnValue(null)

      const result = converter.convertElementStyles(mockSVGElement)

      expect(result.inlinedStyles.fill).toBe('none')
      expect(result.inlinedStyles.stroke).toBe('#3a6af8')
      expect(result.inlinedStyles['stroke-width']).toBe('2')
    })

    it('应该为circle元素应用默认样式', () => {
      const circleElement = {
        ...mockSVGElement,
        tagName: 'circle',
      } as SVGElement

      const mockGetComputedStyle = vi.mocked(window.getComputedStyle)
      mockGetComputedStyle.mockReturnValue({
        getPropertyValue: vi.fn(() => ''),
      } as unknown as CSSStyleDeclaration)

      const result = converter.convertElementStyles(circleElement)

      expect(result.inlinedStyles.fill).toBe('#3a6af8')
    })

    it('应该为text元素应用默认样式', () => {
      const textElement = {
        ...mockSVGElement,
        tagName: 'text',
      } as SVGElement

      const mockGetComputedStyle = vi.mocked(window.getComputedStyle)
      mockGetComputedStyle.mockReturnValue({
        getPropertyValue: vi.fn(() => ''),
      } as unknown as CSSStyleDeclaration)

      const result = converter.convertElementStyles(textElement)

      expect(result.inlinedStyles.fill).toBe('#1a202c')
      expect(result.inlinedStyles['font-size']).toBe('12px')
      expect(result.inlinedStyles['text-anchor']).toBe('middle')
    })
  })

  describe('样式优先级处理', () => {
    it('应该优先使用内联样式', () => {
      const mockGetComputedStyle = vi.mocked(window.getComputedStyle)
      mockGetComputedStyle.mockReturnValue({
        getPropertyValue: vi.fn((prop: string) => {
          if (prop === 'stroke') return '#ff0000' // 计算样式
          return ''
        }),
      } as unknown as CSSStyleDeclaration)

      const mockElementStyle = vi.mocked(mockSVGElement.style.getPropertyValue)
      mockElementStyle.mockImplementation((prop: string) => {
        if (prop === 'stroke') return '#00ff00' // 内联样式
        return ''
      })

      const result = converter.convertElementStyles(mockSVGElement)

      expect(result.inlinedStyles.stroke).toBe('#00ff00') // 应该使用内联样式
    })

    it('应该其次使用属性值', () => {
      const mockGetComputedStyle = vi.mocked(window.getComputedStyle)
      mockGetComputedStyle.mockReturnValue({
        getPropertyValue: vi.fn((prop: string) => {
          if (prop === 'stroke') return '#ff0000' // 计算样式
          return ''
        }),
      } as unknown as CSSStyleDeclaration)

      const mockElementStyle = vi.mocked(mockSVGElement.style.getPropertyValue)
      mockElementStyle.mockReturnValue('') // 没有内联样式

      const mockGetAttribute = vi.mocked(mockSVGElement.getAttribute)
      mockGetAttribute.mockImplementation((attr: string) => {
        if (attr === 'stroke') return '#0000ff' // 属性值
        return null
      })

      const result = converter.convertElementStyles(mockSVGElement)

      expect(result.inlinedStyles.stroke).toBe('#0000ff') // 应该使用属性值
    })
  })

  describe('批量处理', () => {
    it('应该能够处理多个SVG元素', () => {
      const elements = [mockSVGElement, { ...mockSVGElement }] as SVGElement[]

      const mockGetComputedStyle = vi.mocked(window.getComputedStyle)
      mockGetComputedStyle.mockReturnValue({
        getPropertyValue: vi.fn(() => ''),
      } as unknown as CSSStyleDeclaration)

      const results = converter.convertMultipleElements(elements)

      expect(results).toHaveLength(2)
      expect(results[0].element).toBe(elements[0])
      expect(results[1].element).toBe(elements[1])
    })

    it('应该能够处理容器内的所有SVG元素', () => {
      const mockSVGRoot = { ...mockSVGElement, tagName: 'svg' } as SVGElement
      const mockPath = { ...mockSVGElement, tagName: 'path' } as SVGElement

      const mockQuerySelectorAll = vi.mocked(mockContainer.querySelectorAll)
      mockQuerySelectorAll.mockImplementation((selector: string) => {
        if (selector === 'svg') {
          return [mockSVGRoot] as unknown as NodeListOf<SVGElement>
        }
        if (selector === 'svg *') {
          return [mockPath] as unknown as NodeListOf<SVGElement>
        }
        return [] as unknown as NodeListOf<SVGElement>
      })

      const mockGetComputedStyle = vi.mocked(window.getComputedStyle)
      mockGetComputedStyle.mockReturnValue({
        getPropertyValue: vi.fn(() => ''),
      } as unknown as CSSStyleDeclaration)

      const results = converter.convertContainerSVGStyles(mockContainer)

      expect(results).toHaveLength(2) // SVG根元素 + path元素
    })
  })

  describe('样式恢复', () => {
    it('应该能够恢复原始样式', () => {
      const mockSetProperty = vi.mocked(mockSVGElement.style.setProperty)
      const mockRemoveProperty = vi.mocked(mockSVGElement.style.removeProperty)

      const mockGetComputedStyle = vi.mocked(window.getComputedStyle)
      mockGetComputedStyle.mockReturnValue({
        getPropertyValue: vi.fn(() => ''),
      } as unknown as CSSStyleDeclaration)

      const mockElementStyle = vi.mocked(mockSVGElement.style.getPropertyValue)
      mockElementStyle.mockImplementation((prop: string) => {
        if (prop === 'stroke') return '#original'
        return ''
      })

      const result = converter.convertElementStyles(mockSVGElement)
      converter.restoreOriginalStyles([result])

      // 验证所有属性都被移除
      expect(mockRemoveProperty).toHaveBeenCalled()

      // 验证原始样式被恢复
      expect(mockSetProperty).toHaveBeenCalledWith('stroke', '#original')
    })
  })

  describe('便捷函数', () => {
    it('convertSVGStyles应该正常工作', () => {
      const mockQuerySelectorAll = vi.mocked(mockContainer.querySelectorAll)
      mockQuerySelectorAll.mockReturnValue([] as unknown as NodeListOf<SVGElement>)

      const results = convertSVGStyles(mockContainer)
      expect(Array.isArray(results)).toBe(true)
    })

    it('restoreSVGStyles应该正常工作', () => {
      const mockResults = [{
        element: mockSVGElement,
        originalStyles: { stroke: '#test' },
        inlinedStyles: {},
        appliedProperties: []
      }]

      expect(() => restoreSVGStyles(mockResults)).not.toThrow()
    })
  })

  describe('缓存管理', () => {
    it('应该能够清除缓存', () => {
      // 添加一些缓存数据
      const mockGetComputedStyle = vi.mocked(window.getComputedStyle)
      mockGetComputedStyle.mockReturnValue({
        getPropertyValue: vi.fn((prop: string) => {
          if (prop === '--test-color') return '#test'
          return ''
        }),
      } as unknown as CSSStyleDeclaration)

      const mockElementStyle = vi.mocked(mockSVGElement.style.getPropertyValue)
      mockElementStyle.mockReturnValue('var(--test-color)')

      converter.convertElementStyles(mockSVGElement)

      expect(converter.getCacheStats().size).toBeGreaterThan(0)

      converter.clearCache()

      expect(converter.getCacheStats().size).toBe(0)
    })
  })
})
