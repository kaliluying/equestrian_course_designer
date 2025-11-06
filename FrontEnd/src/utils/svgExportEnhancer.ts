/**
 * SVG导出增强器
 * 负责SVG元素的预处理和增强，确保在导出时正确渲染
 */

// 数据模型接口
export interface ProcessedSVGElement {
  element: SVGElement
  originalStyles: { [key: string]: string }
  inlinedStyles: string
  pathData: string
  boundingBox: DOMRect
  isVisible: boolean
}

export interface SVGSnapshot {
  elementId: string
  svgContent: string
  styles: string
  transform: string
  viewBox: string
}

export interface SVGBackupData {
  pathElements: PathBackup[]
  styleBackup: StyleBackup[]
  attributeBackup: AttributeBackup[]
}

export interface PathBackup {
  element: SVGPathElement
  originalPath: string
  originalStyles: { [key: string]: string }
}

export interface StyleBackup {
  element: SVGElement
  originalStyles: { [key: string]: string }
}

export interface AttributeBackup {
  element: SVGElement
  originalAttributes: { [key: string]: string | null }
}

export interface SVGProcessingResult {
  processedElements: ProcessedSVGElement[]
  originalStates: OriginalSVGState[]
  backupData: SVGBackupData
}

export interface OriginalSVGState {
  element: SVGElement
  styles: { [key: string]: string }
  attributes: { [key: string]: string | null }
}

/**
 * SVG导出增强器类
 */
export class SVGExportEnhancer {
  private snapshotCache = new Map<string, SVGSnapshot>()
  private backupCache = new Map<string, SVGBackupData>()

  /**
   * 创建SVG元素状态快照
   * @param element SVG元素
   * @returns SVG快照
   */
  createSVGSnapshot(element: SVGElement): SVGSnapshot {
    const elementId = this.generateElementId(element)

    // 获取SVG内容
    const svgContent = element.outerHTML

    // 获取计算样式
    const computedStyle = window.getComputedStyle(element)
    const styles = this.extractRelevantStyles(computedStyle)

    // 获取transform属性
    const transform = element.getAttribute('transform') || computedStyle.transform || ''

    // 获取viewBox属性
    const viewBox = element.getAttribute('viewBox') || ''

    const snapshot: SVGSnapshot = {
      elementId,
      svgContent,
      styles,
      transform,
      viewBox
    }

    // 缓存快照
    this.snapshotCache.set(elementId, snapshot)

    return snapshot
  }

  /**
   * 批量创建SVG快照
   * @param elements SVG元素数组
   * @returns SVG快照数组
   */
  createSVGSnapshots(elements: SVGElement[]): SVGSnapshot[] {
    return elements.map(element => this.createSVGSnapshot(element))
  }

  /**
   * 创建SVG路径数据备份系统
   * @param canvas 画布元素
   * @returns SVG备份数据
   */
  createSVGBackup(canvas: HTMLElement): SVGBackupData {
    const svgElements = this.detectSVGElements(canvas)
    const backupData: SVGBackupData = {
      pathElements: [],
      styleBackup: [],
      attributeBackup: []
    }

    svgElements.forEach(element => {
      // 备份样式
      const styleBackup: StyleBackup = {
        element,
        originalStyles: this.extractElementStyles(element)
      }
      backupData.styleBackup.push(styleBackup)

      // 备份属性
      const attributeBackup: AttributeBackup = {
        element,
        originalAttributes: this.extractElementAttributes(element)
      }
      backupData.attributeBackup.push(attributeBackup)

      // 如果是路径元素，特别备份路径数据
      if (element.tagName.toLowerCase() === 'path') {
        const pathBackup: PathBackup = {
          element: element as SVGPathElement,
          originalPath: element.getAttribute('d') || '',
          originalStyles: this.extractElementStyles(element)
        }
        backupData.pathElements.push(pathBackup)
      }

      // 处理嵌套的路径元素
      const nestedPaths = element.querySelectorAll('path')
      nestedPaths.forEach(path => {
        const pathBackup: PathBackup = {
          element: path as SVGPathElement,
          originalPath: path.getAttribute('d') || '',
          originalStyles: this.extractElementStyles(path as SVGElement)
        }
        backupData.pathElements.push(pathBackup)
      })
    })

    // 缓存备份数据
    const canvasId = this.generateCanvasId(canvas)
    this.backupCache.set(canvasId, backupData)

    return backupData
  }

