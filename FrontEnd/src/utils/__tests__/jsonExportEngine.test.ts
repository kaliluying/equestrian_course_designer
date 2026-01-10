/**
 * JSON导出引擎测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { JSONExportEngine } from '../jsonExportEngine'
import { ExportFormat, ExportStage } from '@/types/export'

// Mock DOM elements
Object.defineProperty(window, 'getComputedStyle', {
  value: () => ({
    getPropertyValue: () => ''
  })
})

describe('JSONExportEngine', () => {
  let jsonEngine: JSONExportEngine
  let mockCanvas: HTMLElement

  beforeEach(() => {
    jsonEngine = new JSONExportEngine()

    // 创建模拟画布元素
    mockCanvas = document.createElement('div')
    mockCanvas.setAttribute('data-course-design', JSON.stringify({
      id: 'test-course-1',
      name: '测试课程',
      obstacles: [
        {
          id: 'obstacle-1',
          type: 'SINGLE',
          position: { x: 100, y: 200 },
          rotation: 0,
          poles: [{ height: 1.2, width: 0.1, color: '#ffffff' }]
        }
      ],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      fieldWidth: 60,
      fieldHeight: 40,
      path: {
        visible: true,
        points: [
          { x: 50, y: 50 },
          { x: 150, y: 150 }
        ],
        startPoint: { x: 50, y: 50, rotation: 0 },
        endPoint: { x: 150, y: 150, rotation: 0 }
      }
    }))
    document.body.appendChild(mockCanvas)
  })

  it('should export JSON with default options', async () => {
    const result = await jsonEngine.exportToJSON(mockCanvas)

    expect(result.success).toBe(true)
    expect(result.format).toBe(ExportFormat.JSON)
    expect(typeof result.data).toBe('string')
    expect(result.metadata.fileName).toBe('course-design.json')

    // 验证JSON数据可以解析
    const parsedData = JSON.parse(result.data as string)
    expect(parsedData.version).toBeDefined()
    expect(parsedData.courseDesign).toBeDefined()
    expect(parsedData.courseDesign.obstacles).toHaveLength(1)
  })

  it('should include custom obstacle fields in default export', async () => {
    // 创建包含自定义障碍物字段的测试数据
    const customObstacleCanvas = document.createElement('div')
    customObstacleCanvas.setAttribute('data-course-design', JSON.stringify({
      id: 'test-course-custom',
      name: '自定义障碍物测试',
      obstacles: [
        {
          id: 'obstacle-custom-1',
          type: 'CUSTOM',
          position: { x: 100, y: 200 },
          rotation: 45,
          number: 1,
          numberPosition: { x: 105, y: 205 },
          customId: 'custom-template-123',
          poles: [{ height: 1.2, width: 0.1, color: '#ffffff' }]
        },
        {
          id: 'obstacle-decoration-1',
          type: 'DECORATION',
          position: { x: 150, y: 250 },
          rotation: 0,
          decorationProperties: {
            category: 'TREE',
            width: 2,
            height: 3,
            color: '#00ff00',
            trunkHeight: 1,
            trunkWidth: 0.5,
            foliageRadius: 1.5
          }
        },
        {
          id: 'obstacle-wall-1',
          type: 'WALL',
          position: { x: 200, y: 300 },
          rotation: 0,
          wallProperties: {
            height: 1.5,
            width: 3,
            color: '#8b4513',
            texture: 'brick'
          }
        },
        {
          id: 'obstacle-liverpool-1',
          type: 'LIVERPOOL',
          position: { x: 250, y: 350 },
          rotation: 0,
          liverpoolProperties: {
            height: 1.2,
            width: 4,
            waterDepth: 0.3,
            waterColor: '#0066cc',
            hasRail: true,
            railHeight: 1.2
          }
        },
        {
          id: 'obstacle-water-1',
          type: 'WATER',
          position: { x: 300, y: 400 },
          rotation: 0,
          waterProperties: {
            width: 5,
            depth: 0.5,
            color: '#0099ff',
            borderColor: '#003366',
            borderWidth: 0.1
          }
        }
      ],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      fieldWidth: 60,
      fieldHeight: 40
    }))
    document.body.appendChild(customObstacleCanvas)

    const result = await jsonEngine.exportToJSON(customObstacleCanvas)

    expect(result.success).toBe(true)

    const parsedData = JSON.parse(result.data as string)
    const obstacles = parsedData.courseDesign.obstacles

    // 验证CUSTOM类型障碍物包含所有自定义字段
    const customObstacle = obstacles.find((o: any) => o.type === 'CUSTOM')
    expect(customObstacle).toBeDefined()
    expect(customObstacle.customId).toBe('custom-template-123')
    expect(customObstacle.numberPosition).toEqual({ x: 105, y: 205 })

    // 验证DECORATION类型障碍物包含decorationProperties
    const decorationObstacle = obstacles.find((o: any) => o.type === 'DECORATION')
    expect(decorationObstacle).toBeDefined()
    expect(decorationObstacle.decorationProperties).toBeDefined()
    expect(decorationObstacle.decorationProperties.category).toBe('TREE')
    expect(decorationObstacle.decorationProperties.trunkHeight).toBe(1)
    expect(decorationObstacle.decorationProperties.foliageRadius).toBe(1.5)

    // 验证WALL类型障碍物包含wallProperties
    const wallObstacle = obstacles.find((o: any) => o.type === 'WALL')
    expect(wallObstacle).toBeDefined()
    expect(wallObstacle.wallProperties).toBeDefined()
    expect(wallObstacle.wallProperties.height).toBe(1.5)
    expect(wallObstacle.wallProperties.texture).toBe('brick')

    // 验证LIVERPOOL类型障碍物包含liverpoolProperties
    const liverpoolObstacle = obstacles.find((o: any) => o.type === 'LIVERPOOL')
    expect(liverpoolObstacle).toBeDefined()
    expect(liverpoolObstacle.liverpoolProperties).toBeDefined()
    expect(liverpoolObstacle.liverpoolProperties.waterDepth).toBe(0.3)
    expect(liverpoolObstacle.liverpoolProperties.hasRail).toBe(true)

    // 验证WATER类型障碍物包含waterProperties
    const waterObstacle = obstacles.find((o: any) => o.type === 'WATER')
    expect(waterObstacle).toBeDefined()
    expect(waterObstacle.waterProperties).toBeDefined()
    expect(waterObstacle.waterProperties.depth).toBe(0.5)
    expect(waterObstacle.waterProperties.borderColor).toBe('#003366')
  })

  it('should handle custom export options', async () => {
    const customOptions = {
      minify: true,
      includeViewportInfo: false,
      includeMetadata: false,
      fileName: 'custom-export.json'
    }

    const result = await jsonEngine.exportToJSON(mockCanvas, customOptions)

    expect(result.success).toBe(true)
    expect(result.metadata.fileName).toBe('custom-export.json')

    const parsedData = JSON.parse(result.data as string)
    expect(parsedData.viewportInfo).toBeUndefined()
    expect(parsedData.metadata).toBeUndefined()
  })

  it('should call progress callback during export', async () => {
    const progressCallback = vi.fn()

    await jsonEngine.exportToJSON(mockCanvas, {}, progressCallback)

    expect(progressCallback).toHaveBeenCalled()

    // 检查是否调用了不同的阶段
    const calls = progressCallback.mock.calls
    const stages = calls.map(call => call[0].stage)

    expect(stages).toContain(ExportStage.INITIALIZING)
    expect(stages).toContain(ExportStage.PREPARING_CANVAS)
    expect(stages).toContain(ExportStage.GENERATING_FILE)
  })

  it('should validate canvas element', async () => {
    // 测试空画布
    const result = await jsonEngine.exportToJSON(null as any)

    expect(result.success).toBe(false)
    expect(result.errors).toHaveLength(1)
  })

  it('should handle selective data inclusion', async () => {
    const selectiveOptions = {
      selectiveInclude: {
        includeObstacles: true,
        includePath: false,
        includeTimestamps: false,
        obstacleFields: ['id', 'type', 'position']
      }
    }

    const result = await jsonEngine.exportToJSON(mockCanvas, selectiveOptions)

    expect(result.success).toBe(true)

    const parsedData = JSON.parse(result.data as string)
    expect(parsedData.courseDesign.obstacles).toBeDefined()
    expect(parsedData.courseDesign.path).toBeUndefined()
    expect(parsedData.courseDesign.createdAt).toBeUndefined()
    expect(parsedData.courseDesign.updatedAt).toBeUndefined()

    // 检查障碍物字段是否被正确过滤
    const obstacle = parsedData.courseDesign.obstacles[0]
    expect(obstacle.id).toBeDefined()
    expect(obstacle.type).toBeDefined()
    expect(obstacle.position).toBeDefined()
    expect(obstacle.poles).toBeUndefined() // 不在选择的字段中
  })

  it('should generate quality report', async () => {
    const result = await jsonEngine.exportToJSON(mockCanvas)

    expect(result.qualityReport).toBeDefined()
    expect(result.qualityReport.overallScore).toBeGreaterThan(0)
    expect(result.qualityReport.pathCompleteness).toBeGreaterThan(0)
    expect(result.qualityReport.renderingAccuracy).toBe(1.0) // JSON导出总是100%准确
    expect(result.qualityReport.recommendations).toBeInstanceOf(Array)
  })

  it('should handle formatting options', async () => {
    const formattingOptions = {
      prettyPrint: true,
      indentSize: 4,
      sortKeys: true,
      removeEmptyFields: true
    }

    const result = await jsonEngine.exportToJSON(mockCanvas, formattingOptions)

    expect(result.success).toBe(true)

    const jsonString = result.data as string
    // 检查是否使用了4个空格缩进
    expect(jsonString).toContain('    ') // 4个空格
    // 检查是否格式化了（包含换行符）
    expect(jsonString).toContain('\n')
  })

  it('should handle validation when enabled', async () => {
    // 使用正常的画布进行验证测试
    const result = await jsonEngine.exportToJSON(mockCanvas, { validateData: true })

    // 验证功能应该正常工作
    expect(result.success).toBe(true)
    expect(result.qualityReport).toBeDefined()
    expect(result.qualityReport.overallScore).toBeGreaterThan(0)
  })

  it('should handle compression', async () => {
    const minifiedResult = await jsonEngine.exportToJSON(mockCanvas, { minify: true })
    const prettyResult = await jsonEngine.exportToJSON(mockCanvas, { minify: false, prettyPrint: true })

    expect(minifiedResult.success).toBe(true)
    expect(prettyResult.success).toBe(true)

    // 压缩版本应该更小
    expect((minifiedResult.data as string).length).toBeLessThan((prettyResult.data as string).length)

    // 压缩版本不应包含多余的空白
    expect(minifiedResult.data as string).not.toContain('\n')
    expect(minifiedResult.data as string).not.toContain('  ')

    // 美化版本应包含格式化
    expect(prettyResult.data as string).toContain('\n')
    expect(prettyResult.data as string).toContain('  ')
  })

  describe('Path Validation', () => {
    it('should validate path with complete data', async () => {
      // 使用包含完整路径数据的画布
      const result = await jsonEngine.exportToJSON(mockCanvas)

      expect(result.success).toBe(true)
      expect(result.qualityReport.pathCompleteness).toBeGreaterThan(60)

      // 解析导出的数据
      const parsedData = JSON.parse(result.data as string)
      const validation = parsedData.metadata?.validationResults

      expect(validation).toBeDefined()
      expect(validation.statistics.hasPath).toBe(true)
      expect(validation.statistics.pathPointCount).toBe(2)
    })

    it('should detect invalid path point coordinates', async () => {
      // 创建包含无效路径点的画布
      const invalidCanvas = document.createElement('div')
      invalidCanvas.setAttribute('data-course-design', JSON.stringify({
        id: 'test-course-2',
        name: '无效路径测试',
        obstacles: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        fieldWidth: 60,
        fieldHeight: 40,
        path: {
          visible: true,
          points: [
            { x: NaN, y: 50 }, // 无效的x坐标
            { x: 150, y: 'invalid' } // 无效的y坐标
          ],
          startPoint: { x: 50, y: 50, rotation: 0 },
          endPoint: { x: 150, y: 150, rotation: 0 }
        }
      }))
      document.body.appendChild(invalidCanvas)

      const result = await jsonEngine.exportToJSON(invalidCanvas)

      expect(result.success).toBe(true) // 导出仍然成功，但有警告

      const parsedData = JSON.parse(result.data as string)
      const validation = parsedData.metadata?.validationResults

      expect(validation.issues.length).toBeGreaterThan(0)
      expect(validation.isValid).toBe(false)
    })

    it('should detect missing start point', async () => {
      const noStartPointCanvas = document.createElement('div')
      noStartPointCanvas.setAttribute('data-course-design', JSON.stringify({
        id: 'test-course-3',
        name: '缺少起点测试',
        obstacles: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        fieldWidth: 60,
        fieldHeight: 40,
        path: {
          visible: true,
          points: [
            { x: 50, y: 50 },
            { x: 150, y: 150 }
          ],
          endPoint: { x: 150, y: 150, rotation: 0 }
        }
      }))
      document.body.appendChild(noStartPointCanvas)

      const result = await jsonEngine.exportToJSON(noStartPointCanvas)

      expect(result.success).toBe(true)

      const parsedData = JSON.parse(result.data as string)
      const validation = parsedData.metadata?.validationResults

      expect(validation.warnings).toContain('路径缺少起点信息')
      expect(validation.suggestions).toContain('添加起点以完善路径设计')
    })

    it('should detect missing end point', async () => {
      const noEndPointCanvas = document.createElement('div')
      noEndPointCanvas.setAttribute('data-course-design', JSON.stringify({
        id: 'test-course-4',
        name: '缺少终点测试',
        obstacles: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        fieldWidth: 60,
        fieldHeight: 40,
        path: {
          visible: true,
          points: [
            { x: 50, y: 50 },
            { x: 150, y: 150 }
          ],
          startPoint: { x: 50, y: 50, rotation: 0 }
        }
      }))
      document.body.appendChild(noEndPointCanvas)

      const result = await jsonEngine.exportToJSON(noEndPointCanvas)

      expect(result.success).toBe(true)

      const parsedData = JSON.parse(result.data as string)
      const validation = parsedData.metadata?.validationResults

      expect(validation.warnings).toContain('路径缺少终点信息')
      expect(validation.suggestions).toContain('添加终点以完善路径设计')
    })

    it('should detect insufficient path points', async () => {
      const fewPointsCanvas = document.createElement('div')
      fewPointsCanvas.setAttribute('data-course-design', JSON.stringify({
        id: 'test-course-5',
        name: '路径点不足测试',
        obstacles: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        fieldWidth: 60,
        fieldHeight: 40,
        path: {
          visible: true,
          points: [
            { x: 50, y: 50 }
          ],
          startPoint: { x: 50, y: 50, rotation: 0 },
          endPoint: { x: 150, y: 150, rotation: 0 }
        }
      }))
      document.body.appendChild(fewPointsCanvas)

      const result = await jsonEngine.exportToJSON(fewPointsCanvas)

      expect(result.success).toBe(true)

      const parsedData = JSON.parse(result.data as string)
      const validation = parsedData.metadata?.validationResults

      expect(validation.warnings).toContain('路径至少需要2个点才能形成有效路径')
    })

    it('should validate path points within field boundaries', async () => {
      const outOfBoundsCanvas = document.createElement('div')
      outOfBoundsCanvas.setAttribute('data-course-design', JSON.stringify({
        id: 'test-course-6',
        name: '路径点超出边界测试',
        obstacles: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        fieldWidth: 60,
        fieldHeight: 40,
        path: {
          visible: true,
          points: [
            { x: -10, y: 50 }, // x坐标超出下界
            { x: 70, y: 50 }   // x坐标超出上界
          ],
          startPoint: { x: 50, y: 50, rotation: 0 },
          endPoint: { x: 150, y: 150, rotation: 0 }
        }
      }))
      document.body.appendChild(outOfBoundsCanvas)

      const result = await jsonEngine.exportToJSON(outOfBoundsCanvas)

      expect(result.success).toBe(true)

      const parsedData = JSON.parse(result.data as string)
      const validation = parsedData.metadata?.validationResults

      expect(validation.warnings.some((w: string) => w.includes('超出场地范围'))).toBe(true)
    })

    it('should validate control points', async () => {
      const controlPointsCanvas = document.createElement('div')
      controlPointsCanvas.setAttribute('data-course-design', JSON.stringify({
        id: 'test-course-7',
        name: '控制点测试',
        obstacles: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        fieldWidth: 60,
        fieldHeight: 40,
        path: {
          visible: true,
          points: [
            {
              x: 50,
              y: 50,
              controlPoint1: { x: NaN, y: 60 }, // 无效的控制点
              controlPoint2: { x: 70, y: 'invalid' } // 无效的控制点
            },
            { x: 150, y: 150 }
          ],
          startPoint: { x: 50, y: 50, rotation: 0 },
          endPoint: { x: 150, y: 150, rotation: 0 }
        }
      }))
      document.body.appendChild(controlPointsCanvas)

      const result = await jsonEngine.exportToJSON(controlPointsCanvas)

      expect(result.success).toBe(true)

      const parsedData = JSON.parse(result.data as string)
      const validation = parsedData.metadata?.validationResults

      expect(validation.warnings.some((w: string) => w.includes('控制点'))).toBe(true)
    })

    it('should calculate path completeness with start and end points', async () => {
      // 测试完整路径的完整性分数
      const completePathCanvas = document.createElement('div')
      completePathCanvas.setAttribute('data-course-design', JSON.stringify({
        id: 'test-course-8',
        name: '完整路径测试',
        obstacles: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        fieldWidth: 60,
        fieldHeight: 40,
        path: {
          visible: true,
          points: [
            { x: 10, y: 10 },
            { x: 20, y: 20 },
            { x: 30, y: 30 },
            { x: 40, y: 40 },
            { x: 50, y: 50 }
          ],
          startPoint: { x: 10, y: 10, rotation: 0 },
          endPoint: { x: 50, y: 50, rotation: 90 }
        }
      }))
      document.body.appendChild(completePathCanvas)

      const result = await jsonEngine.exportToJSON(completePathCanvas)

      expect(result.success).toBe(true)
      expect(result.qualityReport.pathCompleteness).toBeGreaterThanOrEqual(80)
    })

    it('should handle path without start and end points', async () => {
      const incompletePathCanvas = document.createElement('div')
      incompletePathCanvas.setAttribute('data-course-design', JSON.stringify({
        id: 'test-course-9',
        name: '不完整路径测试',
        obstacles: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        fieldWidth: 60,
        fieldHeight: 40,
        path: {
          visible: true,
          points: [
            { x: 10, y: 10 },
            { x: 20, y: 20 },
            { x: 30, y: 30 }
          ]
        }
      }))
      document.body.appendChild(incompletePathCanvas)

      const result = await jsonEngine.exportToJSON(incompletePathCanvas)

      expect(result.success).toBe(true)
      expect(result.qualityReport.pathCompleteness).toBeLessThan(90)

      const parsedData = JSON.parse(result.data as string)
      const validation = parsedData.metadata?.validationResults

      expect(validation.warnings).toContain('路径缺少起点信息')
      expect(validation.warnings).toContain('路径缺少终点信息')
    })
  })
})
