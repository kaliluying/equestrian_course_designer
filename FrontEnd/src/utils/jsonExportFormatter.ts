/**
 * JSON导出格式化工具
 * 提供压缩、美化打印、选择性数据包含和验证功能
 */

import { CourseDesign, Obstacle, CoursePathData } from '@/types/obstacle'
import { JSONExportOptions } from '@/types/export'

/**
 * JSON格式化选项接口
 */
export interface JSONFormattingOptions {
  minify: boolean
  prettyPrint: boolean
  indentSize: number
  sortKeys: boolean
  removeEmptyFields: boolean
  includeComments: boolean
}

/**
 * 选择性数据包含选项接口
 */
export interface SelectiveDataOptions {
  includeObstacles: boolean
  includePath: boolean
  includeMetadata: boolean
  includeViewportInfo: boolean
  includeTimestamps: boolean
  includeIds: boolean
  obstacleFields: string[]
  pathFields: string[]
  customFields: Record<string, boolean>
}

/**
 * JSON验证结果接口
 */
export interface JSONValidationResult {
  isValid: boolean
  errors: JSONValidationError[]
  warnings: JSONValidationWarning[]
  statistics: JSONStatistics
  recommendations: string[]
}

export interface JSONValidationError {
  field: string
  message: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  code: string
}

export interface JSONValidationWarning {
  field: string
  message: string
  suggestion: string
}

export interface JSONStatistics {
  totalSize: number
  compressedSize: number
  compressionRatio: number
  obstacleCount: number
  pathPointCount: number
  fieldCount: number
  nestingDepth: number
}

/**
 * JSON导出格式化器类
 */
export class JSONExportFormatter {
  private readonly defaultFormattingOptions: JSONFormattingOptions = {
    minify: false,
    prettyPrint: true,
    indentSize: 2,
    sortKeys: false,
    removeEmptyFields: true,
    includeComments: false
  }

  private readonly defaultSelectiveOptions: SelectiveDataOptions = {
    includeObstacles: true,
    includePath: true,
    includeMetadata: true,
    includeViewportInfo: true,
    includeTimestamps: true,
    includeIds: true,
    obstacleFields: ['id', 'type', 'position', 'rotation', 'poles', 'number'],
    pathFields: ['points', 'visible', 'startPoint', 'endPoint'],
    customFields: {}
  }

