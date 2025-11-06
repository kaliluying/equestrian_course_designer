/**
 * SVG样式内联转换系统
 * 用于将CSS变量和计算样式转换为内联样式，确保SVG元素在导出时正确渲染
 */

// SVG特有的样式属性列表
const SVG_STYLE_PROPERTIES = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'fill-opacity',
  'opacity',
  'visibility',
  'display',
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'text-anchor',
  'dominant-baseline',
  'alignment-baseline'
] as const

// CSS变量解析结果接口
interface CSSVariableResolution {
  originalValue: string
  resolvedValue: string
  isResolved: boolean
}

// 样式转换结果接口
export interface StyleConversionResult {
  element: SVGElement
  originalStyles: Record<string, string>
  inlinedStyles: Record<string, string>
  appliedProperties: string[]
}

/**
 * SVG样式内联转换器类
 */
export class SVGStyleInlineConverter {
  private cssVariableCache = new Map<string, string>()
  private rootStyles: CSSStyleDeclaration | null = null

  constructor() {
    // 缓存根元素的计算样式，用于解析CSS变量
    this.rootStyles = window.getComputedStyle(document.documentElement)
  }

  /**
   * 解析CSS变量
   * @param value CSS属性值，可能包含var()函数
   * @param computedStyle 元素的计算样式
   * @returns 解析结果
   */
  private resolveCSSVariable(value: string, computedStyle: CSSStyleDeclaration): CSSVariableResolution {
    const result: CSSVariableResolution = {
      originalValue: value,
      resolvedValue: value,
      isResolved: false
    }

    // 检查是否包含CSS变量
    const varRegex = /var\(\s*(--[^,\s)]+)\s*(?:,\s*([^)]+))?\s*\)/g
    let match
    let resolvedValue = value

    while ((match = varRegex.exec(value)) !== null) {
      const [fullMatch, variableName, fallbackValue] = match

      // 首先检查缓存
      let variableValue = this.cssVariableCache.get(variableName)

      if (!variableValue) {
        // 尝试从元素的计算样式中获取变量值
        variableValue = computedStyle.getPropertyValue(variableName).trim()

        // 如果元素样式中没有，尝试从根元素获取
        if (!variableValue && this.rootStyles) {
          variableValue = this.rootStyles.getPropertyValue(variableName).trim()
        }

        // 如果仍然没有值，使用回退值
        if (!variableValue && fallbackValue) {
          variableValue = fallbackValue.trim()
        }

        // 缓存解析结果
        if (variableValue) {
          this.cssVariableCache.set(variableName, variableValue)
        }
      }

      if (variableValue) {
        resolvedValue = resolvedValue.replace(fullMatch, variableValue)
        result.isResolved = true
      }
    }

    result.resolvedValue = resolvedValue
    return result
  }

  /**
   * 获取元素的有效样式值
   * @param element SVG元素
   * @param property 样式属性名
   * @param computedStyle 计算样式
   * @returns 有效的样式值
   */
  private getEffectiveStyleValue(
    element: SVGElement,
    property: string,
    computedStyle: CSSStyleDeclaration
  ): string | null {
    // 首先检查内联样式
    const inlineValue = element.style.getPropertyValue(property)
    if (inlineValue) {
      const resolved = this.resolveCSSVariable(inlineValue, computedStyle)
      return resolved.resolvedValue
    }

    // 然后检查属性值（对于SVG元素）
    const attributeValue = element.getAttribute(property)
    if (attributeValue) {
      const resolved = this.resolveCSSVariable(attributeValue, computedStyle)
      return resolved.resolvedValue
    }

    // 最后使用计算样式
    const computedValue = computedStyle.getPropertyValue(property)
    if (computedValue && computedValue !== 'none' && computedValue !== 'auto') {
      const resolved = this.resolveCSSVariable(computedValue, computedStyle)
      return resolved.resolvedValue
    }

    return null
  }

  /**
   * 应用SVG特定的默认样式
   * @param element SVG元素
   * @param styles 样式对象
   */
  private applySVGDefaults(element: SVGElement, styles: Record<string, string>): void {
    const tagName = element.tagName.toLowerCase()

    // 为路径元素应用默认样式
    if (tagName === 'path') {
      if (!styles.fill) {
        styles.fill = 'none'
      }
      if (!styles.stroke) {
        // 使用主色调作为默认描边颜色
        styles.stroke = '#3a6af8' // var(--primary-color)的值
      }
      if (!styles['stroke-width']) {
        styles['stroke-width'] = '2'
      }
    }

    // 为圆形元素应用默认样式
    if (tagName === 'circle') {
      if (!styles.fill && !styles.stroke) {
        styles.fill = '#3a6af8' // var(--primary-color)的值
      }
    }

    // 为线条元素应用默认样式
    if (tagName === 'line') {
      if (!styles.stroke) {
        styles.stroke = '#3a6af8' // var(--primary-color)的值
      }
      if (!styles['stroke-width']) {
        styles['stroke-width'] = '1'
      }
    }

    // 为文本元素应用默认样式
    if (tagName === 'text') {
      if (!styles.fill) {
        styles.fill = '#1a202c' // var(--text-color)的值
      }
      if (!styles['font-size']) {
        styles['font-size'] = '12px'
      }
      if (!styles['text-anchor']) {
        styles['text-anchor'] = 'middle'
      }
    }
  }

  /**
   * 转换单个SVG元素的样式为内联样式
   * @param element SVG元素
   * @returns 转换结果
   */
  convertElementStyles(element: SVGElement): StyleConversionResult {
    const computedStyle = window.getComputedStyle(element)
    const originalStyles: Record<string, string> = {}
    const inlinedStyles: Record<string, string> = {}
    const appliedProperties: string[] = []

    // 保存原始内联样式
    for (const property of SVG_STYLE_PROPERTIES) {
      const originalValue = element.style.getPropertyValue(property)
      if (originalValue) {
        originalStyles[property] = originalValue
      }
    }

    // 处理每个SVG样式属性
    for (const property of SVG_STYLE_PROPERTIES) {
      const effectiveValue = this.getEffectiveStyleValue(element, property, computedStyle)

      if (effectiveValue) {
        inlinedStyles[property] = effectiveValue
        appliedProperties.push(property)
      }
    }

    // 应用SVG特定的默认样式
    this.applySVGDefaults(element, inlinedStyles)

    // 将解析后的样式应用到元素
    for (const [property, value] of Object.entries(inlinedStyles)) {
      element.style.setProperty(property, value)
    }

    return {
      element,
      originalStyles,
      inlinedStyles,
      appliedProperties
    }
  }

  /**
   * 批量转换SVG元素的样式
   * @param elements SVG元素数组
   * @returns 转换结果数组
   */
  convertMultipleElements(elements: SVGElement[]): StyleConversionResult[] {
    return elements.map(element => this.convertElementStyles(element))
  }

  /**
   * 转换容器内所有SVG元素的样式
   * @param container 包含SVG元素的容器
   * @returns 转换结果数组
   */
  convertContainerSVGStyles(container: HTMLElement): StyleConversionResult[] {
    const svgElements = container.querySelectorAll('svg *') as NodeListOf<SVGElement>
    const results: StyleConversionResult[] = []

    // 处理SVG根元素
    const svgRoots = container.querySelectorAll('svg') as NodeListOf<SVGElement>
    for (const svg of svgRoots) {
      results.push(this.convertElementStyles(svg))
    }

    // 处理SVG内部元素
    for (const element of svgElements) {
      if (element instanceof SVGElement) {
        results.push(this.convertElementStyles(element))
      }
    }

    return results
  }

  /**
   * 恢复元素的原始样式
   * @param results 转换结果数组
   */
  restoreOriginalStyles(results: StyleConversionResult[]): void {
    for (const result of results) {
      const { element, originalStyles } = result

      // 清除所有内联样式
      for (const property of SVG_STYLE_PROPERTIES) {
        element.style.removeProperty(property)
      }

      // 恢复原始内联样式
      for (const [property, value] of Object.entries(originalStyles)) {
        element.style.setProperty(property, value)
      }
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cssVariableCache.clear()
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): { size: number; entries: Array<[string, string]> } {
    return {
      size: this.cssVariableCache.size,
      entries: Array.from(this.cssVariableCache.entries())
    }
  }
}

// 创建全局实例
export const svgStyleConverter = new SVGStyleInlineConverter()

// 便捷函数
export function convertSVGStyles(container: HTMLElement): StyleConversionResult[] {
  return svgStyleConverter.convertContainerSVGStyles(container)
}

export function restoreSVGStyles(results: StyleConversionResult[]): void {
  svgStyleConverter.restoreOriginalStyles(results)
}
