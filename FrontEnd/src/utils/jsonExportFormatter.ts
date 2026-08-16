/**
 * JSON导出格式化工具
 * 提供压缩、美化打印、选择性数据包含和验证功能
 */

import type { CourseDesign, Obstacle, CoursePathData } from '@/types/obstacle'

type JsonObject = Record<string, unknown>

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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
  customObstacleCount: number
  decorationCount: number
  decorationByCategory: Record<string, number>
  specialObstacleCount: { wall: number; liverpool: number; water: number }
  obstaclesWithCustomId: number
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
    data: unknown,
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
    const result: JsonObject = {}

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
        result[field] = (courseDesign as unknown as JsonObject)[field]
      }
    })

    return result as Partial<CourseDesign>
  }

  /**
   * 验证JSON数据
   */
  validateJSON(data: unknown): JSONValidationResult {
    const errors: JSONValidationError[] = []
    const warnings: JSONValidationWarning[] = []
    const recommendations: string[] = []

    try {
      // 1. 基础结构验证
      this.validateBasicStructure(data, errors, warnings)

      // 2. 课程设计数据验证
      const rootData = isRecord(data) ? data : {}
      const courseDesign = rootData.courseDesign

      if (courseDesign) {
        this.validateCourseDesign(courseDesign, errors, warnings)
      }

      // 3. 障碍物数据验证
      if (isRecord(courseDesign) && Array.isArray(courseDesign.obstacles)) {
        this.validateObstacles(courseDesign.obstacles, errors, warnings)
      }

      // 4. 路径数据验证
      if (isRecord(courseDesign) && courseDesign.path) {
        this.validatePath(courseDesign.path, errors, warnings)
      }

      // 5. 视口信息验证
      if (rootData.viewportInfo) {
        this.validateViewportInfo(rootData.viewportInfo, errors, warnings)
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
  compressJSON(data: unknown): { compressed: string; ratio: number; originalSize: number; compressedSize: number } {
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
  beautifyJSON(data: unknown, indentSize: number = 2): string {
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
  private preprocessData(data: unknown, options: JSONFormattingOptions): unknown {
    if (options.includeComments) {
      // 添加注释字段（JSON本身不支持注释，但可以添加特殊字段）
      return {
        _comments: {
          _generated: new Date().toISOString(),
          _version: '1.0.0',
          _format: 'Equestrian Course Design JSON Export'
        },
        ...(isRecord(data) ? data : { value: data })
      }
    }

    return data
  }

  /**
   * 排序对象键
   */
  private sortObjectKeys(obj: unknown): unknown {
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item))
    }

    if (isRecord(obj)) {
      const sorted: JsonObject = {}
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
  private removeEmptyFields(obj: unknown): unknown {
    if (Array.isArray(obj)) {
      return obj.map(item => this.removeEmptyFields(item)).filter(item => item !== null && item !== undefined)
    }

    if (isRecord(obj)) {
      const cleaned: JsonObject = {}
      Object.entries(obj).forEach(([key, value]) => {
        const cleanedValue = this.removeEmptyFields(value)

        // 保留非空值
        if (cleanedValue !== null &&
            cleanedValue !== undefined &&
            cleanedValue !== '' &&
            !(Array.isArray(cleanedValue) && cleanedValue.length === 0) &&
            !(isRecord(cleanedValue) && Object.keys(cleanedValue).length === 0)) {
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
    const result: Partial<Obstacle> & JsonObject = {}

    fields.forEach(field => {
      if (field in obstacle) {
        result[field] = (obstacle as unknown as JsonObject)[field]
      }
    })

    return result
  }

  /**
   * 选择路径字段
   */
  private selectPathFields(path: CoursePathData, fields: string[]): Partial<CoursePathData> {
    const result: Partial<CoursePathData> & JsonObject = {}

    fields.forEach(field => {
      if (field in path) {
        result[field] = (path as unknown as JsonObject)[field]
      }
    })

    return result
  }
  /**
   * 验证基础结构
   */
  private validateBasicStructure(data: unknown, errors: JSONValidationError[], warnings: JSONValidationWarning[]): void {
    const rootData = isRecord(data) ? data : {}
    // 检查必需的顶级字段
    const requiredFields = ['version', 'exportInfo', 'courseDesign']

    requiredFields.forEach(field => {
      if (!(field in rootData)) {
        errors.push({
          field,
          message: `缺少必需字段: ${field}`,
          severity: 'high',
          code: 'MISSING_REQUIRED_FIELD'
        })
      }
    })

    // 检查版本信息
    if (rootData.version && typeof rootData.version !== 'string') {
      errors.push({
        field: 'version',
        message: '版本信息必须是字符串',
        severity: 'medium',
        code: 'INVALID_VERSION_TYPE'
      })
    }

    // 检查导出信息
    if (isRecord(rootData.exportInfo)) {
      if (!rootData.exportInfo.timestamp) {
        warnings.push({
          field: 'exportInfo.timestamp',
          message: '缺少导出时间戳',
          suggestion: '添加导出时间戳以便追踪'
        })
      }

      if (!rootData.exportInfo.exportEngine) {
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
  private validateCourseDesign(courseDesign: unknown, errors: JSONValidationError[], warnings: JSONValidationWarning[]): void {
    const courseData = isRecord(courseDesign) ? courseDesign : {}
    // 检查必需字段
    const requiredFields = ['id', 'name', 'obstacles', 'fieldWidth', 'fieldHeight']

    requiredFields.forEach(field => {
      if (!(field in courseData)) {
        errors.push({
          field: `courseDesign.${field}`,
          message: `课程设计缺少必需字段: ${field}`,
          severity: 'high',
          code: 'MISSING_COURSE_FIELD'
        })
      }
    })

    // 验证ID格式
    if (courseData.id && typeof courseData.id !== 'string') {
      errors.push({
        field: 'courseDesign.id',
        message: '课程ID必须是字符串',
        severity: 'high',
        code: 'INVALID_ID_TYPE'
      })
    }

    // 验证名称
    if (courseData.name && typeof courseData.name !== 'string') {
      errors.push({
        field: 'courseDesign.name',
        message: '课程名称必须是字符串',
        severity: 'medium',
        code: 'INVALID_NAME_TYPE'
      })
    }

    // 验证场地尺寸
    if (courseData.fieldWidth && (typeof courseData.fieldWidth !== 'number' || courseData.fieldWidth <= 0)) {
      errors.push({
        field: 'courseDesign.fieldWidth',
        message: '场地宽度必须是正数',
        severity: 'high',
        code: 'INVALID_FIELD_WIDTH'
      })
    }

    if (courseData.fieldHeight && (typeof courseData.fieldHeight !== 'number' || courseData.fieldHeight <= 0)) {
      errors.push({
        field: 'courseDesign.fieldHeight',
        message: '场地高度必须是正数',
        severity: 'high',
        code: 'INVALID_FIELD_HEIGHT'
      })
    }

    // 验证时间戳格式
    if (typeof courseData.createdAt === 'string' && !this.isValidISO8601(courseData.createdAt)) {
      warnings.push({
        field: 'courseDesign.createdAt',
        message: '创建时间格式不正确',
        suggestion: '使用ISO 8601格式 (YYYY-MM-DDTHH:mm:ss.sssZ)'
      })
    }

    if (typeof courseData.updatedAt === 'string' && !this.isValidISO8601(courseData.updatedAt)) {
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
  private validateObstacles(obstacles: unknown[], errors: JSONValidationError[], warnings: JSONValidationWarning[]): void {
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
      const obstacleData = isRecord(obstacle) ? obstacle : {}
      const fieldPrefix = `courseDesign.obstacles[${index}]`

      // 检查必需字段
      const requiredFields = ['id', 'type', 'position']
      requiredFields.forEach(field => {
        if (!(field in obstacleData)) {
          errors.push({
            field: `${fieldPrefix}.${field}`,
            message: `障碍物 ${index + 1} 缺少必需字段: ${field}`,
            severity: 'high',
            code: 'MISSING_OBSTACLE_FIELD'
          })
        }
      })

      // 验证ID
      if (obstacleData.id && typeof obstacleData.id !== 'string') {
        errors.push({
          field: `${fieldPrefix}.id`,
          message: `障碍物 ${index + 1} 的ID必须是字符串`,
          severity: 'high',
          code: 'INVALID_OBSTACLE_ID'
        })
      }

      // 验证类型
      const validTypes = ['SINGLE', 'DOUBLE', 'COMBINATION', 'WALL', 'LIVERPOOL', 'WATER', 'DECORATION', 'CUSTOM']
      if (typeof obstacleData.type === 'string' && !validTypes.includes(obstacleData.type)) {
        errors.push({
          field: `${fieldPrefix}.type`,
          message: `障碍物 ${index + 1} 的类型无效: ${obstacleData.type}`,
          severity: 'high',
          code: 'INVALID_OBSTACLE_TYPE'
        })
      }

      // 验证位置
      if (obstacleData.position) {
        const position = obstacleData.position
        if (!isRecord(position)) {
          errors.push({
            field: `${fieldPrefix}.position`,
            message: `障碍物 ${index + 1} 的位置必须是对象`,
            severity: 'high',
            code: 'INVALID_POSITION_TYPE'
          })
        } else {
          if (typeof position.x !== 'number') {
            errors.push({
              field: `${fieldPrefix}.position.x`,
              message: `障碍物 ${index + 1} 的X坐标必须是数字`,
              severity: 'high',
              code: 'INVALID_POSITION_X'
            })
          }

          if (typeof position.y !== 'number') {
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
      if (obstacleData.rotation !== undefined && typeof obstacleData.rotation !== 'number') {
        warnings.push({
          field: `${fieldPrefix}.rotation`,
          message: `障碍物 ${index + 1} 的旋转角度应该是数字`,
          suggestion: '确保旋转角度是有效的数值'
        })
      }

      // 验证杆子数据
      if (obstacleData.poles && !Array.isArray(obstacleData.poles)) {
        warnings.push({
          field: `${fieldPrefix}.poles`,
          message: `障碍物 ${index + 1} 的杆子数据应该是数组`,
          suggestion: '确保杆子数据格式正确'
        })
      }

      // 针对CUSTOM类型障碍物的特殊验证
      if (obstacleData.type === 'CUSTOM') {
        this.validateCustomObstacle(obstacleData, index, errors, warnings)
      }

      // 针对DECORATION类型障碍物的装饰物属性验证
      if (obstacleData.type === 'DECORATION' && obstacleData.decorationProperties) {
        this.validateDecorationProperties(obstacleData.decorationProperties, index, errors, warnings)
      }

      // 验证特殊障碍物属性（砖墙、利物浦、水障）
      this.validateSpecialObstacleProperties(obstacleData, index, errors, warnings)

      // 验证杆件配置
      if (Array.isArray(obstacleData.poles)) {
        this.validatePoles(obstacleData.poles, index, errors, warnings)
      }
    })

    // 检查重复ID
    const ids = obstacles
      .map(o => isRecord(o) ? o.id : undefined)
      .filter((id): id is string => typeof id === 'string')
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
  private validatePath(path: unknown, errors: JSONValidationError[], warnings: JSONValidationWarning[]): void {
    const fieldPrefix = 'courseDesign.path'

    // 检查基本结构
    if (!isRecord(path)) {
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

        path.points.forEach((point: unknown, index: number) => {
          const pointPrefix = `${fieldPrefix}.points[${index}]`

          if (!isRecord(point)) {
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

        if (!isRecord(point)) {
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
  private validateViewportInfo(viewportInfo: unknown, errors: JSONValidationError[], warnings: JSONValidationWarning[]): void {
    const fieldPrefix = 'viewportInfo'

    if (!isRecord(viewportInfo)) {
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
        if (!isRecord(viewportInfo.scrollPosition)) {
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
   * 验证自定义障碍物
   * 针对CUSTOM类型障碍物进行特殊验证
   */
  private validateCustomObstacle(
    obstacle: JsonObject,
    index: number,
    errors: JSONValidationError[],
    warnings: JSONValidationWarning[]
  ): void {
    const fieldPrefix = `courseDesign.obstacles[${index}]`

    // 验证customId
    if (!obstacle.customId) {
      warnings.push({
        field: `${fieldPrefix}.customId`,
        message: `自定义障碍物 ${index + 1} 缺少customId字段`,
        suggestion: '添加customId以关联障碍物模板'
      })
    } else if (typeof obstacle.customId !== 'string') {
      errors.push({
        field: `${fieldPrefix}.customId`,
        message: `自定义障碍物 ${index + 1} 的customId必须是字符串`,
        severity: 'medium',
        code: 'INVALID_CUSTOM_ID_TYPE'
      })
    }
  }

  /**
   * 验证装饰物属性
   * 验证DECORATION类型障碍物的decorationProperties
   */
  private validateDecorationProperties(
    properties: unknown,
    obstacleIndex: number,
    errors: JSONValidationError[],
    warnings: JSONValidationWarning[]
  ): void {
    const decorationProperties = isRecord(properties) ? properties : {}
    const fieldPrefix = `courseDesign.obstacles[${obstacleIndex}].decorationProperties`

    // 验证必需字段
    const requiredFields = ['category', 'width', 'height', 'color']
    requiredFields.forEach(field => {
      if (!(field in decorationProperties)) {
        errors.push({
          field: `${fieldPrefix}.${field}`,
          message: `装饰物缺少必需字段: ${field}`,
          severity: 'high',
          code: 'MISSING_DECORATION_FIELD'
        })
      }
    })

    // 验证category
    const validCategories = ['TABLE', 'TREE', 'ENTRANCE', 'EXIT', 'FLOWER', 'FENCE', 'CUSTOM']
    if (typeof decorationProperties.category === 'string' && !validCategories.includes(decorationProperties.category)) {
      errors.push({
        field: `${fieldPrefix}.category`,
        message: `装饰物类别无效: ${decorationProperties.category}`,
        severity: 'high',
        code: 'INVALID_DECORATION_CATEGORY'
      })
    }

    // 验证尺寸
    if (typeof decorationProperties.width !== 'number' || decorationProperties.width <= 0) {
      errors.push({
        field: `${fieldPrefix}.width`,
        message: '装饰物宽度必须是正数',
        severity: 'medium',
        code: 'INVALID_DECORATION_WIDTH'
      })
    }

    if (typeof decorationProperties.height !== 'number' || decorationProperties.height <= 0) {
      errors.push({
        field: `${fieldPrefix}.height`,
        message: '装饰物高度必须是正数',
        severity: 'medium',
        code: 'INVALID_DECORATION_HEIGHT'
      })
    }

    // 验证树特定属性
    if (decorationProperties.category === 'TREE') {
      if (decorationProperties.trunkHeight !== undefined && (typeof decorationProperties.trunkHeight !== 'number' || decorationProperties.trunkHeight <= 0)) {
        warnings.push({
          field: `${fieldPrefix}.trunkHeight`,
          message: '树干高度应该是正数',
          suggestion: '确保树干高度是有效的正数值'
        })
      }
      if (decorationProperties.trunkWidth !== undefined && (typeof decorationProperties.trunkWidth !== 'number' || decorationProperties.trunkWidth <= 0)) {
        warnings.push({
          field: `${fieldPrefix}.trunkWidth`,
          message: '树干宽度应该是正数',
          suggestion: '确保树干宽度是有效的正数值'
        })
      }
      if (decorationProperties.foliageRadius !== undefined && (typeof decorationProperties.foliageRadius !== 'number' || decorationProperties.foliageRadius <= 0)) {
        warnings.push({
          field: `${fieldPrefix}.foliageRadius`,
          message: '树冠半径应该是正数',
          suggestion: '确保树冠半径是有效的正数值'
        })
      }
    }
  }

  /**
   * 验证特殊障碍物属性
   * 验证砖墙、利物浦、水障类型障碍物的特殊属性
   */
  private validateSpecialObstacleProperties(
    obstacle: JsonObject,
    index: number,
    errors: JSONValidationError[],
    warnings: JSONValidationWarning[]
  ): void {
    const fieldPrefix = `courseDesign.obstacles[${index}]`

    // 验证砖墙属性
    if (obstacle.type === 'WALL' && obstacle.wallProperties) {
      const props = isRecord(obstacle.wallProperties) ? obstacle.wallProperties : {}
      const propPrefix = `${fieldPrefix}.wallProperties`

      if (typeof props.height !== 'number' || props.height <= 0) {
        errors.push({
          field: `${propPrefix}.height`,
          message: '砖墙高度必须是正数',
          severity: 'medium',
          code: 'INVALID_WALL_HEIGHT'
        })
      }

      if (typeof props.width !== 'number' || props.width <= 0) {
        errors.push({
          field: `${propPrefix}.width`,
          message: '砖墙宽度必须是正数',
          severity: 'medium',
          code: 'INVALID_WALL_WIDTH'
        })
      }
    }

    // 验证利物浦属性
    if (obstacle.type === 'LIVERPOOL' && obstacle.liverpoolProperties) {
      const props = isRecord(obstacle.liverpoolProperties) ? obstacle.liverpoolProperties : {}
      const propPrefix = `${fieldPrefix}.liverpoolProperties`

      if (typeof props.waterDepth !== 'number' || props.waterDepth <= 0) {
        errors.push({
          field: `${propPrefix}.waterDepth`,
          message: '利物浦水深必须是正数',
          severity: 'medium',
          code: 'INVALID_LIVERPOOL_DEPTH'
        })
      }

      if (props.hasRail && typeof props.railHeight !== 'number') {
        warnings.push({
          field: `${propPrefix}.railHeight`,
          message: '利物浦横杆高度应该是数字',
          suggestion: '当hasRail为true时，应提供有效的railHeight'
        })
      }
    }

    // 验证水障属性
    if (obstacle.type === 'WATER' && obstacle.waterProperties) {
      const props = isRecord(obstacle.waterProperties) ? obstacle.waterProperties : {}
      const propPrefix = `${fieldPrefix}.waterProperties`

      if (typeof props.depth !== 'number' || props.depth <= 0) {
        errors.push({
          field: `${propPrefix}.depth`,
          message: '水障深度必须是正数',
          severity: 'medium',
          code: 'INVALID_WATER_DEPTH'
        })
      }
    }
  }

  /**
   * 验证杆件配置
   * 验证障碍物的杆件数组中每个杆件的必需字段和有效性
   */
  private validatePoles(
    poles: unknown[],
    obstacleIndex: number,
    errors: JSONValidationError[],
    warnings: JSONValidationWarning[]
  ): void {
    const fieldPrefix = `courseDesign.obstacles[${obstacleIndex}].poles`

    poles.forEach((pole, poleIndex) => {
      const poleData = isRecord(pole) ? pole : {}
      const polePrefix = `${fieldPrefix}[${poleIndex}]`

      // 验证必需字段
      const requiredFields = ['height', 'width', 'color']
      requiredFields.forEach(field => {
        if (!(field in poleData)) {
          warnings.push({
            field: `${polePrefix}.${field}`,
            message: `杆件 ${poleIndex + 1} 缺少${field}字段`,
            suggestion: `添加${field}以完善杆件配置`
          })
        }
      })

      // 验证尺寸
      if (typeof poleData.height !== 'number' || poleData.height <= 0) {
        warnings.push({
          field: `${polePrefix}.height`,
          message: `杆件 ${poleIndex + 1} 的高度应该是正数`,
          suggestion: '确保杆件高度是有效的正数值'
        })
      }

      if (typeof poleData.width !== 'number' || poleData.width <= 0) {
        warnings.push({
          field: `${polePrefix}.width`,
          message: `杆件 ${poleIndex + 1} 的宽度应该是正数`,
          suggestion: '确保杆件宽度是有效的正数值'
        })
      }

      // 验证编号位置
      if (poleData.numberPosition) {
        const numberPosition = isRecord(poleData.numberPosition) ? poleData.numberPosition : {}
        if (typeof numberPosition.x !== 'number' || typeof numberPosition.y !== 'number') {
          warnings.push({
            field: `${polePrefix}.numberPosition`,
            message: `杆件 ${poleIndex + 1} 的编号位置坐标无效`,
            suggestion: '确保numberPosition包含有效的x和y坐标'
          })
        }
      }
    })
  }

  /**
   * 生成自定义障碍物统计信息
   */
  private generateCustomObstacleStatistics(courseDesign: unknown): {
    customCount: number
    decorationCount: number
    decorationByCategory: Record<string, number>
    specialObstacleCount: { wall: number; liverpool: number; water: number }
    obstaclesWithCustomId: number
  } {
    const courseData = isRecord(courseDesign) ? courseDesign : {}
    const obstacles = Array.isArray(courseData.obstacles) ? courseData.obstacles : []

    let customCount = 0
    let decorationCount = 0
    const decorationByCategory: Record<string, number> = {}
    const specialObstacleCount = { wall: 0, liverpool: 0, water: 0 }
    let obstaclesWithCustomId = 0

    obstacles.forEach((obstacle: unknown) => {
      const obstacleData = isRecord(obstacle) ? obstacle : {}
      // 统计CUSTOM类型
      if (obstacleData.type === 'CUSTOM') {
        customCount++
      }

      // 统计装饰物
      if (obstacleData.type === 'DECORATION') {
        decorationCount++
        const decorationProperties = isRecord(obstacleData.decorationProperties)
          ? obstacleData.decorationProperties
          : {}
        if (typeof decorationProperties.category === 'string') {
          const category = decorationProperties.category
          decorationByCategory[category] = (decorationByCategory[category] || 0) + 1
        }
      }

      // 统计特殊障碍物
      if (obstacleData.type === 'WALL') specialObstacleCount.wall++
      if (obstacleData.type === 'LIVERPOOL') specialObstacleCount.liverpool++
      if (obstacleData.type === 'WATER') specialObstacleCount.water++

      // 统计包含customId的障碍物
      if (obstacleData.customId) {
        obstaclesWithCustomId++
      }
    })

    return {
      customCount,
      decorationCount,
      decorationByCategory,
      specialObstacleCount,
      obstaclesWithCustomId
    }
  }

  /**
   * 生成统计信息
   */
  private generateStatistics(data: unknown): JSONStatistics {
    try {
      const originalJson = JSON.stringify(data, null, 2)
      const compressedJson = JSON.stringify(data)

      const originalSize = originalJson.length
      const compressedSize = compressedJson.length
      const compressionRatio = originalSize > 0 ? (originalSize - compressedSize) / originalSize : 0

      const rootData = isRecord(data) ? data : {}
      const courseDesign = isRecord(rootData.courseDesign) ? rootData.courseDesign : {}
      const obstacles = Array.isArray(courseDesign.obstacles) ? courseDesign.obstacles : []
      const path = isRecord(courseDesign.path) ? courseDesign.path : {}
      const points = Array.isArray(path.points) ? path.points : []
      const obstacleCount = obstacles.length
      const pathPointCount = points.length
      const fieldCount = this.countFields(data)
      const nestingDepth = this.calculateNestingDepth(data)

      // 获取自定义障碍物统计信息
      const customObstacleStats = this.generateCustomObstacleStatistics(courseDesign)

      return {
        totalSize: originalSize,
        compressedSize,
        compressionRatio,
        obstacleCount,
        pathPointCount,
        fieldCount,
        nestingDepth,
        customObstacleCount: customObstacleStats.customCount,
        decorationCount: customObstacleStats.decorationCount,
        decorationByCategory: customObstacleStats.decorationByCategory,
        specialObstacleCount: customObstacleStats.specialObstacleCount,
        obstaclesWithCustomId: customObstacleStats.obstaclesWithCustomId
      }
    } catch {
      return this.createEmptyStatistics()
    }
  }

  /**
   * 生成建议
   */
  private generateRecommendations(
    data: unknown,
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
      nestingDepth: 0,
      customObstacleCount: 0,
      decorationCount: 0,
      decorationByCategory: {},
      specialObstacleCount: { wall: 0, liverpool: 0, water: 0 },
      obstaclesWithCustomId: 0
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
  private countFields(obj: unknown, visited = new Set<unknown>()): number {
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
  private calculateNestingDepth(obj: unknown, visited = new Set<unknown>()): number {
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
