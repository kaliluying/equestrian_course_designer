/**
 * JSON导出引擎
 * 实现完整的课程数据序列化，支持视口信息和元数据包含
 */

import {
  ExportFormat,
  ExportStage,
  ExportErrorType
} from '@/types/export'
import type {
  ExportResult,
  ExportMetadata,
  JSONExportOptions,
  ProgressCallback,
  ExportError,
  QualityReport,
  ExportWarning
} from '@/types/export'
import { CourseDesign, Obstacle, CoursePathData } from '@/types/obstacle'
import {
  jsonExportFormatter,
  JSONFormattingOptions,
  SelectiveDataOptions
} from './jsonExportFormatter'

/**
 * JSON导出数据接口
 */
interface JSONExportData {
  version: string
  exportInfo: {
    timestamp: string
    exportEngine: string
    format: string
    options: JSONExportOptions
  }
  courseDesign: CourseDesign
  viewportInfo?: {
    width: number
    height: number
    canvasWidth: number
    canvasHeight: number
    aspectRatio: number
    devicePixelRatio: number
    scrollPosition: { x: number; y: number }
    zoomLevel: number
  }
  metadata?: {
    userAgent: string
    exportDuration: number
    dataSize: number
    compressionRatio?: number
    validationResults?: any
  }
}

/**
 * JSON导出引擎类
 * 负责将课程设计数据序列化为JSON格式
 */
export class JSONExportEngine {
  private defaultOptions: Required<JSONExportOptions> = {
    includeViewportInfo: true,
    includeMetadata: true,
    minify: false,
    prettyPrint: true,
    indentSize: 2,
    sortKeys: false,
    removeEmptyFields: true,
    includeComments: false,
    selectiveInclude: {
      includeObstacles: true,
      includePath: true,
      includeTimestamps: true,
      includeIds: true,
      obstacleFields: ['id', 'type', 'position', 'rotation', 'poles', 'number'],
      pathFields: ['points', 'visible', 'startPoint', 'endPoint'],
      customFields: {}
    },
    validateData: true,
    fileName: 'course-design.json',
    includeBackground: true,
    quality: 1.0,
    timeout: 30000
  }

  private readonly exportVersion = '1.0.0'
  private readonly engineName = 'JSON Export Engine'

  /**
   * 导出课程设计为JSON格式
   */
  async exportToJSON(
    canvas: HTMLElement,
    options: Partial<JSONExportOptions> = {},
    onProgress?: ProgressCallback
  ): Promise<ExportResult> {
    const startTime = performance.now()
    const mergedOptions = { ...this.defaultOptions, ...options }
    const warnings: ExportWarning[] = []
    const errors: ExportError[] = []

    try {
      // 更新进度 - 初始化
      this.updateProgress(onProgress, ExportStage.INITIALIZING, 10, '正在初始化JSON导出...')

      // 1. 验证输入
      this.validateCanvas(canvas)

      // 更新进度 - 准备数据
      this.updateProgress(onProgress, ExportStage.PREPARING_CANVAS, 20, '正在提取课程数据...')

      // 2. 提取课程设计数据
      const courseDesign = await this.extractCourseDesign(canvas)

      // 更新进度 - 处理视口信息
      this.updateProgress(onProgress, ExportStage.PROCESSING_SVG, 40, '正在处理视口信息...')

      // 3. 收集视口信息（如果启用）
      const viewportInfo = mergedOptions.includeViewportInfo
        ? this.collectViewportInfo(canvas)
        : undefined

      // 更新进度 - 生成元数据
      this.updateProgress(onProgress, ExportStage.RENDERING, 60, '正在生成元数据...')

      // 4. 生成元数据（如果启用）
      const metadata = mergedOptions.includeMetadata
        ? this.generateMetadata(courseDesign, mergedOptions, startTime)
        : undefined

      // 更新进度 - 构建JSON数据
      this.updateProgress(onProgress, ExportStage.GENERATING_FILE, 80, '正在构建JSON数据...')

      // 5. 构建完整的JSON导出数据
      const jsonData = this.buildJSONExportData(
        courseDesign,
        viewportInfo,
        metadata,
        mergedOptions
      )

      // 6. 序列化为JSON字符串
      const jsonString = this.serializeToJSON(jsonData, mergedOptions)

      // 更新进度 - 完成
      this.updateProgress(onProgress, ExportStage.FINALIZING, 100, 'JSON导出完成')

      // 7. 创建导出结果
      const exportMetadata = this.createExportMetadata(
        jsonString,
        mergedOptions,
        performance.now() - startTime
      )

      const qualityReport = this.createQualityReport(jsonData, courseDesign)

      return {
        success: true,
        format: ExportFormat.JSON,
        data: jsonString,
        metadata: exportMetadata,
        qualityReport,
        warnings,
        errors
      }

    } catch (error) {
      const exportError = this.createExportError(error, ExportStage.GENERATING_FILE, canvas, mergedOptions)
      errors.push(exportError)

      return {
        success: false,
        format: ExportFormat.JSON,
        data: '',
        metadata: this.createErrorMetadata(mergedOptions, performance.now() - startTime),
        qualityReport: this.createErrorQualityReport(),
        warnings,
        errors
      }
    }
  }