  /**
   * 格式化JSON数据
   */
  formatJSON(
    data: any,
    options: Partial<JSONFormattingOptions> = {}
  ): string {
    const mergedOptions = { ...this.defaultFormattingOptions, ...options }

    try {
      // 1. 预处理数据
      let processedData = this.preprocessData(data, mergedOptions)

      // 2. 排序键（如果启用）
      if (mergedOptions.sortKeys) {
        processedData = this.sortObjectKeys(processedData)
      }

      // 3. 移除空字段（如果启用）
      if (mergedOptions.removeEmptyFields) {
        processedData = this.removeEmptyFields(processedData)
      }

      // 4. 序列化
      if (mergedOptions.minify) {
        return JSON.stringify(processedData)
      } else {
        const indent = mergedOptions.prettyPrint ? mergedOptions.indentSize : 0
        return JSON.stringify(processedData, null, indent)
      }

    } catch (error) {
      throw new Error(`JSON格式化失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 选择性数据包含
   */
  selectiveInclude(
    courseDesign: CourseDesign,
    options: Partial<SelectiveDataOptions> = {}
  ): Partial<CourseDesign> {
    const mergedOptions = { ...this.defaultSelectiveOptions, ...options }
    const result: any = {}

    // 基础字段
    if (mergedOptions.includeIds) {
      result.id = courseDesign.id
    }

    result.name = courseDesign.name

    if (mergedOptions.includeTimestamps) {
      result.createdAt = courseDesign.createdAt
      result.updatedAt = courseDesign.updatedAt
    }

    // 场地尺寸（总是包含）
    result.fieldWidth = courseDesign.fieldWidth
    result.fieldHeight = courseDesign.fieldHeight

    // 障碍物数据
    if (mergedOptions.includeObstacles && courseDesign.obstacles) {
      result.obstacles = courseDesign.obstacles.map(obstacle =>
        this.selectObstacleFields(obstacle, mergedOptions.obstacleFields)
      )
    }

    // 路径数据
    if (mergedOptions.includePath && courseDesign.path) {
      result.path = this.selectPathFields(courseDesign.path, mergedOptions.pathFields)
    }

    // 视口信息
    if (mergedOptions.includeViewportInfo && courseDesign.viewportInfo) {
      result.viewportInfo = courseDesign.viewportInfo
    }

    // 自定义字段
    Object.entries(mergedOptions.customFields).forEach(([field, include]) => {
      if (include && field in courseDesign) {
        result[field] = (courseDesign as any)[field]
      }
    })

    return result
  }

  /**
   * 验证JSON数据
   */
  validateJSON(data: any): JSONValidationResult {
    const errors: JSONValidationError[] = []
    const warnings: JSONValidationWarning[] = []
    const recommendations: string[] = []

    try {
      // 1. 基础结构验证
      this.validateBasicStructure(data, errors, warnings)

      // 2. 课程设计数据验证
      if (data.courseDesign) {
        this.validateCourseDesign(data.courseDesign, errors, warnings)
      }

      // 3. 障碍物数据验证
      if (data.courseDesign?.obstacles) {
        this.validateObstacles(data.courseDesign.obstacles, errors, warnings)
      }

      // 4. 路径数据验证
      if (data.courseDesign?.path) {
        this.validatePath(data.courseDesign.path, errors, warnings)
      }

      // 5. 视口信息验证
      if (data.viewportInfo) {
        this.validateViewportInfo(data.viewportInfo, errors, warnings)
      }

      // 6. 生成统计信息
      const statistics = this.generateStatistics(data)

      // 7. 生成建议
      this.generateRecommendations(data, statistics, errors, warnings, recommendations)

      return {
        isValid: errors.filter(e => e.severity === 'critical' || e.severity === 'high').length === 0,
        errors,
        warnings,
        statistics,
        recommendations
      }

    } catch (error) {
      errors.push({
        field: 'root',
        message: `验证过程出错: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'critical',
        code: 'VALIDATION_ERROR'
      })

      return {
        isValid: false,
        errors,
        warnings,
        statistics: this.createEmptyStatistics(),
        recommendations: ['验证过程失败，请检查数据格式']
      }
    }
  }

  /**
   * 压缩JSON数据
   */
  compressJSON(data: any): { compressed: string; ratio: number; originalSize: number; compressedSize: number } {
    try {
      const original = JSON.stringify(data, null, 2)
      const compressed = JSON.stringify(data)

      const originalSize = original.length
      const compressedSize = compressed.length
      const ratio = originalSize > 0 ? (originalSize - compressedSize) / originalSize : 0

      return {
        compressed,
        ratio,
        originalSize,
        compressedSize
      }
    } catch (error) {
      throw new Error(`JSON压缩失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 美化JSON数据
   */
  beautifyJSON(data: any, indentSize: number = 2): string {
    try {
      return JSON.stringify(data, null, indentSize)
    } catch (error) {
      throw new Error(`JSON美化失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // 私有方法

  /**
   * 预处理数据
   */
  private preprocessData(data: any, options: JSONFormattingOptions): any {
    if (options.includeComments) {
      // 添加注释字段（JSON本身不支持注释，但可以添加特殊字段）
      return {
        _comments: {
          _generated: new Date().toISOString(),
          _version: '1.0.0',
          _format: 'Equestrian Course Design JSON Export'
        },
        ...data
      }
    }

    return data
  }

  /**
   * 排序对象键
   */
  private sortObjectKeys(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item))
    }

    if (obj !== null && typeof obj === 'object') {
      const sorted: any = {}
      Object.keys(obj).sort().forEach(key => {
        sorted[key] = this.sortObjectKeys(obj[key])
      })
      return sorted
    }

    return obj
  }

  /**
   * 移除空字段
   */
  private removeEmptyFields(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.removeEmptyFields(item)).filter(item => item !== null && item !== undefined)
    }

    if (obj !== null && typeof obj === 'object') {
      const cleaned: any = {}
      Object.entries(obj).forEach(([key, value]) => {
        const cleanedValue = this.removeEmptyFields(value)

        // 保留非空值
        if (cleanedValue !== null &&
            cleanedValue !== undefined &&
            cleanedValue !== '' &&
            !(Array.isArray(cleanedValue) && cleanedValue.length === 0) &&
            !(typeof cleanedValue === 'object' && Object.keys(cleanedValue).length === 0)) {
          cleaned[key] = cleanedValue
        }
      })
      return cleaned
    }

    return obj
  }

  /**
   * 选择障碍物字段
   */
  private selectObstacleFields(obstacle: Obstacle, fields: string[]): Partial<Obstacle> {
    const result: any = {}

    fields.forEach(field => {
      if (field in obstacle) {
        result[field] = (obstacle as any)[field]
      }
    })

    return result
  }

  /**
   * 选择路径字段
   */
  private selectPathFields(path: CoursePathData, fields: string[]): Partial<CoursePathData> {
    const result: any = {}

    fields.forEach(field => {
      if (field in path) {
        result[field] = (path as any)[field]
      }
    })

    return result
  }
  /**
   * 验证基础结构
   */
  private validateBasicStructure(data: any, errors: JSONValidationError[], warnings: JSONValidationWarning[]): void {
    // 检查必需的顶级字段
    const requiredFields = ['version', 'exportInfo', 'courseDesign']

    requiredFields.forEach(field => {
      if (!(field in data)) {
        errors.push({
          field,
          message: `缺少必需字段: ${field}`,
          severity: 'high',
          code: 'MISSING_REQUIRED_FIELD'
        })
      }
    })

    // 检查版本信息
    if (data.version && typeof data.version !== 'string') {
      errors.push({
        field: 'version',
        message: '版本信息必须是字符串',
        severity: 'medium',
        code: 'INVALID_VERSION_TYPE'
      })
    }

    // 检查导出信息
    if (data.exportInfo) {
      if (!data.exportInfo.timestamp) {
        warnings.push({
          field: 'exportInfo.timestamp',
          message: '缺少导出时间戳',
          suggestion: '添加导出时间戳以便追踪'
        })
      }

      if (!data.exportInfo.exportEngine) {
        warnings.push({
          field: 'exportInfo.exportEngine',
          message: '缺少导出引擎信息',
          suggestion: '添加导出引擎信息以便调试'
        })
      }
    }
  }

  /**
   * 验证课程设计数据
   */
  private validateCourseDesign(courseDesign: any, errors: JSONValidationError[], warnings: JSONValidationWarning[]): void {
    // 检查必需字段
    const requiredFields = ['id', 'name', 'obstacles', 'fieldWidth', 'fieldHeight']

    requiredFields.forEach(field => {
      if (!(field in courseDesign)) {
        errors.push({
          field: `courseDesign.${field}`,
          message: `课程设计缺少必需字段: ${field}`,
          severity: 'high',
          code: 'MISSING_COURSE_FIELD'
        })
      }
    })

    // 验证ID格式
    if (courseDesign.id && typeof courseDesign.id !== 'string') {
      errors.push({
        field: 'courseDesign.id',
        message: '课程ID必须是字符串',
        severity: 'high',
        code: 'INVALID_ID_TYPE'
      })
    }

    // 验证名称
    if (courseDesign.name && typeof courseDesign.name !== 'string') {
      errors.push({
        field: 'courseDesign.name',
        message: '课程名称必须是字符串',
        severity: 'medium',
        code: 'INVALID_NAME_TYPE'
      })
    }

    // 验证场地尺寸
    if (courseDesign.fieldWidth && (typeof courseDesign.fieldWidth !== 'number' || courseDesign.fieldWidth <= 0)) {
      errors.push({
        field: 'courseDesign.fieldWidth',
        message: '场地宽度必须是正数',
        severity: 'high',
        code: 'INVALID_FIELD_WIDTH'
      })
    }

    if (courseDesign.fieldHeight && (typeof courseDesign.fieldHeight !== 'number' || courseDesign.fieldHeight <= 0)) {
      errors.push({
        field: 'courseDesign.fieldHeight',
        message: '场地高度必须是正数',
        severity: 'high',
        code: 'INVALID_FIELD_HEIGHT'
      })
    }

    // 验证时间戳格式
    if (courseDesign.createdAt && !this.isValidISO8601(courseDesign.createdAt)) {
      warnings.push({
        field: 'courseDesign.createdAt',
        message: '创建时间格式不正确',
        suggestion: '使用ISO 8601格式 (YYYY-MM-DDTHH:mm:ss.sssZ)'
      })
    }

    if (courseDesign.updatedAt && !this.isValidISO8601(courseDesign.updatedAt)) {
      warnings.push({
        field: 'courseDesign.updatedAt',
        message: '更新时间格式不正确',
        suggestion: '使用ISO 8601格式 (YYYY-MM-DDTHH:mm:ss.sssZ)'
      })
    }
  }

  /**
   * 验证障碍物数据
   */
  private validateObstacles(obstacles: any[], errors: JSONValidationError[], warnings: JSONValidationWarning[]): void {
    if (!Array.isArray(obstacles)) {
      errors.push({
        field: 'courseDesign.obstacles',
        message: '障碍物数据必须是数组',
        severity: 'critical',
        code: 'INVALID_OBSTACLES_TYPE'
      })
      return
    }

    obstacles.forEach((obstacle, index) => {
      const fieldPrefix = `courseDesign.obstacles[${index}]`

      // 检查必需字段
      const requiredFields = ['id', 'type', 'position']
      requiredFields.forEach(field => {
        if (!(field in obstacle)) {
          errors.push({
            field: `${fieldPrefix}.${field}`,
            message: `障碍物 ${index + 1} 缺少必需字段: ${field}`,
            severity: 'high',
            code: 'MISSING_OBSTACLE_FIELD'
          })
        }
      })

      // 验证ID
      if (obstacle.id && typeof obstacle.id !== 'string') {
        errors.push({
          field: `${fieldPrefix}.id`,
          message: `障碍物 ${index + 1} 的ID必须是字符串`,
          severity: 'high',
          code: 'INVALID_OBSTACLE_ID'
        })
      }

      // 验证类型
      const validTypes = ['SINGLE', 'DOUBLE', 'COMBINATION', 'WALL', 'LIVERPOOL', 'WATER', 'DECORATION', 'CUSTOM']
      if (obstacle.type && !validTypes.includes(obstacle.type)) {
        errors.push({
          field: `${fieldPrefix}.type`,
          message: `障碍物 ${index + 1} 的类型无效: ${obstacle.type}`,
          severity: 'high',
          code: 'INVALID_OBSTACLE_TYPE'
        })
      }

      // 验证位置
      if (obstacle.position) {
        if (typeof obstacle.position !== 'object' || obstacle.position === null) {
          errors.push({
            field: `${fieldPrefix}.position`,
            message: `障碍物 ${index + 1} 的位置必须是对象`,
            severity: 'high',
            code: 'INVALID_POSITION_TYPE'
          })
        } else {
          if (typeof obstacle.position.x !== 'number') {
            errors.push({
              field: `${fieldPrefix}.position.x`,
              message: `障碍物 ${index + 1} 的X坐标必须是数字`,
              severity: 'high',
              code: 'INVALID_POSITION_X'
            })
          }

          if (typeof obstacle.position.y !== 'number') {
            errors.push({
              field: `${fieldPrefix}.position.y`,
              message: `障碍物 ${index + 1} 的Y坐标必须是数字`,
              severity: 'high',
              code: 'INVALID_POSITION_Y'
            })
          }
        }
      }

      // 验证旋转角度
      if (obstacle.rotation !== undefined && typeof obstacle.rotation !== 'number') {
        warnings.push({
          field: `${fieldPrefix}.rotation`,
          message: `障碍物 ${index + 1} 的旋转角度应该是数字`,
          suggestion: '确保旋转角度是有效的数值'
        })
      }

      // 验证杆子数据
      if (obstacle.poles && !Array.isArray(obstacle.poles)) {
        warnings.push({
          field: `${fieldPrefix}.poles`,
          message: `障碍物 ${index + 1} 的杆子数据应该是数组`,
          suggestion: '确保杆子数据格式正确'
        })
      }
    })

    // 检查重复ID
    const ids = obstacles.map(o => o.id).filter(id => id)
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index)
    if (duplicateIds.length > 0) {
      errors.push({
        field: 'courseDesign.obstacles',
        message: `发现重复的障碍物ID: ${duplicateIds.join(', ')}`,
        severity: 'high',
        code: 'DUPLICATE_OBSTACLE_IDS'
      })
    }
  }

  /**
   * 验证路径数据
   */
  private validatePath(path: any, errors: JSONValidationError[], warnings: JSONValidationWarning[]): void {
    const fieldPrefix = 'courseDesign.path'

    // 检查基本结构
    if (typeof path !== 'object' || path === null) {
      errors.push({
        field: fieldPrefix,
        message: '路径数据必须是对象',
        severity: 'high',
        code: 'INVALID_PATH_TYPE'
      })
      return
    }

    // 验证可见性
    if ('visible' in path && typeof path.visible !== 'boolean') {
      warnings.push({
        field: `${fieldPrefix}.visible`,
        message: '路径可见性应该是布尔值',
        suggestion: '使用true或false表示路径是否可见'
      })
    }

    // 验证路径点
    if (path.points) {
      if (!Array.isArray(path.points)) {
        errors.push({
          field: `${fieldPrefix}.points`,
          message: '路径点必须是数组',
          severity: 'high',
          code: 'INVALID_PATH_POINTS_TYPE'
        })
      } else {
        if (path.points.length < 2) {
          warnings.push({
            field: `${fieldPrefix}.points`,
            message: '路径至少需要2个点',
            suggestion: '添加更多路径点以形成有效路径'
          })
        }

        path.points.forEach((point: any, index: number) => {
          const pointPrefix = `${fieldPrefix}.points[${index}]`

          if (typeof point !== 'object' || point === null) {
            errors.push({
              field: pointPrefix,
              message: `路径点 ${index + 1} 必须是对象`,
              severity: 'high',
              code: 'INVALID_PATH_POINT_TYPE'
            })
            return
          }

          // 验证坐标
          if (typeof point.x !== 'number') {
            errors.push({
              field: `${pointPrefix}.x`,
              message: `路径点 ${index + 1} 的X坐标必须是数字`,
              severity: 'high',
              code: 'INVALID_PATH_POINT_X'
            })
          }

          if (typeof point.y !== 'number') {
            errors.push({
              field: `${pointPrefix}.y`,
              message: `路径点 ${index + 1} 的Y坐标必须是数字`,
              severity: 'high',
              code: 'INVALID_PATH_POINT_Y'
            })
          }

          // 验证旋转角度（可选）
          if (point.rotation !== undefined && typeof point.rotation !== 'number') {
            warnings.push({
              field: `${pointPrefix}.rotation`,
              message: `路径点 ${index + 1} 的旋转角度应该是数字`,
              suggestion: '确保旋转角度是有效的数值'
            })
          }
        })
      }
    }

    // 验证起点和终点
    ['startPoint', 'endPoint'].forEach(pointType => {
      if (path[pointType]) {
        const point = path[pointType]
        const pointPrefix = `${fieldPrefix}.${pointType}`

        if (typeof point !== 'object' || point === null) {
          errors.push({
            field: pointPrefix,
            message: `${pointType === 'startPoint' ? '起点' : '终点'}必须是对象`,
            severity: 'medium',
            code: 'INVALID_PATH_ENDPOINT_TYPE'
          })
        } else {
          if (typeof point.x !== 'number' || typeof point.y !== 'number') {
            errors.push({
              field: pointPrefix,
              message: `${pointType === 'startPoint' ? '起点' : '终点'}坐标必须是数字`,
              severity: 'medium',
              code: 'INVALID_PATH_ENDPOINT_COORDS'
            })
          }
        }
      }
    })
  }

  /**
   * 验证视口信息
   */
  private validateViewportInfo(viewportInfo: any, errors: JSONValidationError[], warnings: JSONValidationWarning[]): void {
    const fieldPrefix = 'viewportInfo'

    if (typeof viewportInfo !== 'object' || viewportInfo === null) {
      errors.push({
        field: fieldPrefix,
        message: '视口信息必须是对象',
        severity: 'medium',
        code: 'INVALID_VIEWPORT_TYPE'
      })
      return
    }

    // 验证数值字段
    const numericFields = ['width', 'height', 'canvasWidth', 'canvasHeight', 'aspectRatio', 'devicePixelRatio', 'zoomLevel']
    numericFields.forEach(field => {
      if (field in viewportInfo && typeof viewportInfo[field] !== 'number') {
        warnings.push({
          field: `${fieldPrefix}.${field}`,
          message: `视口${field}应该是数字`,
          suggestion: '确保视口尺寸信息是有效的数值'
        })
      }
    })

    // 验证滚动位置
    if (viewportInfo.scrollPosition) {
      if (typeof viewportInfo.scrollPosition !== 'object') {
        warnings.push({
          field: `${fieldPrefix}.scrollPosition`,
          message: '滚动位置应该是对象',
          suggestion: '使用{x: number, y: number}格式'
        })
      } else {
        if (typeof viewportInfo.scrollPosition.x !== 'number' || typeof viewportInfo.scrollPosition.y !== 'number') {
          warnings.push({
            field: `${fieldPrefix}.scrollPosition`,
            message: '滚动位置坐标应该是数字',
            suggestion: '确保x和y坐标都是有效数值'
          })
        }
      }
    }
  }

  /**
   * 生成统计信息
   */
  private generateStatistics(data: any): JSONStatistics {
    try {
      const originalJson = JSON.stringify(data, null, 2)
      const compressedJson = JSON.stringify(data)

      const originalSize = originalJson.length
      const compressedSize = compressedJson.length
      const compressionRatio = originalSize > 0 ? (originalSize - compressedSize) / originalSize : 0

      const obstacleCount = data.courseDesign?.obstacles?.length || 0
      const pathPointCount = data.courseDesign?.path?.points?.length || 0
      const fieldCount = this.countFields(data)
      const nestingDepth = this.calculateNestingDepth(data)

      return {
        totalSize: originalSize,
        compressedSize,
        compressionRatio,
        obstacleCount,
        pathPointCount,
        fieldCount,
        nestingDepth
      }
    } catch (error) {
      return this.createEmptyStatistics()
    }
  }

  /**
   * 生成建议
   */
  private generateRecommendations(
    data: any,
    statistics: JSONStatistics,
    errors: JSONValidationError[],
    warnings: JSONValidationWarning[],
    recommendations: string[]
  ): void {
    // 基于错误的建议
    if (errors.length === 0) {
      recommendations.push('JSON数据验证通过，格式正确')
    } else {
      const criticalErrors = errors.filter(e => e.severity === 'critical').length
      const highErrors = errors.filter(e => e.severity === 'high').length

      if (criticalErrors > 0) {
        recommendations.push(`发现${criticalErrors}个严重错误，需要立即修复`)
      }
      if (highErrors > 0) {
        recommendations.push(`发现${highErrors}个高优先级错误，建议尽快修复`)
      }
    }

    // 基于警告的建议
    if (warnings.length > 0) {
      recommendations.push(`发现${warnings.length}个警告，建议检查并优化`)
    }

    // 基于数据大小的建议
    if (statistics.totalSize > 1024 * 1024) { // 1MB
      recommendations.push('数据文件较大，考虑启用压缩或移除不必要的字段')
    }

    if (statistics.compressionRatio > 0.5) {
      recommendations.push('数据压缩效果良好，建议在传输时使用压缩格式')
    }

    // 基于内容的建议
    if (statistics.obstacleCount === 0) {
      recommendations.push('课程中没有障碍物，考虑添加障碍物以完善设计')
    } else if (statistics.obstacleCount > 100) {
      recommendations.push('障碍物数量较多，确保性能表现良好')
    }

    if (statistics.pathPointCount === 0) {
      recommendations.push('没有路径信息，考虑添加路径以完善课程设计')
    } else if (statistics.pathPointCount < 3) {
      recommendations.push('路径点较少，考虑添加更多路径点以提高精度')
    }

    // 基于嵌套深度的建议
    if (statistics.nestingDepth > 10) {
      recommendations.push('数据嵌套层次较深，考虑简化数据结构')
    }

    // 基于字段数量的建议
    if (statistics.fieldCount > 1000) {
      recommendations.push('数据字段较多，考虑使用选择性导出以减少文件大小')
    }
  }

  /**
   * 创建空统计信息
   */
  private createEmptyStatistics(): JSONStatistics {
    return {
      totalSize: 0,
      compressedSize: 0,
      compressionRatio: 0,
      obstacleCount: 0,
      pathPointCount: 0,
      fieldCount: 0,
      nestingDepth: 0
    }
  }

  /**
   * 验证ISO 8601日期格式
   */
  private isValidISO8601(dateString: string): boolean {
    try {
      const date = new Date(dateString)
      return date.toISOString() === dateString
    } catch {
      return false
    }
  }

  /**
   * 计算对象字段数量
   */
  private countFields(obj: any, visited = new Set()): number {
    if (obj === null || typeof obj !== 'object' || visited.has(obj)) {
      return 0
    }

    visited.add(obj)
    let count = 0

    if (Array.isArray(obj)) {
      obj.forEach(item => {
        count += this.countFields(item, visited)
      })
    } else {
      count += Object.keys(obj).length
      Object.values(obj).forEach(value => {
        count += this.countFields(value, visited)
      })
    }

    return count
  }

  /**
   * 计算嵌套深度
   */
  private calculateNestingDepth(obj: any, visited = new Set()): number {
    if (obj === null || typeof obj !== 'object' || visited.has(obj)) {
      return 0
    }

    visited.add(obj)
    let maxDepth = 0

    if (Array.isArray(obj)) {
      obj.forEach(item => {
        maxDepth = Math.max(maxDepth, this.calculateNestingDepth(item, visited))
      })
    } else {
      Object.values(obj).forEach(value => {
        maxDepth = Math.max(maxDepth, this.calculateNestingDepth(value, visited))
      })
    }

    return maxDepth + 1
  }
}

// 创建全局JSON格式化器实例
export const jsonExportFormatter = new JSONExportFormatter()

// 导出类型和实例
export default JSONExportFormatter
