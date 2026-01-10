/**
 * JSON导出自定义障碍物完整性测试
 * 验证任务10：验证完整导出功能
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { JSONExportEngine } from '../jsonExportEngine'
import { jsonExportFormatter } from '../jsonExportFormatter'
import { ExportFormat } from '@/types/export'
import type { CourseDesign } from '@/types/obstacle'

// Mock DOM elements
Object.defineProperty(window, 'getComputedStyle', {
  value: () => ({
    getPropertyValue: () => ''
  })
})

describe('JSON Export - Custom Obstacles Complete Functionality', () => {
  let jsonEngine: JSONExportEngine
  let mockCanvas: HTMLElement

  // 创建包含各类自定义障碍物的测试课程数据
  const createComprehensiveTestCourse = (): CourseDesign => {
    return {
      id: 'comprehensive-test-course',
      name: '自定义障碍物完整测试课程',
      obstacles: [
        // 1. CUSTOM类型障碍物 - 带customId
        {
          id: 'custom-1',
          type: 'CUSTOM',
          position: { x: 10, y: 10 },
          rotation: 45,
          number: '1',
          numberPosition: { x: 12, y: 12 },
          customId: 'template-custom-001',
          poles: [
            { height: 1.2, width: 0.1, color: '#ffffff', number: '1A', numberPosition: { x: 10, y: 10 } }
          ]
        },
        // 2. DECORATION类型障碍物 - TABLE
        {
          id: 'decoration-table-1',
          type: 'DECORATION',
          position: { x: 20, y: 20 },
          rotation: 0,
          poles: [],
          decorationProperties: {
            category: 'TABLE',
            width: 2,
            height: 1,
            color: '#8b4513',
            secondaryColor: '#654321',
            borderColor: '#000000',
            borderWidth: 0.05
          }
        },
        // 3. DECORATION类型障碍物 - TREE
        {
          id: 'decoration-tree-1',
          type: 'DECORATION',
          position: { x: 30, y: 30 },
          rotation: 0,
          poles: [],
          decorationProperties: {
            category: 'TREE',
            width: 3,
            height: 5,
            color: '#228b22',
            secondaryColor: '#8b4513',
            trunkHeight: 2,
            trunkWidth: 0.5,
            foliageRadius: 2
          }
        },
        // 4. WALL类型障碍物
        {
          id: 'wall-1',
          type: 'WALL',
          position: { x: 40, y: 40 },
          rotation: 0,
          poles: [],
          wallProperties: {
            height: 1.5,
            width: 3,
            color: '#8b4513',
            texture: 'brick'
          }
        },
        // 5. LIVERPOOL类型障碍物
        {
          id: 'liverpool-1',
          type: 'LIVERPOOL',
          position: { x: 50, y: 50 },
          rotation: 0,
          poles: [],
          liverpoolProperties: {
            height: 1.2,
            width: 4,
            waterDepth: 0.3,
   waterColor: '#0066cc',
            hasRail: true,
            railHeight: 1.2
          }
        },
        // 6. WATER类型障碍物
        {
          id: 'water-1',
          type: 'WATER',
          position: { x: 60, y: 60 },
          rotation: 0,
          poles: [],
          waterProperties: {
            width: 5,
            depth: 0.5,
            color: '#0099ff',
            borderColor: '#003366',
            borderWidth: 0.1
          }
        },
        // 7. CUSTOM类型障碍物 - 缺少customId（用于测试验证）
        {
          id: 'custom-missing-id',
          type: 'CUSTOM',
          position: { x: 70, y: 70 },
          rotation: 0,
          poles: [{ height: 1.0, width: 0.1, color: '#ffffff' }]
        },
        // 8. DECORATION类型障碍物 - ENTRANCE
        {
          id: 'decoration-entrance-1',
          type: 'DECORATION',
          position: { x: 80, y: 80 },
          rotation: 90,
          poles: [],
          decorationProperties: {
            category: 'ENTRANCE',
            width: 4,
            height: 3,
            color: '#ff0000',
            text: 'ENTRANCE',
            textColor: '#ffffff',
            showDirectionArrow: true
          }
        }
      ],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      fieldWidth: 100,
      fieldHeight: 100
    }
  }

  beforeEach(() => {
    jsonEngine = new JSONExportEngine()
    mockCanvas = document.createElement('div')
    document.body.appendChild(mockCanvas)
  })


  describe('Task 10.1: 创建包含各类自定义障碍物的测试课程数据', () => {
    it('应该成功创建包含所有类型自定义障碍物的测试数据', () => {
      const testCourse = createComprehensiveTestCourse()

      expect(testCourse.obstacles).toHaveLength(8)
      expect(testCourse.obstacles.filter(o => o.type === 'CUSTOM')).toHaveLength(2)
      expect(testCourse.obstacles.filter(o => o.type === 'DECORATION')).toHaveLength(3)
      expect(testCourse.obstacles.filter(o => o.type === 'WALL')).toHaveLength(1)
      expect(testCourse.obstacles.filter(o => o.type === 'LIVERPOOL')).toHaveLength(1)
      expect(testCourse.obstacles.filter(o => o.type === 'WATER')).toHaveLength(1)
    })
  })

  describe('Task 10.2: 执行JSON导出', () => {
    it('应该成功导出包含自定义障碍物的课程', async () => {
      const testCourse = createComprehensiveTestCourse()
      mockCanvas.setAttribute('data-course-design', JSON.stringify(testCourse))

      const result = await jsonEngine.exportToJSON(mockCanvas)

      expect(result.success).toBe(true)
      expect(result.format).toBe(ExportFormat.JSON)
      expect(typeof result.data).toBe('string')
      expect(result.data.length).toBeGreaterThan(0)
    })

    it('应该在导出过程中不产生严重错误', async () => {
      const testCourse = createComprehensiveTestCourse()
      mockCanvas.setAttribute('data-course-design', JSON.stringify(testCourse))

      const result = await jsonEngine.exportToJSON(mockCanvas)

      expect(result.errors.filter(e => e.type === 'CANVAS_ACCESS_ERROR')).toHaveLength(0)
      expect(result.errors.filter(e => e.type === 'FILE_GENERATION_ERROR')).toHaveLength(0)
    })
  })

  describe('Task 10.3: 验证导出的JSON包含所有自定义障碍物字段', () => {
    it('应该导出CUSTOM类型障碍物的customId字段', async () => {
      const testCourse = createComprehensiveTestCourse()
      mockCanvas.setAttribute('data-course-design', JSON.stringify(testCourse))

      const result = await jsonEngine.exportToJSON(mockCanvas)
      const parsedData = JSON.parse(result.data as string)
      const customObstacle = parsedData.courseDesign.obstacles.find((o: any) => o.id === 'custom-1')

      expect(customObstacle).toBeDefined()
      expect(customObstacle.customId).toBe('template-custom-001')
      expect(customObstacle.numberPosition).toEqual({ x: 12, y: 12 })
    })

    it('应该导出DECORATION类型障碍物的decorationProperties', async () => {
      const testCourse = createComprehensiveTestCourse()
      mockCanvas.setAttribute('data-course-design', JSON.stringify(testCourse))

      const result = await jsonEngine.exportToJSON(mockCanvas)
      const parsedData = JSON.parse(result.data as string)

      // 验证TABLE装饰物
      const tableDecoration = parsedData.courseDesign.obstacles.find((o: any) => o.id === 'decoration-table-1')
      expect(tableDecoration).toBeDefined()
      expect(tableDecoration.decorationProperties).toBeDefined()
      expect(tableDecoration.decorationProperties.category).toBe('TABLE')
      expect(tableDecoration.decorationProperties.width).toBe(2)
      expect(tableDecoration.decorationProperties.height).toBe(1)
      expect(tableDecoration.decorationProperties.color).toBe('#8b4513')
      expect(tableDecoration.decorationProperties.borderColor).toBe('#000000')

      // 验证TREE装饰物
      const treeDecoration = parsedData.courseDesign.obstacles.find((o: any) => o.id === 'decoration-tree-1')
      expect(treeDecoration).toBeDefined()
      expect(treeDecoration.decorationProperties).toBeDefined()
      expect(treeDecoration.decorationProperties.category).toBe('TREE')
      expect(treeDecoration.decorationProperties.trunkHeight).toBe(2)
      expect(treeDecoration.decorationProperties.trunkWidth).toBe(0.5)
      expect(treeDecoration.decorationProperties.foliageRadius).toBe(2)

      // 验证ENTRANCE装饰物
      const entranceDecoration = parsedData.courseDesign.obstacles.find((o: any) => o.id === 'decoration-entrance-1')
      expect(entranceDecoration).toBeDefined()
      expect(entranceDecoration.decorationProperties).toBeDefined()
      expect(entranceDecoration.decorationProperties.category).toBe('ENTRANCE')
      expect(entranceDecoration.decorationProperties.text).toBe('ENTRANCE')
      expect(entranceDecoration.decorationProperties.showDirectionArrow).toBe(true)
    })

    it('应该导出WALL类型障碍物的wallProperties', async () => {
      const testCourse = createComprehensiveTestCourse()
      mockCanvas.setAttribute('data-course-design', JSON.stringify(testCourse))

      const result = await jsonEngine.exportToJSON(mockCanvas)
      const parsedData = JSON.parse(result.data as string)
      const wallObstacle = parsedData.courseDesign.obstacles.find((o: any) => o.id === 'wall-1')

      expect(wallObstacle).toBeDefined()
      expect(wallObstacle.wallProperties).toBeDefined()
      expect(wallObstacle.wallProperties.height).toBe(1.5)
      expect(wallObstacle.wallProperties.width).toBe(3)
      expect(wallObstacle.wallProperties.color).toBe('#8b4513')
      expect(wallObstacle.wallProperties.texture).toBe('brick')
    })

    it('应该导出LIVERPOOL类型障碍物的liverpoolProperties', async () => {
      const testCourse = createComprehensiveTestCourse()
      mockCanvas.setAttribute('data-course-design', JSON.stringify(testCourse))

      const result = await jsonEngine.exportToJSON(mockCanvas)
      const parsedData = JSON.parse(result.data as string)
      const liverpoolObstacle = parsedData.courseDesign.obstacles.find((o: any) => o.id === 'liverpool-1')

      expect(liverpoolObstacle).toBeDefined()
      expect(liverpoolObstacle.liverpoolProperties).toBeDefined()
      expect(liverpoolObstacle.liverpoolProperties.height).toBe(1.2)
      expect(liverpoolObstacle.liverpoolProperties.width).toBe(4)
      expect(liverpoolObstacle.liverpoolProperties.waterDepth).toBe(0.3)
      expect(liverpoolObstacle.liverpoolProperties.waterColor).toBe('#0066cc')
      expect(liverpoolObstacle.liverpoolProperties.hasRail).toBe(true)
      expect(liverpoolObstacle.liverpoolProperties.railHeight).toBe(1.2)
    })

    it('应该导出WATER类型障碍物的waterProperties', async () => {
      const testCourse = createComprehensiveTestCourse()
      mockCanvas.setAttribute('data-course-design', JSON.stringify(testCourse))

      const result = await jsonEngine.exportToJSON(mockCanvas)
      const parsedData = JSON.parse(result.data as string)
      const waterObstacle = parsedData.courseDesign.obstacles.find((o: any) => o.id === 'water-1')

      expect(waterObstacle).toBeDefined()
      expect(waterObstacle.waterProperties).toBeDefined()
      expect(waterObstacle.waterProperties.width).toBe(5)
      expect(waterObstacle.waterProperties.depth).toBe(0.5)
      expect(waterObstacle.waterProperties.color).toBe('#0099ff')
      expect(waterObstacle.waterProperties.borderColor).toBe('#003366')
      expect(waterObstacle.waterProperties.borderWidth).toBe(0.1)
    })

    it('应该导出杆件的numberPosition字段', async () => {
      const testCourse = createComprehensiveTestCourse()
      mockCanvas.setAttribute('data-course-design', JSON.stringify(testCourse))

      const result = await jsonEngine.exportToJSON(mockCanvas)
      const parsedData = JSON.parse(result.data as string)
      const customObstacle = parsedData.courseDesign.obstacles.find((o: any) => o.id === 'custom-1')

      expect(customObstacle.poles).toBeDefined()
      expect(customObstacle.poles).toHaveLength(1)
      expect(customObstacle.poles[0].numberPosition).toEqual({ x: 10, y: 10 })
      expect(customObstacle.poles[0].number).toBe('1A')
    })
  })

  describe('Task 10.4: 验证质量报告包含自定义障碍物统计信息', () => {
    it('应该在质量报告中包含自定义障碍物统计', async () => {
      const testCourse = createComprehensiveTestCourse()
      mockCanvas.setAttribute('data-course-design', JSON.stringify(testCourse))

      const result = await jsonEngine.exportToJSON(mockCanvas, { validateData: true })

      expect(result.qualityReport).toBeDefined()
      expect(result.qualityReport.performanceMetrics).toBeDefined()
      expect(result.qualityReport.performanceMetrics.elementCount).toBe(8)
    })

    it('应该通过formatter验证获取详细的自定义障碍物统计', async () => {
      const testCourse = createComprehensiveTestCourse()
      mockCanvas.setAttribute('data-course-design', JSON.stringify(testCourse))

      const result = await jsonEngine.exportToJSON(mockCanvas, { validateData: true })
      const parsedData = JSON.parse(result.data as string)

      // 使用formatter直接验证以获取详细统计
      const validationResult = jsonExportFormatter.validateJSON(parsedData)

      expect(validationResult.statistics).toBeDefined()
      expect(validationResult.statistics.customObstacleCount).toBe(2)
      expect(validationResult.statistics.decorationCount).toBe(3)
      expect(validationResult.statistics.specialObstacleCount).toBeDefined()
      expect(validationResult.statistics.specialObstacleCount.wall).toBe(1)
      expect(validationResult.statistics.specialObstacleCount.liverpool).toBe(1)
      expect(validationResult.statistics.specialObstacleCount.water).toBe(1)
      expect(validationResult.statistics.obstaclesWithCustomId).toBe(1)
    })

    it('应该按类别统计装饰物数量', async () => {
      const testCourse = createComprehensiveTestCourse()
      mockCanvas.setAttribute('data-course-design', JSON.stringify(testCourse))

      const result = await jsonEngine.exportToJSON(mockCanvas, { validateData: true })
      const parsedData = JSON.parse(result.data as string)

      const validationResult = jsonExportFormatter.validateJSON(parsedData)

      expect(validationResult.statistics.decorationByCategory).toBeDefined()
      expect(validationResult.statistics.decorationByCategory['TABLE']).toBe(1)
      expect(validationResult.statistics.decorationByCategory['TREE']).toBe(1)
      expect(validationResult.statistics.decorationByCategory['ENTRANCE']).toBe(1)
    })
  })

  describe('Task 10.5: 验证验证错误和警告的准确性', () => {
    it('应该检测缺少customId的CUSTOM类型障碍物并生成警告', async () => {
      const testCourse = createComprehensiveTestCourse()
      mockCanvas.setAttribute('data-course-design', JSON.stringify(testCourse))

      const result = await jsonEngine.exportToJSON(mockCanvas, { validateData: true })
      const parsedData = JSON.parse(result.data as string)

      const validationResult = jsonExportFormatter.validateJSON(parsedData)

      // 应该有警告关于缺少customId
      // 查找包含customId的警告（字段名可能是obstacles[6].customId）
      const customIdWarnings = validationResult.warnings.filter(w =>
        w.field.includes('customId') || w.message.includes('customId')
      )
      expect(customIdWarnings.length).toBeGreaterThan(0)
      expect(customIdWarnings.some(w => w.message.includes('缺少customId字段'))).toBe(true)
    })

    it('应该验证装饰物属性的必需字段', async () => {
      // 创建缺少必需字段的装饰物
      const invalidCourse: CourseDesign = {
        id: 'invalid-decoration-test',
        name: '无效装饰物测试',
        obstacles: [
          {
            id: 'invalid-decoration',
            type: 'DECORATION',
            position: { x: 10, y: 10 },
            rotation: 0,
            poles: [],
            decorationProperties: {
              category: 'TABLE',
              width: 2,
              height: 1
              // 缺少color字段
            } as any
          }
        ],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        fieldWidth: 100,
        fieldHeight: 100
      }

      mockCanvas.setAttribute('data-course-design', JSON.stringify(invalidCourse))
      const result = await jsonEngine.exportToJSON(mockCanvas, { validateData: true })
      const parsedData = JSON.parse(result.data as string)

      const validationResult = jsonExportFormatter.validateJSON(parsedData)

      // 应该有错误关于缺少color字段
      const colorErrors = validationResult.errors.filter(e =>
        e.field.includes('decorationProperties') && e.message.includes('color')
      )
      expect(colorErrors.length).toBeGreaterThan(0)
    })

    it('应该验证特殊障碍物属性的数值有效性', async () => {
      // 创建包含无效数值的特殊障碍物
      const invalidCourse: CourseDesign = {
        id: 'invalid-special-test',
        name: '无效特殊障碍物测试',
        obstacles: [
          {
            id: 'invalid-wall',
            type: 'WALL',
            position: { x: 10, y: 10 },
            rotation: 0,
            poles: [],
            wallProperties: {
              height: -1.5, // 无效的负数
              width: 0, // 无效的零值
              color: '#8b4513'
            }
          },
          {
            id: 'invalid-liverpool',
            type: 'LIVERPOOL',
            position: { x: 20, y: 20 },
            rotation: 0,
            poles: [],
            liverpoolProperties: {
              height: 1.2,
         width: 4,
              waterDepth: -0.3, // 无效的负数
              waterColor: '#0066cc'
            }
          }
        ],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        fieldWidth: 100,
        fieldHeight: 100
      }

      mockCanvas.setAttribute('data-course-design', JSON.stringify(invalidCourse))
      const result = await jsonEngine.exportToJSON(mockCanvas, { validateData: true })
      const parsedData = JSON.parse(result.data as string)

      const validationResult = jsonExportFormatter.validateJSON(parsedData)

      // 应该有错误关于无效的尺寸值
      const wallErrors = validationResult.errors.filter(e =>
        e.field.includes('wallProperties') && (e.code === 'INVALID_WALL_HEIGHT' || e.code === 'INVALID_WALL_WIDTH')
      )
      expect(wallErrors.length).toBeGreaterThan(0)

      const liverpoolErrors = validationResult.errors.filter(e =>
        e.field.includes('liverpoolProperties') && e.code === 'INVALID_LIVERPOOL_DEPTH'
      )
      expect(liverpoolErrors.length).toBeGreaterThan(0)
    })

    it('应该验证装饰物类别的有效性', async () => {
      // 创建包含无效类别的装饰物
      const invalidCourse: CourseDesign = {
        id: 'invalid-category-test',
        name: '无效类别测试',
        obstacles: [
          {
            id: 'invalid-category-decoration',
            type: 'DECORATION',
            position: { x: 10, y: 10 },
            rotation: 0,
            poles: [],
            decorationProperties: {
              category: 'INVALID_CATEGORY' as any,
              width: 2,
              height: 1,
              color: '#8b4513'
            }
          }
        ],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        fieldWidth: 100,
        fieldHeight: 100
      }

      mockCanvas.setAttribute('data-course-design', JSON.stringify(invalidCourse))
      const result = await jsonEngine.exportToJSON(mockCanvas, { validateData: true })
      const parsedData = JSON.parse(result.data as string)

      const validationResult = jsonExportFormatter.validateJSON(parsedData)

      // 应该有错误关于无效的类别
      const categoryErrors = validationResult.errors.filter(e =>
        e.code === 'INVALID_DECORATION_CATEGORY'
      )
      expect(categoryErrors.length).toBeGreaterThan(0)
    })


    it('应该验证杆件配置的完整性', async () => {
      // 创建包含不完整杆件配置的障碍物
      const incompletePolesCourse: CourseDesign = {
        id: 'incomplete-poles-test',
        name: '不完整杆件测试',
        obstacles: [
          {
            id: 'incomplete-poles-obstacle',
            type: 'SINGLE',
            position: { x: 10, y: 10 },
            rotation: 0,
            poles: [
              {
                height: 1.2,
                width: 0.1
                // 缺少color字段
              } as any
            ]
          }
        ],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        fieldWidth: 100,
        fieldHeight: 100
      }

      mockCanvas.setAttribute('data-course-design', JSON.stringify(incompletePolesCourse))
      const result = await jsonEngine.exportToJSON(mockCanvas, { validateData: true })
      const parsedData = JSON.parse(result.data as string)

      const validationResult = jsonExportFormatter.validateJSON(parsedData)

      // 应该有警告关于缺少杆件字段
      const poleWarnings = validationResult.warnings.filter(w =>
        w.field.includes('poles') && w.message.includes('color')
      )
      expect(poleWarnings.length).toBeGreaterThan(0)
    })

    it('应该在所有验证通过时提供确认信息', async () => {
      const testCourse = createComprehensiveTestCourse()
      // 移除有问题的障碍物
      testCourse.obstacles = testCourse.obstacles.filter(o => o.id !== 'custom-missing-id')

      mockCanvas.setAttribute('data-course-design', JSON.stringify(testCourse))
      const result = await jsonEngine.exportToJSON(mockCanvas, { validateData: true })

      expect(result.success).toBe(true)
      expect(result.qualityReport.recommendations).toBeDefined()
      expect(result.qualityReport.recommendations.length).toBeGreaterThan(0)
    })
  })

  describe('综合测试：完整导出流程', () => {
    it('应该完整导出并验证所有自定义障碍物功能', async () => {
      const testCourse = createComprehensiveTestCourse()
      mockCanvas.setAttribute('data-course-design', JSON.stringify(testCourse))

      // 执行导出
      const result = await jsonEngine.exportToJSON(mockCanvas, {
        validateData: true,
        prettyPrint: true,
        includeMetadata: true,
        includeViewportInfo: true
      })

      // 1. 验证导出成功
      expect(result.success).toBe(true)
      expect(result.format).toBe(ExportFormat.JSON)

      // 2. 解析导出的JSON
      const parsedData = JSON.parse(result.data as string)

      // 3. 验证所有自定义障碍物字段都被导出
      const obstacles = parsedData.courseDesign.obstacles

      // CUSTOM类型
      const customObstacles = obstacles.filter((o: any) => o.type === 'CUSTOM')
      expect(customObstacles.length).toBe(2)
      expect(customObstacles[0].customId || customObstacles[1].customId).toBeDefined()

      // DECORATION类型
      const decorationObstacles = obstacles.filter((o: any) => o.type === 'DECORATION')
      expect(decorationObstacles.length).toBe(3)
      decorationObstacles.forEach((o: any) => {
        expect(o.decorationProperties).toBeDefined()
        expect(o.decorationProperties.category).toBeDefined()
      })

      // WALL类型
      const wallObstacles = obstacles.filter((o: any) => o.type === 'WALL')
      expect(wallObstacles.length).toBe(1)
      expect(wallObstacles[0].wallProperties).toBeDefined()

      // LIVERPOOL类型
      const liverpoolObstacles = obstacles.filter((o: any) => o.type === 'LIVERPOOL')
      expect(liverpoolObstacles.length).toBe(1)
      expect(liverpoolObstacles[0].liverpoolProperties).toBeDefined()

      // WATER类型
      const waterObstacles = obstacles.filter((o: any) => o.type === 'WATER')
      expect(waterObstacles.length).toBe(1)
      expect(waterObstacles[0].waterProperties).toBeDefined()

      // 4. 验证质量报告
      const validationResult = jsonExportFormatter.validateJSON(parsedData)
      expect(validationResult.statistics.customObstacleCount).toBe(2)
      expect(validationResult.statistics.decorationCount).toBe(3)
      expect(validationResult.statistics.specialObstacleCount.wall).toBe(1)
      expect(validationResult.statistics.specialObstacleCount.liverpool).toBe(1)
      expect(validationResult.statistics.specialObstacleCount.water).toBe(1)

      // 5. 验证错误和警告
      expect(validationResult.warnings.length).toBeGreaterThan(0) // 应该有关于缺少customId的警告
      expect(validationResult.recommendations.length).toBeGreaterThan(0)
    })
  })
})