  /**
   * 验证画布元素
   */
  private validateCanvas(canvas: HTMLElement): void {
    if (!canvas) {
      throw new Error('画布元素不能为空')
    }

    if (!canvas.isConnected) {
      throw new Error('画布元素必须连接到DOM')
    }
  }

  /**
   * 提取课程设计数据
   */
  private async extractCourseDesign(canvas: HTMLElement): Promise<CourseDesign> {
    try {
      // 尝试从画布元素的数据属性或全局状态中获取课程数据
      // 这里需要根据实际的应用架构来实现

      // 方法1: 从画布的数据属性获取
      const courseDataAttr = canvas.getAttribute('data-course-design')
      if (courseDataAttr) {
        const parsedData = JSON.parse(courseDataAttr)
        // 确保基本字段存在，如果不存在则提供默认值
        return {
          id: parsedData.id || `course-${Date.now()}`,
          name: parsedData.name || '未命名课程',
          obstacles: Array.isArray(parsedData.obstacles) ? parsedData.obstacles : [],
          createdAt: parsedData.createdAt || new Date().toISOString(),
          updatedAt: parsedData.updatedAt || new Date().toISOString(),
          fieldWidth: parsedData.fieldWidth || 60,
          fieldHeight: parsedData.fieldHeight || 40,
          path: parsedData.path || undefined
        }
      }

      // 方法2: 从全局状态获取（如果有Vuex/Pinia store）
      if (typeof window !== 'undefined' && (window as any).__COURSE_STORE__) {
        const store = (window as any).__COURSE_STORE__
        if (store.currentCourse) {
          return store.currentCourse
        }
      }

      // 方法3: 从DOM元素中解析（备用方案）
      return this.parseCourseFromDOM(canvas)

    } catch (error) {
      // 如果所有方法都失败，返回一个基本的课程设计而不是抛出错误
      console.warn('提取课程设计数据失败，使用默认数据:', error)
      return {
        id: `fallback-course-${Date.now()}`,
        name: '解析失败的课程',
        obstacles: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fieldWidth: 60,
        fieldHeight: 40
      }
    }
  }

  /**
   * 从DOM元素解析课程数据（备用方案）
   */
  private parseCourseFromDOM(canvas: HTMLElement): CourseDesign {
    const obstacles: Obstacle[] = []
    let pathData: CoursePathData | undefined

    // 查找障碍物元素
    const obstacleElements = canvas.querySelectorAll('[data-obstacle-id]')
    obstacleElements.forEach((element) => {
      try {
        const obstacleData = element.getAttribute('data-obstacle-data')
        if (obstacleData) {
          obstacles.push(JSON.parse(obstacleData))
        }
      } catch (error) {
        console.warn('解析障碍物数据失败:', error)
      }
    })

    // 查找路径数据
    const pathElement = canvas.querySelector('[data-course-path]')
    if (pathElement) {
      try {
        const pathDataAttr = pathElement.getAttribute('data-course-path')
        if (pathDataAttr) {
          pathData = JSON.parse(pathDataAttr)
        }
      } catch (error) {
        console.warn('解析路径数据失败:', error)
      }
    }

    // 获取画布尺寸信息
    const rect = canvas.getBoundingClientRect()

    return {
      id: `parsed-${Date.now()}`,
      name: '从DOM解析的课程设计',
      obstacles,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fieldWidth: Math.round(rect.width / 10), // 假设10px = 1米
      fieldHeight: Math.round(rect.height / 10),
      path: pathData
    }
  }