  /**
   * 恢复SVG元素的原始状态
   * @param backupData SVG备份数据
   */
  restoreSVGState(backupData: SVGBackupData): void {
    // 恢复路径元素
    backupData.pathElements.forEach(pathBackup => {
      const { element, originalPath, originalStyles } = pathBackup

      // 恢复路径数据
      if (originalPath) {
        element.setAttribute('d', originalPath)
      }

      // 恢复样式
      this.restoreElementStyles(element, originalStyles)
    })

    // 恢复样式备份
    backupData.styleBackup.forEach(styleBackup => {
      const { element, originalStyles } = styleBackup
      this.restoreElementStyles(element, originalStyles)
    })

    // 恢复属性备份
    backupData.attributeBackup.forEach(attributeBackup => {
      const { element, originalAttributes } = attributeBackup
      this.restoreElementAttributes(element, originalAttributes)
    })
  }

  /**
   * 从快照恢复SVG元素
   * @param snapshot SVG快照
   * @param targetElement 目标元素（可选，如果不提供则查找原元素）
   */
  restoreFromSnapshot(snapshot: SVGSnapshot, targetElement?: SVGElement): boolean {
    try {
      let element = targetElement

      if (!element) {
        // 尝试通过ID查找元素
        element = document.querySelector(`[data-snapshot-id="${snapshot.elementId}"]`) as SVGElement

        if (!element) {
          console.warn(`无法找到ID为 ${snapshot.elementId} 的SVG元素`)
          return false
        }
      }

      // 恢复transform属性
      if (snapshot.transform) {
        element.setAttribute('transform', snapshot.transform)
      }

      // 恢复viewBox属性
      if (snapshot.viewBox) {
        element.setAttribute('viewBox', snapshot.viewBox)
      }

      // 恢复样式
      if (snapshot.styles) {
        const styleEntries = snapshot.styles.split(';').filter(s => s.trim())
        styleEntries.forEach(styleEntry => {
          const [property, value] = styleEntry.split(':').map(s => s.trim())
          if (property && value) {
            element!.style.setProperty(property, value)
          }
        })
      }

      return true
    } catch (error) {
      console.error('从快照恢复SVG元素失败:', error)
      return false
    }
  }

  /**
   * 清除所有缓存的快照和备份
   */
  clearCache(): void {
    this.snapshotCache.clear()
    this.backupCache.clear()
  }

  /**
   * 获取缓存的快照
   * @param elementId 元素ID
   * @returns SVG快照或null
   */
  getCachedSnapshot(elementId: string): SVGSnapshot | null {
    return this.snapshotCache.get(elementId) || null
  }

  /**
   * 获取缓存的备份数据
   * @param canvasId 画布ID
   * @returns SVG备份数据或null
   */
  getCachedBackup(canvasId: string): SVGBackupData | null {
    return this.backupCache.get(canvasId) || null
  }

  /**
   * 生成元素唯一ID
   * @param element SVG元素
   * @returns 唯一ID
   */
  private generateElementId(element: SVGElement): string {
    // 尝试使用现有ID
    const existingId = element.id
    if (existingId) {
      return existingId
    }

    // 生成基于元素特征的ID
    const tagName = element.tagName.toLowerCase()
    const rect = element.getBoundingClientRect()
    const timestamp = Date.now()

    return `svg-${tagName}-${Math.round(rect.x)}-${Math.round(rect.y)}-${timestamp}`
  }

  /**
   * 生成画布唯一ID
   * @param canvas 画布元素
   * @returns 唯一ID
   */
  private generateCanvasId(canvas: HTMLElement): string {
    const existingId = canvas.id
    if (existingId) {
      return existingId
    }

    const className = canvas.className || 'canvas'
    const timestamp = Date.now()

    return `canvas-${className.replace(/\s+/g, '-')}-${timestamp}`
  }

  /**
   * 提取相关样式
   * @param computedStyle 计算样式
   * @returns 样式字符串
   */
  private extractRelevantStyles(computedStyle: CSSStyleDeclaration): string {
    const relevantProps = [
      'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-dashoffset',
      'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity',
      'fill-opacity', 'opacity', 'visibility', 'display', 'transform',
      'transform-origin', 'width', 'height'
    ]

    const styles: string[] = []

    relevantProps.forEach(prop => {
      const value = computedStyle.getPropertyValue(prop)
      if (value && value !== 'none' && value !== 'auto' && value !== 'initial') {
        styles.push(`${prop}: ${value}`)
      }
    })

    return styles.join('; ')
  }

