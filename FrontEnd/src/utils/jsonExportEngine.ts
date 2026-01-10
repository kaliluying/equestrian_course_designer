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
import type { CourseDesign, Obstacle, CoursePathData } from '@/types/obstacle'
import type {
  JSONFormattingOptions,
  SelectiveDataOptions
} from './jsonExportFormatter'
import { jsonExportFormatter } from './jsonExportFormatter'

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
      obstacleFields: [
        'id',
        'type',
        'position',
        'rotation',
        'poles',
        'number',
        'numberPosition',
        'customId',
        'decorationProperties',
        'wallProperties',
        'liverpoolProperties',
        'waterProperties'
      ],
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
   * 使用多级降级策略：Pinia Store → data属性 → DOM解析
   */
  private async extractCourseDesign(canvas: HTMLElement): Promise<CourseDesign> {
    try {
      // 方法1: 直接从Pinia Store获取（优先级最高）
      try {
        const { useCourseStore } = await import('@/stores/course')
        const courseStore = useCourseStore()

        if (courseStore) {
          // 优先使用getCompleteDesign方法获取完整数据（包含路径）
          if (typeof courseStore.getCompleteDesign === 'function') {
            const completeDesign = courseStore.getCompleteDesign()
            console.log('从Pinia Store的getCompleteDesign方法获取课程数据', completeDesign)
            return completeDesign
          }

          // 备用：直接访问currentCourse
          if (courseStore.currentCourse) {
            console.log('从Pinia Store的currentCourse获取课程数据', courseStore.currentCourse)
            // 手动整合路径数据
            const design: CourseDesign = { ...courseStore.currentCourse }
            if (courseStore.coursePath?.visible && courseStore.coursePath.points.length > 0) {
              design.path = {
                visible: courseStore.coursePath.visible,
                points: courseStore.coursePath.points,
                startPoint: courseStore.startPoint,
                endPoint: courseStore.endPoint
              }
            }
            return design
          }
        }
      } catch (storeError) {
        console.warn('无法访问Pinia Store:', storeError)
      }

      // 方法1.5: 从全局变量获取（备用方案）
      if (typeof window !== 'undefined' && (window as any).__COURSE_STORE__) {
        const store = (window as any).__COURSE_STORE__
        if (typeof store.getCompleteDesign === 'function') {
          const completeDesign = store.getCompleteDesign()
          console.log('从全局__COURSE_STORE__的getCompleteDesign方法获取课程数据', completeDesign)
          return completeDesign
        }
        if (store.currentCourse) {
          console.log('从全局__COURSE_STORE__的currentCourse获取课程数据', store.currentCourse)
          // 手动整合路径数据
          const design: CourseDesign = { ...store.currentCourse }
          if (store.coursePath?.visible && store.coursePath.points.length > 0) {
            design.path = {
              visible: store.coursePath.visible,
              points: store.coursePath.points,
              startPoint: store.startPoint,
              endPoint: store.endPoint
            }
          }
          return design
        }
      }

      // 方法2: 从画布的数据属性获取
      const courseDataAttr = canvas.getAttribute('data-course-design')
      if (courseDataAttr) {
        const parsedData = JSON.parse(courseDataAttr)
        console.log('从画布data属性获取课程数据')
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

      // 方法3: 从DOM元素中解析（最后的备用方案）
      console.log('从DOM解析课程数据')
      return this.parseCourseFromDOM(canvas)

    } catch (error) {
      // 如果所有方法都失败，返回默认的课程设计
      console.warn('提取课程设计数据失败，使用默认数据:', error)
      return this.getDefaultCourseDesign()
    }
  }

  /**
   * 获取默认的课程设计结构
   * 当所有数据提取方法都失败时使用
   */
  private getDefaultCourseDesign(): CourseDesign {
    return {
      id: `fallback-course-${Date.now()}`,
      name: '解析失败的课程',
      obstacles: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fieldWidth: 60,
      fieldHeight: 40,
      path: undefined
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
      warnings: [] as string[],
      suggestions: [] as string[],
      statistics: {
        obstacleCount: courseDesign.obstacles.length,
        hasPath: !!courseDesign.path,
        pathPointCount: courseDesign.path?.points.length || 0,
        hasStartPoint: !!(courseDesign.path?.startPoint),
        hasEndPoint: !!(courseDesign.path?.endPoint),
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

    // 增强的路径数据验证
    if (courseDesign.path) {
      // 验证路径点数组的有效性 (需求 3.1)
      if (!Array.isArray(courseDesign.path.points)) {
        results.issues.push('路径点数据格式无效：points必须是数组')
        results.isValid = false
      } else {
        // 验证路径至少包含2个点 (需求 3.2)
        if (courseDesign.path.points.length < 2) {
          results.warnings.push('路径至少需要2个点才能形成有效路径')
          results.suggestions.push('添加更多路径点以创建完整的路径')
        }

        // 验证路径点坐标的有效性 (需求 3.3)
        courseDesign.path.points.forEach((point, index) => {
          // 验证基本坐标
          if (typeof point.x !== 'number' || isNaN(point.x)) {
            results.issues.push(`路径点 ${index + 1} 的x坐标无效`)
            results.isValid = false
          }
          if (typeof point.y !== 'number' || isNaN(point.y)) {
            results.issues.push(`路径点 ${index + 1} 的y坐标无效`)
            results.isValid = false
          }

          // 验证坐标是否在场地范围内
          if (typeof point.x === 'number' && !isNaN(point.x)) {
            if (point.x < 0 || point.x > courseDesign.fieldWidth) {
              results.warnings.push(`路径点 ${index + 1} 的x坐标(${point.x})超出场地范围(0-${courseDesign.fieldWidth})`)
            }
          }
          if (typeof point.y === 'number' && !isNaN(point.y)) {
            if (point.y < 0 || point.y > courseDesign.fieldHeight) {
              results.warnings.push(`路径点 ${index + 1} 的y坐标(${point.y})超出场地范围(0-${courseDesign.fieldHeight})`)
            }
          }

          // 验证控制点（如果存在）
          if (point.controlPoint1) {
            if (typeof point.controlPoint1.x !== 'number' || isNaN(point.controlPoint1.x)) {
              results.warnings.push(`路径点 ${index + 1} 的控制点1的x坐标无效`)
            }
            if (typeof point.controlPoint1.y !== 'number' || isNaN(point.controlPoint1.y)) {
              results.warnings.push(`路径点 ${index + 1} 的控制点1的y坐标无效`)
            }
          }
          if (point.controlPoint2) {
            if (typeof point.controlPoint2.x !== 'number' || isNaN(point.controlPoint2.x)) {
              results.warnings.push(`路径点 ${index + 1} 的控制点2的x坐标无效`)
            }
            if (typeof point.controlPoint2.y !== 'number' || isNaN(point.controlPoint2.y)) {
              results.warnings.push(`路径点 ${index + 1} 的控制点2的y坐标无效`)
            }
          }

          // 验证旋转角度（如果存在）
          if (point.rotation !== undefined && (typeof point.rotation !== 'number' || isNaN(point.rotation))) {
            results.warnings.push(`路径点 ${index + 1} 的旋转角度无效`)
          }
        })
      }

      // 验证起点的位置和旋转角度 (需求 3.4)
      if (courseDesign.path.startPoint) {
        const startPoint = courseDesign.path.startPoint

        if (typeof startPoint.x !== 'number' || isNaN(startPoint.x)) {
          results.issues.push('起点的x坐标无效')
          results.isValid = false
        }
        if (typeof startPoint.y !== 'number' || isNaN(startPoint.y)) {
          results.issues.push('起点的y坐标无效')
          results.isValid = false
        }
        if (typeof startPoint.rotation !== 'number' || isNaN(startPoint.rotation)) {
          results.issues.push('起点的旋转角度无效')
          results.isValid = false
        }

        // 验证起点是否在场地范围内
        if (typeof startPoint.x === 'number' && !isNaN(startPoint.x)) {
          if (startPoint.x < 0 || startPoint.x > courseDesign.fieldWidth) {
            results.warnings.push(`起点的x坐标(${startPoint.x})超出场地范围(0-${courseDesign.fieldWidth})`)
          }
        }
        if (typeof startPoint.y === 'number' && !isNaN(startPoint.y)) {
          if (startPoint.y < 0 || startPoint.y > courseDesign.fieldHeight) {
            results.warnings.push(`起点的y坐标(${startPoint.y})超出场地范围(0-${courseDesign.fieldHeight})`)
          }
        }
      } else {
        results.warnings.push('路径缺少起点信息')
        results.suggestions.push('添加起点以完善路径设计')
      }

      // 验证终点的位置和旋转角度 (需求 3.4)
      if (courseDesign.path.endPoint) {
        const endPoint = courseDesign.path.endPoint

        if (typeof endPoint.x !== 'number' || isNaN(endPoint.x)) {
          results.issues.push('终点的x坐标无效')
          results.isValid = false
        }
        if (typeof endPoint.y !== 'number' || isNaN(endPoint.y)) {
          results.issues.push('终点的y坐标无效')
          results.isValid = false
        }
        if (typeof endPoint.rotation !== 'number' || isNaN(endPoint.rotation)) {
          results.issues.push('终点的旋转角度无效')
          results.isValid = false
        }

        // 验证终点是否在场地范围内
        if (typeof endPoint.x === 'number' && !isNaN(endPoint.x)) {
          if (endPoint.x < 0 || endPoint.x > courseDesign.fieldWidth) {
            results.warnings.push(`终点的x坐标(${endPoint.x})超出场地范围(0-${courseDesign.fieldWidth})`)
          }
        }
        if (typeof endPoint.y === 'number' && !isNaN(endPoint.y)) {
          if (endPoint.y < 0 || endPoint.y > courseDesign.fieldHeight) {
            results.warnings.push(`终点的y坐标(${endPoint.y})超出场地范围(0-${courseDesign.fieldHeight})`)
          }
        }
      } else {
        results.warnings.push('路径缺少终点信息')
        results.suggestions.push('添加终点以完善路径设计')
      }

      // 验证路径可见性
      if (typeof courseDesign.path.visible !== 'boolean') {
        results.warnings.push('路径可见性标志格式无效')
      }

      // 提供路径质量建议
      if (courseDesign.path.points.length >= 2 && courseDesign.path.points.length < 5) {
        results.suggestions.push('考虑添加更多路径点以提高路径的平滑度和精确度')
      }
      if (courseDesign.path.points.length > 50) {
        results.suggestions.push('路径点数量较多，可能影响性能，考虑简化路径')
      }
    } else {
      // 没有路径数据时的建议
      if (courseDesign.obstacles.length > 0) {
        results.suggestions.push('考虑添加路径信息以完善课程设计')
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
          obstacleFields: options.selectiveInclude.obstacleFields ?? [
            'id',
            'type',
            'position',
            'rotation',
            'poles',
            'number',
            'numberPosition',
            'customId',
            'decorationProperties',
            'wallProperties',
            'liverpoolProperties',
            'waterProperties'
          ],
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

      // 获取课程设计验证结果（包含路径验证）
      const courseValidation = jsonData.metadata?.validationResults || {
        isValid: true,
        issues: [],
        warnings: [],
        suggestions: []
      }

      // 合并所有建议
      const allRecommendations = [
        ...validationResult.recommendations,
        ...(courseValidation.suggestions || [])
      ]

      // 合并所有问题
      const allIssues = [
        // 来自格式化器的错误
        ...validationResult.errors.map(error => ({
          type: this.mapErrorTypeToIssueType(error.code),
          severity: error.severity as 'low' | 'medium' | 'high' | 'critical',
          description: error.message,
          element: error.field,
          suggestedFix: this.getSuggestedFix(error.code)
        })),
        // 来自格式化器的警告
        ...validationResult.warnings.map(warning => ({
          type: 'style_mismatch' as const,
          severity: 'low' as const,
          description: warning.message,
          element: warning.field,
          suggestedFix: warning.suggestion
        })),
        // 来自课程验证的问题（路径相关）
        ...(courseValidation.issues || []).map((issue: string) => ({
          type: 'missing_element' as const,
          severity: 'high' as const,
          description: issue,
          element: 'courseDesign',
          suggestedFix: '检查并修复数据完整性问题'
        })),
        // 来自课程验证的警告（路径相关）
        ...(courseValidation.warnings || []).map((warning: string) => ({
          type: 'style_mismatch' as const,
          severity: 'medium' as const,
          description: warning,
          element: 'path',
          suggestedFix: '检查路径数据的完整性和准确性'
        }))
      ]

      return {
        overallScore: validationResult.isValid && courseValidation.isValid ? 1.0 : 0.8,
        pathCompleteness: this.calculatePathCompleteness(originalCourse),
        renderingAccuracy: 1.0, // JSON导出总是100%准确
        performanceMetrics: {
          renderingTime: jsonData.metadata?.exportDuration || 0,
          memoryUsage: validationResult.statistics.totalSize,
          canvasSize: { width: 0, height: 0 },
          elementCount: validationResult.statistics.obstacleCount,
          svgElementCount: 0 // JSON导出不涉及SVG
        },
        recommendations: allRecommendations,
        detailedIssues: allIssues
      }
    } catch (error) {
      // 如果验证失败，返回基础质量报告
      const validation = jsonData.metadata?.validationResults || {
        isValid: true,
        issues: [],
        warnings: [],
        suggestions: []
      }

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
        recommendations: [
          'JSON导出完成，但质量验证过程出现问题',
          ...(validation.suggestions || [])
        ],
        detailedIssues: (validation.issues || []).map((issue: string) => ({
          type: 'missing_element' as const,
          severity: 'medium' as const,
          description: issue,
          element: 'courseDesign',
          suggestedFix: '检查数据完整性'
        }))
      }
    }
  }

  /**
   * 计算路径完整性
   * 考虑起点、终点信息和路径点数量 (需求 1.5, 3.5)
   */
  private calculatePathCompleteness(courseDesign: CourseDesign): number {
    if (!courseDesign.path) {
      return courseDesign.obstacles.length > 0 ? 80 : 60 // 有障碍物但无路径
    }

    let completeness = 0
    const path = courseDesign.path

    // 基础分数：路径点数量 (最高50分)
    const pathPoints = path.points.length
    if (pathPoints < 2) {
      completeness += 15 // 路径点不足，无法形成有效路径
    } else if (pathPoints >= 2 && pathPoints < 5) {
      completeness += 30 // 基本路径
    } else if (pathPoints >= 5 && pathPoints < 10) {
      completeness += 40 // 详细路径
    } else if (pathPoints >= 10 && pathPoints < 20) {
      completeness += 45 // 非常详细的路径
    } else {
      completeness += 50 // 极其详细的路径
    }

    // 起点信息完整性 (最高20分)
    if (path.startPoint) {
      const startPoint = path.startPoint
      const hasValidX = typeof startPoint.x === 'number' && !isNaN(startPoint.x)
      const hasValidY = typeof startPoint.y === 'number' && !isNaN(startPoint.y)
      const hasValidRotation = typeof startPoint.rotation === 'number' && !isNaN(startPoint.rotation)

      if (hasValidX && hasValidY && hasValidRotation) {
        // 检查起点是否在场地范围内
        const inBounds = startPoint.x >= 0 && startPoint.x <= courseDesign.fieldWidth &&
                        startPoint.y >= 0 && startPoint.y <= courseDesign.fieldHeight
        completeness += inBounds ? 20 : 18 // 起点信息完整，在范围内加满分
      } else if (hasValidX && hasValidY) {
        completeness += 12 // 起点位置有效但缺少旋转角度
      } else {
        completeness += 5 // 起点信息不完整
      }
    } else {
      // 没有起点信息
      completeness += 0
    }

    // 终点信息完整性 (最高20分)
    if (path.endPoint) {
      const endPoint = path.endPoint
      const hasValidX = typeof endPoint.x === 'number' && !isNaN(endPoint.x)
      const hasValidY = typeof endPoint.y === 'number' && !isNaN(endPoint.y)
      const hasValidRotation = typeof endPoint.rotation === 'number' && !isNaN(endPoint.rotation)

      if (hasValidX && hasValidY && hasValidRotation) {
        // 检查终点是否在场地范围内
        const inBounds = endPoint.x >= 0 && endPoint.x <= courseDesign.fieldWidth &&
                        endPoint.y >= 0 && endPoint.y <= courseDesign.fieldHeight
        completeness += inBounds ? 20 : 18 // 终点信息完整，在范围内加满分
      } else if (hasValidX && hasValidY) {
        completeness += 12 // 终点位置有效但缺少旋转角度
      } else {
        completeness += 5 // 终点信息不完整
      }
    } else {
      // 没有终点信息
      completeness += 0
    }

    // 控制点信息质量评估 (最多15分)
    let controlPointScore = 0
    let validControlPointCount = 0

    path.points.forEach(point => {
      let pointControlScore = 0

      // 检查控制点1
      if (point.controlPoint1) {
        const cp1Valid = typeof point.controlPoint1.x === 'number' && !isNaN(point.controlPoint1.x) &&
                        typeof point.controlPoint1.y === 'number' && !isNaN(point.controlPoint1.y)
        if (cp1Valid) {
          pointControlScore += 0.5
          validControlPointCount++
        }
      }

      // 检查控制点2
      if (point.controlPoint2) {
        const cp2Valid = typeof point.controlPoint2.x === 'number' && !isNaN(point.controlPoint2.x) &&
                        typeof point.controlPoint2.y === 'number' && !isNaN(point.controlPoint2.y)
        if (cp2Valid) {
          pointControlScore += 0.5
          validControlPointCount++
        }
      }

      controlPointScore += pointControlScore
    })

    // 根据控制点覆盖率计算分数
    if (pathPoints > 0) {
      const controlPointCoverage = validControlPointCount / (pathPoints * 2) // 每个点最多2个控制点
      controlPointScore = Math.min(15, controlPointCoverage * 15)
    }

    completeness += controlPointScore

    // 路径点坐标有效性检查 (最多5分)
    let validPointCount = 0
    path.points.forEach(point => {
      const hasValidX = typeof point.x === 'number' && !isNaN(point.x)
      const hasValidY = typeof point.y === 'number' && !isNaN(point.y)
      const inBounds = hasValidX && hasValidY &&
                      point.x >= 0 && point.x <= courseDesign.fieldWidth &&
                      point.y >= 0 && point.y <= courseDesign.fieldHeight

      if (hasValidX && hasValidY) {
        validPointCount += inBounds ? 1 : 0.8 // 在范围内的点得分更高
      }
    })

    if (pathPoints > 0) {
      const pointValidityScore = (validPointCount / pathPoints) * 5
      completeness += pointValidityScore
    }

    // 确保分数在0-100之间
    return Math.min(100, Math.max(0, Math.round(completeness)))
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
    error: unknown,
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
  private determineErrorType(error: unknown, stage: ExportStage): ExportErrorType {
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
  private generateErrorSuggestedActions(error: unknown, stage: ExportStage): string[] {
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