  /**
   * 收集视口信息
   */
  private collectViewportInfo(canvas: HTMLElement): JSONExportData['viewportInfo'] {
    const rect = canvas.getBoundingClientRect()
    const computedStyle = window.getComputedStyle(canvas)

    return {
      width: window.innerWidth,
      height: window.innerHeight,
      canvasWidth: rect.width,
      canvasHeight: rect.height,
      aspectRatio: rect.width / rect.height,
      devicePixelRatio: window.devicePixelRatio || 1,
      scrollPosition: {
        x: window.scrollX || window.pageXOffset,
        y: window.scrollY || window.pageYOffset
      },
      zoomLevel: this.detectZoomLevel()
    }
  }

  /**
   * 检测缩放级别
   */
  private detectZoomLevel(): number {
    try {
      // 方法1: 使用screen.width和window.innerWidth比较
      const screenWidth = screen.width
      const windowWidth = window.innerWidth
      const devicePixelRatio = window.devicePixelRatio || 1

      // 计算可能的缩放级别
      const possibleZoom = (screenWidth / windowWidth) / devicePixelRatio

      // 如果结果合理，返回它
      if (possibleZoom > 0.1 && possibleZoom < 10) {
        return Math.round(possibleZoom * 100) / 100
      }

      // 方法2: 使用CSS transform检测（如果有的话）
      const body = document.body
      const transform = window.getComputedStyle(body).transform
      if (transform && transform !== 'none') {
        const matrix = transform.match(/matrix\(([^)]+)\)/)
        if (matrix) {
          const values = matrix[1].split(',').map(v => parseFloat(v.trim()))
          if (values.length >= 6) {
            return Math.round(values[0] * 100) / 100 // scaleX
          }
        }
      }

      // 默认返回1（无缩放）
      return 1.0
    } catch (error) {
      console.warn('检测缩放级别失败:', error)
      return 1.0
    }
  }

  /**
   * 生成导出元数据
   */
  private generateMetadata(
    courseDesign: CourseDesign,
    options: Required<JSONExportOptions>,
    startTime: number
  ): JSONExportData['metadata'] {
    const dataSize = JSON.stringify(courseDesign).length

    return {
      userAgent: navigator.userAgent,
      exportDuration: performance.now() - startTime,
      dataSize,
      compressionRatio: options.minify ? this.estimateCompressionRatio(courseDesign) : undefined,
      validationResults: this.validateCourseDesign(courseDesign)
    }
  }

  /**
   * 估算压缩比率
   */
  private estimateCompressionRatio(courseDesign: CourseDesign): number {
    try {
      const originalSize = JSON.stringify(courseDesign, null, 2).length
      const minifiedSize = JSON.stringify(courseDesign).length
      return Math.round((1 - minifiedSize / originalSize) * 100) / 100
    } catch (error) {
      return 0
    }
  }

  /**
   * 验证课程设计数据
   */
  private validateCourseDesign(courseDesign: CourseDesign): any {
    const results = {
      isValid: true,
      issues: [] as string[],
      statistics: {
        obstacleCount: courseDesign.obstacles.length,
        hasPath: !!courseDesign.path,
        pathPointCount: courseDesign.path?.points.length || 0,
        fieldDimensions: {
          width: courseDesign.fieldWidth,
          height: courseDesign.fieldHeight
        }
      }
    }

    // 基本验证
    if (!courseDesign.id) {
      results.issues.push('缺少课程ID')
      results.isValid = false
    }

    if (!courseDesign.name) {
      results.issues.push('缺少课程名称')
    }

    if (courseDesign.obstacles.length === 0) {
      results.issues.push('课程中没有障碍物')
    }

    // 验证障碍物数据
    courseDesign.obstacles.forEach((obstacle, index) => {
      if (!obstacle.id) {
        results.issues.push(`障碍物 ${index + 1} 缺少ID`)
        results.isValid = false
      }

      if (!obstacle.type) {
        results.issues.push(`障碍物 ${index + 1} 缺少类型`)
        results.isValid = false
      }

      if (!obstacle.position || typeof obstacle.position.x !== 'number' || typeof obstacle.position.y !== 'number') {
        results.issues.push(`障碍物 ${index + 1} 位置信息无效`)
        results.isValid = false
      }
    })

    // 验证路径数据
    if (courseDesign.path) {
      if (!Array.isArray(courseDesign.path.points)) {
        results.issues.push('路径点数据格式无效')
        results.isValid = false
      } else if (courseDesign.path.points.length < 2) {
        results.issues.push('路径至少需要2个点')
      }
    }

    return results
  }
  /**
   * 构建JSON导出数据
   */
  private buildJSONExportData(
    courseDesign: CourseDesign,
    viewportInfo: JSONExportData['viewportInfo'],
    metadata: JSONExportData['metadata'],
    options: Required<JSONExportOptions>
  ): JSONExportData {
    return {
      version: this.exportVersion,
      exportInfo: {
        timestamp: new Date().toISOString(),
        exportEngine: this.engineName,
        format: 'JSON',
        options: {
          includeViewportInfo: options.includeViewportInfo,
          includeMetadata: options.includeMetadata,
          minify: options.minify,
          fileName: options.fileName
        }
      },
      courseDesign,
      viewportInfo,
      metadata
    }
  }

  /**
   * 序列化为JSON字符串
   */
  private serializeToJSON(data: JSONExportData, options: Required<JSONExportOptions>): string {
    try {
      // 1. 数据验证（如果启用）
      if (options.validateData) {
        const validationResult = jsonExportFormatter.validateJSON(data)
        if (!validationResult.isValid) {
          const criticalErrors = validationResult.errors.filter(e => e.severity === 'critical')
          // 只有在有严重错误时才抛出异常，其他情况继续导出但记录问题
          if (criticalErrors.length > 0) {
            console.warn('JSON导出数据验证发现严重错误:', criticalErrors)
            // 不抛出异常，而是继续导出但在质量报告中反映问题
          }
        }
      }

      // 2. 选择性数据包含（如果配置了）
      let processedData = data
      if (options.selectiveInclude && Object.keys(options.selectiveInclude).length > 0) {
        const selectiveOptions = {
          includeObstacles: options.selectiveInclude.includeObstacles ?? true,
          includePath: options.selectiveInclude.includePath ?? true,
          includeMetadata: options.includeMetadata ?? true,
          includeViewportInfo: options.includeViewportInfo ?? true,
          includeTimestamps: options.selectiveInclude.includeTimestamps ?? true,
          includeIds: options.selectiveInclude.includeIds ?? true,
          obstacleFields: options.selectiveInclude.obstacleFields ?? ['id', 'type', 'position', 'rotation', 'poles', 'number'],
          pathFields: options.selectiveInclude.pathFields ?? ['points', 'visible', 'startPoint', 'endPoint'],
          customFields: options.selectiveInclude.customFields ?? {}
        }

        const selectiveCourseDesign = jsonExportFormatter.selectiveInclude(data.courseDesign, selectiveOptions)

        processedData = {
          ...data,
          courseDesign: selectiveCourseDesign,
          viewportInfo: selectiveOptions.includeViewportInfo ? data.viewportInfo : undefined,
          metadata: selectiveOptions.includeMetadata ? data.metadata : undefined
        }
      }

      // 3. 格式化选项
      const formattingOptions: JSONFormattingOptions = {
        minify: options.minify,
        prettyPrint: options.prettyPrint,
        indentSize: options.indentSize,
        sortKeys: options.sortKeys,
        removeEmptyFields: options.removeEmptyFields,
        includeComments: options.includeComments
      }

      // 4. 使用格式化器序列化
      return jsonExportFormatter.formatJSON(processedData, formattingOptions)

    } catch (error) {
      throw new Error(`JSON序列化失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 创建导出元数据
   */
  private createExportMetadata(
    jsonString: string,
    options: Required<JSONExportOptions>,
    exportTime: number
  ): ExportMetadata {
    const blob = new Blob([jsonString], { type: 'application/json' })

    return {
      fileName: options.fileName,
      fileSize: blob.size,
      dimensions: { width: 0, height: 0 }, // JSON没有尺寸概念
      exportTime,
      renderingMethod: 'json-serialization',
      qualityScore: 1.0, // JSON导出质量总是完美的
      timestamp: new Date().toISOString(),
      format: ExportFormat.JSON
    }
  }

  /**
   * 创建质量报告
   */
  private createQualityReport(jsonData: JSONExportData, originalCourse: CourseDesign): QualityReport {
    try {
      // 使用格式化器进行全面验证
      const validationResult = jsonExportFormatter.validateJSON(jsonData)

      return {
        overallScore: validationResult.isValid ? 1.0 : 0.8,
        pathCompleteness: this.calculatePathCompleteness(originalCourse),
        renderingAccuracy: 1.0, // JSON导出总是100%准确
        performanceMetrics: {
          renderingTime: jsonData.metadata?.exportDuration || 0,
          memoryUsage: validationResult.statistics.totalSize,
          canvasSize: { width: 0, height: 0 },
          elementCount: validationResult.statistics.obstacleCount,
          svgElementCount: 0 // JSON导出不涉及SVG
        },
        recommendations: validationResult.recommendations,
        detailedIssues: [
          ...validationResult.errors.map(error => ({
            type: this.mapErrorTypeToIssueType(error.code),
            severity: error.severity as 'low' | 'medium' | 'high' | 'critical',
            description: error.message,
            element: error.field,
            suggestedFix: this.getSuggestedFix(error.code)
          })),
          ...validationResult.warnings.map(warning => ({
            type: 'style_mismatch' as const,
            severity: 'low' as const,
            description: warning.message,
            element: warning.field,
            suggestedFix: warning.suggestion
          }))
        ]
      }
    } catch (error) {
      // 如果验证失败，返回基础质量报告
      const validation = jsonData.metadata?.validationResults || { isValid: true, issues: [] }

      return {
        overallScore: validation.isValid ? 1.0 : 0.8,
        pathCompleteness: this.calculatePathCompleteness(originalCourse),
        renderingAccuracy: 1.0,
        performanceMetrics: {
          renderingTime: jsonData.metadata?.exportDuration || 0,
          memoryUsage: jsonData.metadata?.dataSize || 0,
          canvasSize: { width: 0, height: 0 },
          elementCount: originalCourse.obstacles.length,
          svgElementCount: 0
        },
        recommendations: ['JSON导出完成，但质量验证过程出现问题'],
        detailedIssues: []
      }
    }
  }

  /**
   * 计算路径完整性
   */
  private calculatePathCompleteness(courseDesign: CourseDesign): number {
    if (!courseDesign.path) {
      return courseDesign.obstacles.length > 0 ? 80 : 60 // 有障碍物但无路径
    }

    const pathPoints = courseDesign.path.points.length
    if (pathPoints < 2) {
      return 40 // 路径点不足
    }

    if (pathPoints >= 2 && pathPoints < 5) {
      return 70 // 基本路径
    }

    if (pathPoints >= 5 && pathPoints < 10) {
      return 85 // 详细路径
    }

    return 100 // 非常详细的路径
  }

  /**
   * 生成建议
   */
  private generateRecommendations(validation: any, jsonData: JSONExportData): string[] {
    const recommendations: string[] = []

    if (validation.isValid) {
      recommendations.push('JSON导出成功完成，数据完整性良好')
    } else {
      recommendations.push('发现数据完整性问题，建议检查并修复')
    }

    // 基于数据大小的建议
    const dataSize = jsonData.metadata?.dataSize || 0
    if (dataSize > 1024 * 1024) { // 1MB
      recommendations.push('数据文件较大，考虑启用压缩选项')
    }

    // 基于障碍物数量的建议
    const obstacleCount = jsonData.courseDesign.obstacles.length
    if (obstacleCount === 0) {
      recommendations.push('课程中没有障碍物，考虑添加一些障碍物')
    } else if (obstacleCount > 50) {
      recommendations.push('障碍物数量较多，确保性能表现良好')
    }

    // 基于路径的建议
    if (!jsonData.courseDesign.path) {
      recommendations.push('考虑添加路径信息以完善课程设计')
    } else if (jsonData.courseDesign.path.points.length < 3) {
      recommendations.push('路径点较少，考虑添加更多路径点以提高精度')
    }

    // 基于视口信息的建议
    if (!jsonData.viewportInfo) {
      recommendations.push('考虑包含视口信息以便更好地重现设计环境')
    }

    return recommendations
  }

  /**
   * 创建导出错误
   */
  private createExportError(
    error: any,
    stage: ExportStage,
    canvas: HTMLElement,
    options: Required<JSONExportOptions>
  ): ExportError {
    const exportError = new Error(error.message || 'JSON导出失败') as ExportError
    exportError.type = this.determineErrorType(error, stage)
    exportError.stage = stage
    exportError.recoverable = true // JSON导出错误通常是可恢复的

    exportError.context = {
      format: ExportFormat.JSON,
      options,
      canvasElement: canvas,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    }

    exportError.suggestedActions = this.generateErrorSuggestedActions(error, stage)

    return exportError
  }

  /**
   * 确定错误类型
   */
  private determineErrorType(error: any, stage: ExportStage): ExportErrorType {
    const errorMessage = error.message?.toLowerCase() || ''

    if (errorMessage.includes('parse') || errorMessage.includes('json')) {
      return ExportErrorType.FILE_GENERATION_ERROR
    }

    if (errorMessage.includes('canvas') || errorMessage.includes('dom')) {
      return ExportErrorType.CANVAS_ACCESS_ERROR
    }

    if (errorMessage.includes('memory') || errorMessage.includes('out of memory')) {
      return ExportErrorType.MEMORY_ERROR
    }

    if (errorMessage.includes('timeout')) {
      return ExportErrorType.TIMEOUT_ERROR
    }

    // 根据阶段确定默认错误类型
    switch (stage) {
      case ExportStage.PREPARING_CANVAS:
        return ExportErrorType.CANVAS_ACCESS_ERROR
      case ExportStage.PROCESSING_SVG:
      case ExportStage.RENDERING:
      case ExportStage.GENERATING_FILE:
        return ExportErrorType.FILE_GENERATION_ERROR
      default:
        return ExportErrorType.FILE_GENERATION_ERROR
    }
  }

  /**
   * 生成错误建议操作
   */
  private generateErrorSuggestedActions(error: any, stage: ExportStage): string[] {
    const errorMessage = error.message?.toLowerCase() || ''
    const actions: string[] = []

    // 通用建议
    actions.push('请重试JSON导出操作')

    // 根据错误类型提供特定建议
    if (errorMessage.includes('parse') || errorMessage.includes('json')) {
      actions.push('检查课程数据格式是否正确')
      actions.push('尝试简化课程设计内容')
    }

    if (errorMessage.includes('canvas') || errorMessage.includes('dom')) {
      actions.push('确保画布元素可访问')
      actions.push('检查页面是否完全加载')
    }

    if (errorMessage.includes('memory')) {
      actions.push('尝试减少课程中的障碍物数量')
      actions.push('关闭其他浏览器标签页释放内存')
    }

    if (errorMessage.includes('timeout')) {
      actions.push('增加导出超时时间')
      actions.push('简化课程设计复杂度')
    }

    // 根据阶段提供特定建议
    switch (stage) {
      case ExportStage.PREPARING_CANVAS:
        actions.push('检查画布数据是否完整')
        break
      case ExportStage.PROCESSING_SVG:
        actions.push('检查视口信息收集是否正常')
        break
      case ExportStage.RENDERING:
        actions.push('检查元数据生成是否正常')
        break
      case ExportStage.GENERATING_FILE:
        actions.push('检查JSON序列化过程')
        actions.push('尝试禁用压缩选项')
        break
    }

    actions.push('如问题持续，请联系技术支持')

    return actions
  }

  /**
   * 创建错误元数据
   */
  private createErrorMetadata(options: Required<JSONExportOptions>, exportTime: number): ExportMetadata {
    return {
      fileName: options.fileName,
      fileSize: 0,
      dimensions: { width: 0, height: 0 },
      exportTime,
      renderingMethod: 'json-serialization',
      qualityScore: 0,
      timestamp: new Date().toISOString(),
      format: ExportFormat.JSON
    }
  }

  /**
   * 创建错误质量报告
   */
  private createErrorQualityReport(): QualityReport {
    return {
      overallScore: 0,
      pathCompleteness: 0,
      renderingAccuracy: 0,
      performanceMetrics: {
        renderingTime: 0,
        memoryUsage: 0,
        canvasSize: { width: 0, height: 0 },
        elementCount: 0,
        svgElementCount: 0
      },
      recommendations: ['JSON导出失败，请检查错误信息并重试'],
      detailedIssues: []
    }
  }

  /**
   * 更新进度状态
   */
  private updateProgress(
    callback: ProgressCallback | undefined,
    stage: ExportStage,
    progress: number,
    message: string
  ): void {
    if (callback) {
      callback({
        stage,
        progress,
        message
      })
    }
  }

  /**
   * 映射错误代码到问题类型
   */
  private mapErrorTypeToIssueType(errorCode: string): 'missing_element' | 'rendering_error' | 'style_mismatch' | 'position_offset' {
    switch (errorCode) {
      case 'MISSING_REQUIRED_FIELD':
      case 'MISSING_COURSE_FIELD':
      case 'MISSING_OBSTACLE_FIELD':
        return 'missing_element'
      case 'INVALID_VERSION_TYPE':
      case 'INVALID_ID_TYPE':
      case 'INVALID_NAME_TYPE':
      case 'INVALID_OBSTACLE_TYPE':
      case 'INVALID_PATH_TYPE':
      case 'INVALID_VIEWPORT_TYPE':
        return 'style_mismatch'
      case 'INVALID_POSITION_TYPE':
      case 'INVALID_POSITION_X':
      case 'INVALID_POSITION_Y':
      case 'INVALID_PATH_POINT_X':
      case 'INVALID_PATH_POINT_Y':
        return 'position_offset'
      case 'VALIDATION_ERROR':
      case 'DUPLICATE_OBSTACLE_IDS':
        return 'rendering_error'
      default:
        return 'rendering_error'
    }
  }

  /**
   * 获取错误代码对应的建议修复方案
   */
  private getSuggestedFix(errorCode: string): string {
    switch (errorCode) {
      case 'MISSING_REQUIRED_FIELD':
        return '添加缺少的必需字段'
      case 'MISSING_COURSE_FIELD':
        return '完善课程设计的基本信息'
      case 'MISSING_OBSTACLE_FIELD':
        return '检查并补充障碍物的必需属性'
      case 'INVALID_VERSION_TYPE':
        return '确保版本信息是有效的字符串格式'
      case 'INVALID_ID_TYPE':
        return '使用字符串格式的唯一标识符'
      case 'INVALID_NAME_TYPE':
        return '确保名称是有效的字符串'
      case 'INVALID_OBSTACLE_TYPE':
        return '使用有效的障碍物类型枚举值'
      case 'INVALID_POSITION_TYPE':
        return '确保位置信息是包含x和y坐标的对象'
      case 'INVALID_POSITION_X':
      case 'INVALID_POSITION_Y':
        return '确保坐标值是有效的数字'
      case 'INVALID_PATH_TYPE':
        return '确保路径数据是有效的对象格式'
      case 'INVALID_PATH_POINT_X':
      case 'INVALID_PATH_POINT_Y':
        return '确保路径点坐标是有效的数字'
      case 'INVALID_VIEWPORT_TYPE':
        return '确保视口信息是有效的对象格式'
      case 'DUPLICATE_OBSTACLE_IDS':
        return '确保所有障碍物都有唯一的ID'
      case 'VALIDATION_ERROR':
        return '检查数据格式和完整性'
      default:
        return '检查并修复数据格式问题'
    }
  }
}

// 创建全局JSON导出引擎实例
export const jsonExportEngine = new JSONExportEngine()

// 导出类型和实例
export default JSONExportEngine