  /**
   * 提取元素样式
   * @param element SVG元素
   * @returns 样式对象
   */
  private extractElementStyles(element: SVGElement): { [key: string]: string } {
    const styles: { [key: string]: string } = {}
    const computedStyle = window.getComputedStyle(element)

    const relevantProps = [
      'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-dashoffset',
      'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity',
      'fill-opacity', 'opacity', 'visibility', 'display', 'transform',
      'transform-origin', 'width', 'height'
    ]

    relevantProps.forEach(prop => {
      const inlineValue = element.style.getPropertyValue(prop)
      const computedValue = computedStyle.getPropertyValue(prop)

      // 优先保存内联样式，如果没有则保存计算样式
      if (inlineValue) {
        styles[prop] = inlineValue
      } else if (computedValue && computedValue !== 'none' && computedValue !== 'auto') {
        styles[prop] = computedValue
      }
    })

    return styles
  }

  /**
   * 提取元素属性
   * @param element SVG元素
   * @returns 属性对象
   */
  private extractElementAttributes(element: SVGElement): { [key: string]: string | null } {
    const attributes: { [key: string]: string | null } = {}
    const relevantAttrs = [
      'width', 'height', 'viewBox', 'd', 'transform', 'cx', 'cy', 'r',
      'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'fill', 'stroke',
      'stroke-width', 'stroke-dasharray'
    ]

    relevantAttrs.forEach(attr => {
      attributes[attr] = element.getAttribute(attr)
    })

    return attributes
  }

  /**
   * 恢复元素样式
   * @param element SVG元素
   * @param styles 样式对象
   */
  private restoreElementStyles(element: SVGElement, styles: { [key: string]: string }): void {
    // 清除当前内联样式
    element.removeAttribute('style')

    // 应用保存的样式
    Object.entries(styles).forEach(([property, value]) => {
      if (value) {
        element.style.setProperty(property, value)
      }
    })
  }

  /**
   * 恢复元素属性
   * @param element SVG元素
   * @param attributes 属性对象
   */
  private restoreElementAttributes(element: SVGElement, attributes: { [key: string]: string | null }): void {
    Object.entries(attributes).forEach(([attr, value]) => {
      if (value !== null) {
        element.setAttribute(attr, value)
      } else {
        element.removeAttribute(attr)
      }
    })
  }
  /**
   * 解析CSS变量并替换为实际值
   * @param value CSS属性值
   * @param element 元素（用于获取计算样式）
   * @returns 解析后的值
   */
  private resolveCSSVariables(value: string, element: Element): string {
    if (!value.includes('var(')) {
      return value
    }

    const computedStyle = window.getComputedStyle(element)

    // 匹配CSS变量模式 var(--variable-name, fallback)
    return value.replace(/var\(\s*(--[^,\)]+)\s*(?:,\s*([^)]+))?\s*\)/g, (match, varName, fallback) => {
      const resolvedValue = computedStyle.getPropertyValue(varName.trim())
      return resolvedValue || fallback || match
    })
  }

  /**
   * 将计算样式转换为内联样式
   * @param element SVG元素
   * @returns 内联样式字符串
   */
  convertComputedStylesToInline(element: SVGElement): string {
    const computedStyle = window.getComputedStyle(element)
    const inlineStyles: string[] = []

    // SVG特有的样式属性
    const svgStyleProps = [
      'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-dashoffset',
      'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity',
      'fill-opacity', 'opacity', 'visibility', 'display', 'transform',
      'transform-origin', 'clip-path', 'mask', 'filter'
    ]

    svgStyleProps.forEach(prop => {
      const value = computedStyle.getPropertyValue(prop)
      if (value && value !== 'none' && value !== 'auto' && value !== 'initial') {
        // 解析CSS变量
        const resolvedValue = this.resolveCSSVariables(value, element)
        inlineStyles.push(`${prop}: ${resolvedValue}`)
      }
    })

    return inlineStyles.join('; ')
  }

  /**
   * 处理SVG特有的样式属性
   * @param element SVG元素
   * @param processedElement 处理后的元素信息
   */
  processSVGSpecificStyles(element: SVGElement, processedElement: ProcessedSVGElement): void {
    const computedStyle = window.getComputedStyle(element)

    // 确保stroke样式正确设置
    const stroke = computedStyle.stroke
    if (stroke && stroke !== 'none') {
      const resolvedStroke = this.resolveCSSVariables(stroke, element)
      element.style.stroke = resolvedStroke
      element.setAttribute('stroke', resolvedStroke)
    }

    // 确保fill样式正确设置
    const fill = computedStyle.fill
    if (fill && fill !== 'none') {
      const resolvedFill = this.resolveCSSVariables(fill, element)
      element.style.fill = resolvedFill
      element.setAttribute('fill', resolvedFill)
    }

    // 处理stroke-width
    const strokeWidth = computedStyle.strokeWidth
    if (strokeWidth && strokeWidth !== '0' && strokeWidth !== 'none') {
      const resolvedStrokeWidth = this.resolveCSSVariables(strokeWidth, element)
      element.style.strokeWidth = resolvedStrokeWidth
      element.setAttribute('stroke-width', resolvedStrokeWidth)
    }

    // 处理stroke-dasharray（虚线样式）
    const strokeDasharray = computedStyle.strokeDasharray
    if (strokeDasharray && strokeDasharray !== 'none') {
      const resolvedDasharray = this.resolveCSSVariables(strokeDasharray, element)
      element.style.strokeDasharray = resolvedDasharray
      element.setAttribute('stroke-dasharray', resolvedDasharray)
    }

    // 处理opacity
    const opacity = computedStyle.opacity
    if (opacity && opacity !== '1') {
      element.style.opacity = opacity
      element.setAttribute('opacity', opacity)
    }

    // 处理transform
    const transform = computedStyle.transform
    if (transform && transform !== 'none') {
      element.style.transform = transform
      element.setAttribute('transform', transform)
    }

    // 更新处理后的内联样式
    processedElement.inlinedStyles = this.convertComputedStylesToInline(element)
  }

  /**
   * 应用样式内联转换到所有处理过的元素
   * @param processedElements 处理过的SVG元素数组
   */
  applyStyleInlining(processedElements: ProcessedSVGElement[]): void {
    processedElements.forEach(processedElement => {
      const { element } = processedElement

      // 处理主元素
      this.processSVGSpecificStyles(element, processedElement)

      // 处理子元素（如path、circle、line等）
      const childElements = element.querySelectorAll('path, circle, line, rect, ellipse, polygon, polyline, text')
      childElements.forEach(child => {
        if (child instanceof SVGElement) {
          const childProcessed: ProcessedSVGElement = {
            element: child,
            originalStyles: {},
            inlinedStyles: '',
            pathData: '',
            boundingBox: this.calculateBoundingBox(child),
            isVisible: this.isElementVisible(child)
          }
          this.processSVGSpecificStyles(child, childProcessed)
        }
      })
    })
  }
  /**
   * 检测画布中的所有SVG元素
   * @param canvas 画布元素
   * @returns SVG元素数组
   */
  detectSVGElements(canvas: HTMLElement): SVGElement[] {
    const svgElements: SVGElement[] = []

    // 查找所有SVG元素
    const svgs = canvas.querySelectorAll('svg')
    svgs.forEach(svg => {
      if (svg instanceof SVGElement) {
        svgElements.push(svg)
      }
    })

    // 查找嵌套在其他元素中的SVG
    const allElements = canvas.querySelectorAll('*')
    allElements.forEach(element => {
      if (element.tagName.toLowerCase() === 'svg' && !svgElements.includes(element as SVGElement)) {
        svgElements.push(element as SVGElement)
      }
    })

    return svgElements
  }

  /**
   * 验证SVG元素的可见性
   * @param element SVG元素
   * @returns 是否可见
   */
  isElementVisible(element: SVGElement): boolean {
    const computedStyle = window.getComputedStyle(element)
    const rect = element.getBoundingClientRect()

    // 检查基本可见性条件
    if (computedStyle.display === 'none' ||
        computedStyle.visibility === 'hidden' ||
        computedStyle.opacity === '0') {
      return false
    }

    // 检查尺寸
    if (rect.width === 0 || rect.height === 0) {
      return false
    }

    // 检查是否在视口外（但仍然需要导出）
    // 这里我们认为即使在视口外的元素也是"可见"的，因为需要导出
    return true
  }

  /**
   * 计算SVG元素的边界框
   * @param element SVG元素
   * @returns 边界框信息
   */
  calculateBoundingBox(element: SVGElement): DOMRect {
    try {
      // 尝试使用SVG的getBBox方法获取更准确的边界框
      if ('getBBox' in element && typeof element.getBBox === 'function') {
        const bbox = element.getBBox()
        return new DOMRect(bbox.x, bbox.y, bbox.width, bbox.height)
      }
    } catch (error) {
      // 如果getBBox失败，使用getBoundingClientRect作为后备
      console.warn('Failed to get SVG bounding box, using fallback:', error)
    }

    return element.getBoundingClientRect()
  }

  /**
   * 预处理SVG元素
   * @param element SVG元素
   * @returns 处理后的SVG元素信息
   */
  preprocessSVGElement(element: SVGElement): ProcessedSVGElement {
    const originalStyles: { [key: string]: string } = {}
    const computedStyle = window.getComputedStyle(element)

    // 保存重要的样式属性
    const importantStyleProps = [
      'display', 'visibility', 'opacity', 'fill', 'stroke',
      'stroke-width', 'stroke-dasharray', 'transform',
      'width', 'height', 'viewBox'
    ]

    importantStyleProps.forEach(prop => {
      originalStyles[prop] = element.style.getPropertyValue(prop) || computedStyle.getPropertyValue(prop)
    })

    // 获取路径数据
    let pathData = ''
    if (element.tagName.toLowerCase() === 'path') {
      pathData = (element as SVGPathElement).getAttribute('d') || ''
    } else {
      // 对于其他SVG元素，查找内部的path元素
      const paths = element.querySelectorAll('path')
      pathData = Array.from(paths).map(path => path.getAttribute('d') || '').join(' ')
    }

    return {
      element,
      originalStyles,
      inlinedStyles: '', // 将在样式内联阶段填充
      pathData,
      boundingBox: this.calculateBoundingBox(element),
      isVisible: this.isElementVisible(element)
    }
  }

  /**
   * 预处理画布中的所有SVG元素
   * @param canvas 画布元素
   * @returns 处理结果
   */
  prepareSVGForExport(canvas: HTMLElement): SVGProcessingResult {
    const svgElements = this.detectSVGElements(canvas)
    const processedElements: ProcessedSVGElement[] = []
    const originalStates: OriginalSVGState[] = []

    // 使用新的备份系统创建完整备份
    const backupData = this.createSVGBackup(canvas)

    // 为每个SVG元素创建快照
    const snapshots = this.createSVGSnapshots(svgElements)

    svgElements.forEach((element, index) => {
      // 预处理元素
      const processed = this.preprocessSVGElement(element)
      processedElements.push(processed)

      // 保存原始状态（使用快照数据）
      const snapshot = snapshots[index]
      const originalState: OriginalSVGState = {
        element,
        styles: { ...processed.originalStyles },
        attributes: {}
      }

      // 保存重要属性
      const importantAttrs = ['width', 'height', 'viewBox', 'd', 'transform']
      importantAttrs.forEach(attr => {
        originalState.attributes[attr] = element.getAttribute(attr)
      })

      originalStates.push(originalState)

      // 为元素添加快照ID，便于后续恢复
      element.setAttribute('data-snapshot-id', snapshot.elementId)
    })

    return {
      processedElements,
      originalStates,
      backupData
    }
  }

  /**
   * 恢复SVG处理结果的原始状态
   * @param processingResult SVG处理结果
   */
  restoreProcessingResult(processingResult: SVGProcessingResult): void {
    // 使用备份数据恢复状态
    this.restoreSVGState(processingResult.backupData)

    // 清除快照ID属性
    processingResult.processedElements.forEach(processed => {
      processed.element.removeAttribute('data-snapshot-id')
    })
  }

  /**
   * 获取缓存统计信息
   * @returns 缓存统计
   */
  getCacheStats(): { snapshots: number; backups: number } {
    return {
      snapshots: this.snapshotCache.size,
      backups: this.backupCache.size
    }
  }
}
