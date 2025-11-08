/**
 * JSON导出路径验证测试
 * 测试任务5：测试和验证
 * 验证JSON导出功能正确包含和处理路径数据
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { JSONExportEngine } from '../jsonExportEngine'
import { ExportFormat } from '@/types/export'

// Mock DOM elements
Object.defineProperty(window, 'getComputedStyle', {
  value: () => ({
    getPropertyValue: () => ''
  })
})

describe('JSON Export Path Validation - Task 5', () => {
  let jsonEngine: JSONExportEngine

  beforeEach(() => {
    jsonEngine = new JSONExportEngine()
  })

  describe('测试场景1: 创建包含路径的测试课程设计', () => {
    it('should export course with complete path data', async () => {
      // 创建包含完整路径数据的测试课程
      const mockCanvas = document.createElement('div')
      mockCanvas.setAttribute('data-course-design', JSON.stringify({
        id: 'test-course-with-path',
        name: '包含路径的测试课程',
        obstacles: [
          {
            id: 'obstacle-1',
            type: 'SINGLE',
            position: { x: 100, y: 200 },
            rotation: 0,
            poles: [{ height: 1.2, width: 0.1, color: '#ffffff' }]
          },
          {
            id: 'obstacle-2',
            type: 'DOUBLE',
            position: { x: 300, y: 400 },
            rotation: 45,
            poles: [
              { height: 1.2, width: 0.1, color: '#ffffff' },
              { height: 1.2, width: 0.1, color: '#ffffff', spacing: 0.5 }
            ]
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
            { x: 100, y: 100, controlPoint1: { x: 75, y: 75 }, controlPoint2: { x: 125, y: 125 } },
            { x: 200, y: 200 },
            { x: 300, y: 300, controlPoint1: { x: 250, y: 250 }, controlPoint2: { x: 350, y: 350 } },
            { x: 400, y: 400 }
          ],
          startPoint: { x: 50, y: 50, rotation: 0 },
          endPoint: { x: 400, y: 400, rotation: 90 }
        }
      }))
      document.body.appendChild(mockCanvas)

      const result = await jsonEngine.exportToJSON(mockCanvas)

      expect(result.success).toBe(true)
      expect(result.format).toBe(ExportFormat.JSON)

      const parsedData = JSON.parse(result.data as string)

      // 验证课程设计存在
      expect(parsedData.courseDesign).toBeDefined()
      expect(parsedData.courseDesign.id).toBe('test-course-with-path')
      expect(parsedData.courseDesign.name).toBe('包含路径的测试课程')
    })
  })

  describe('测试场景2: 执行JSON导出并验证path字段存在且完整', () => {
    it('should include path field with all required properties', async () => {
      const mockCanvas = document.createElement('div')
      mockCanvas.setAttribute('data-course-design', JSON.stringify({
        id: 'test-path-completeness',
        name: '路径完整性测试',
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
          ],
          startPoint: { x: 10, y: 10, rotation: 0 },
          endPoint: { x: 30, y: 30, rotation: 90 }
        }
      }))
      document.body.appendChild(mockCanvas)

      const result = await jsonEngine.exportToJSON(mockCanvas)
      const parsedData = JSON.parse(result.data as string)

      // 验证path字段存在
      expect(parsedData.courseDesign.path).toBeDefined()

      // 验证path字段包含所有必需属性
      expect(parsedData.courseDesign.path.visible).toBe(true)
      expect(parsedData.courseDesign.path.points).toBeDefined()
      expect(Array.isArray(parsedData.courseDesign.path.points)).toBe(true)
      expect(parsedData.courseDesign.path.points.length).toBe(3)

      // 验证起点信息完整
      expect(parsedData.courseDesign.path.startPoint).toBeDefined()
      expect(parsedData.courseDesign.path.startPoint.x).toBe(10)
      expect(parsedData.courseDesign.path.startPoint.y).toBe(10)
      expect(parsedData.courseDesign.path.startPoint.rotation).toBe(0)

      // 验证终点信息完整
      expect(parsedData.courseDesign.path.endPoint).toBeDefined()
      expect(parsedData.courseDesign.path.endPoint.x).toBe(30)
      expect(parsedData.courseDesign.path.endPoint.y).toBe(30)
      expect(parsedData.courseDesign.path.endPoint.rotation).toBe(90)
    })

    it('should include path points with control points', async () => {
      const mockCanvas = document.createElement('div')
      mockCanvas.setAttribute('data-course-design', JSON.stringify({
        id: 'test-control-points',
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
              x: 10,
              y: 10,
              controlPoint2: { x: 15, y: 15 }
            },
            {
              x: 30,
              y: 30,
              controlPoint1: { x: 25, y: 25 },
              controlPoint2: { x: 35, y: 35 }
            },
            {
              x: 50,
              y: 50,
              controlPoint1: { x: 45, y: 45 }
            }
          ],
          startPoint: { x: 10, y: 10, rotation: 0 },
          endPoint: { x: 50, y: 50, rotation: 90 }
        }
      }))
      document.body.appendChild(mockCanvas)

      const result = await jsonEngine.exportToJSON(mockCanvas)
      const parsedData = JSON.parse(result.data as string)

      const points = parsedData.courseDesign.path.points

      // 验证第一个点的控制点
      expect(points[0].controlPoint2).toBeDefined()
      expect(points[0].controlPoint2.x).toBe(15)
      expect(points[0].controlPoint2.y).toBe(15)

      // 验证中间点的控制点
      expect(points[1].controlPoint1).toBeDefined()
      expect(points[1].controlPoint2).toBeDefined()

      // 验证最后一个点的控制点
      expect(points[2].controlPoint1).toBeDefined()
      expect(points[2].controlPoint1.x).toBe(45)
      expect(points[2].controlPoint1.y).toBe(45)
    })
  })

  describe('测试场景3: 验证hasPath字段正确反映路径状态', () => {
    it('should set hasPath to true when path exists and is visible', async () => {
      const mockCanvas = document.createElement('div')
      mockCanvas.setAttribute('data-course-design', JSON.stringify({
        id: 'test-has-path-true',
        name: 'hasPath为true的测试',
        obstacles: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        fieldWidth: 60,
        fieldHeight: 40,
        path: {
          visible: true,
          points: [
            { x: 10, y: 10 },
            { x: 20, y: 20 }
          ],
          startPoint: { x: 10, y: 10, rotation: 0 },
          endPoint: { x: 20, y: 20, rotation: 0 }
        }
      }))
      document.body.appendChild(mockCanvas)

      const result = await jsonEngine.exportToJSON(mockCanvas)
      const parsedData = JSON.parse(result.data as string)

      // 验证hasPath字段
      const validation = parsedData.metadata?.validationResults
      expect(validation).toBeDefined()
      expect(validation.statistics.hasPath).toBe(true)
    })

    it('should set hasPath to false when path does not exist', async () => {
      const mockCanvas = document.createElement('div')
      mockCanvas.setAttribute('data-course-design', JSON.stringify({
        id: 'test-has-path-false',
        name: 'hasPath为false的测试',
        obstacles: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        fieldWidth: 60,
        fieldHeight: 40
        // 没有path字段
      }))
      document.body.appendChild(mockCanvas)

      const result = await jsonEngine.exportToJSON(mockCanvas)
      const parsedData = JSON.parse(result.data as string)

      const validation = parsedData.metadata?.validationResults
      expect(validation).toBeDefined()
      expect(validation.statistics.hasPath).toBe(false)
    })
  })

  describe('测试场景4: 测试无路径情况下的导出', () => {
    it('should export successfully without path data', async () => {
      const mockCanvas = document.createElement('div')
      mockCanvas.setAttribute('data-course-design', JSON.stringify({
        id: 'test-no-path',
        name: '无路径测试课程',
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
        fieldHeight: 40
        // 没有path字段
      }))
      document.body.appendChild(mockCanvas)

      const result = await jsonEngine.exportToJSON(mockCanvas)

      expect(result.success).toBe(true)

      const parsedData = JSON.parse(result.data as string)

      // 验证课程设计存在但没有路径
      expect(parsedData.courseDesign).toBeDefined()
      expect(parsedData.courseDesign.path).toBeUndefined()

      // 验证障碍物仍然被正确导出
      expect(parsedData.courseDesign.obstacles).toBeDefined()
      expect(parsedData.courseDesign.obstacles.length).toBe(1)
    })

    it('should have pathCompleteness of 60 when no path exists and no obstacles', async () => {
      const mockCanvas = document.createElement('div')
      mockCanvas.setAttribute('data-course-design', JSON.stringify({
        id: 'test-no-path-completeness',
        name: '无路径完整性测试',
        obstacles: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        fieldWidth: 60,
        fieldHeight: 40
      }))
      document.body.appendChild(mockCanvas)

      const result = await jsonEngine.exportToJSON(mockCanvas)

      expect(result.qualityReport).toBeDefined()
      // 当没有路径且没有障碍物时，pathCompleteness为60
      expect(result.qualityReport.pathCompleteness).toBe(60)
    })

    it('should have pathCompleteness of 80 when no path exists but has obstacles', async () => {
      const mockCanvas = document.createElement('div')
      mockCanvas.setAttribute('data-course-design', JSON.stringify({
        id: 'test-no-path-with-obstacles',
        name: '有障碍物无路径测试',
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
        fieldHeight: 40
      }))
      document.body.appendChild(mockCanvas)

      const result = await jsonEngine.exportToJSON(mockCanvas)

      expect(result.qualityReport).toBeDefined()
      // 当有障碍物但没有路径时，pathCompleteness为80
      expect(result.qualityReport.pathCompleteness).toBe(80)
    })
  })

  describe('测试场景5: 测试路径隐藏时的导出行为', () => {
    it('should export path data even when visible is false', async () => {
      const mockCanvas = document.createElement('div')
      mockCanvas.setAttribute('data-course-design', JSON.stringify({
        id: 'test-hidden-path',
        name: '隐藏路径测试',
        obstacles: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        fieldWidth: 60,
        fieldHeight: 40,
        path: {
          visible: false, // 路径隐藏
          points: [
            { x: 10, y: 10 },
            { x: 20, y: 20 },
            { x: 30, y: 30 }
          ],
          startPoint: { x: 10, y: 10, rotation: 0 },
          endPoint: { x: 30, y: 30, rotation: 90 }
        }
      }))
      document.body.appendChild(mockCanvas)

      const result = await jsonEngine.exportToJSON(mockCanvas)
      const parsedData = JSON.parse(result.data as string)

      // 验证路径数据仍然存在
      expect(parsedData.courseDesign.path).toBeDefined()

      // 验证visible字段为false
      expect(parsedData.courseDesign.path.visible).toBe(false)

      // 验证路径点仍然被导出
      expect(parsedData.courseDesign.path.points).toBeDefined()
      expect(parsedData.courseDesign.path.points.length).toBe(3)

      // 验证起点和终点仍然被导出
      expect(parsedData.courseDesign.path.startPoint).toBeDefined()
      expect(parsedData.courseDesign.path.endPoint).toBeDefined()
    })

    it('should calculate pathCompleteness for hidden paths', async () => {
      const mockCanvas = document.createElement('div')
      mockCanvas.setAttribute('data-course-design', JSON.stringify({
        id: 'test-hidden-path-completeness',
        name: '隐藏路径完整性测试',
        obstacles: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        fieldWidth: 60,
        fieldHeight: 40,
        path: {
          visible: false,
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
      document.body.appendChild(mockCanvas)

      const result = await jsonEngine.exportToJSON(mockCanvas)

      // 即使路径隐藏，也应该计算路径完整性
      expect(result.qualityReport).toBeDefined()
      expect(result.qualityReport.pathCompleteness).toBeGreaterThan(0)
    })
  })

  describe('综合测试: 验证所有需求', () => {
    it('should satisfy all requirements from 1.1 to 3.5', async () => {
      // 创建一个包含所有特性的完整测试课程
      const mockCanvas = document.createElement('div')
      mockCanvas.setAttribute('data-course-design', JSON.stringify({
        id: 'comprehensive-test',
        name: '综合测试课程',
        obstacles: [
          {
            id: 'obstacle-1',
            type: 'SINGLE',
            position: { x: 100, y: 200 },
            rotation: 0,
            poles: [{ height: 1.2, width: 0.1, color: '#ffffff' }]
          },
          {
            id: 'obstacle-2',
            type: 'DOUBLE',
            position: { x: 300, y: 400 },
            rotation: 45,
            poles: [
              { height: 1.2, width: 0.1, color: '#ffffff' },
              { height: 1.2, width: 0.1, color: '#ffffff', spacing: 0.5 }
            ]
          }
        ],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        fieldWidth: 60,
        fieldHeight: 40,
        path: {
          visible: true,
          points: [
            { x: 5, y: 5 },
            { x: 10, y: 10, controlPoint1: { x: 7, y: 7 }, controlPoint2: { x: 13, y: 13 } },
            { x: 20, y: 20, controlPoint1: { x: 17, y: 17 }, controlPoint2: { x: 23, y: 23 } },
            { x: 30, y: 30, controlPoint1: { x: 27, y: 27 }, controlPoint2: { x: 33, y: 33 } },
            { x: 40, y: 40 }
          ],
          startPoint: { x: 5, y: 5, rotation: 0 },
          endPoint: { x: 40, y: 40, rotation: 90 }
        }
      }))
      document.body.appendChild(mockCanvas)

      const result = await jsonEngine.exportToJSON(mockCanvas)
      const parsedData = JSON.parse(result.data as string)

      // 需求 1.1: 导出包含路径可见性状态
      expect(parsedData.courseDesign.path.visible).toBe(true)

      // 需求 1.2: 导出包含所有路径点的坐标和控制点信息
      expect(parsedData.courseDesign.path.points).toBeDefined()
      expect(parsedData.courseDesign.path.points.length).toBe(5)
      expect(parsedData.courseDesign.path.points[1].controlPoint1).toBeDefined()
      expect(parsedData.courseDesign.path.points[1].controlPoint2).toBeDefined()

      // 需求 1.3: 导出包含起点的位置和旋转角度
      expect(parsedData.courseDesign.path.startPoint).toBeDefined()
      expect(parsedData.courseDesign.path.startPoint.x).toBe(5)
      expect(parsedData.courseDesign.path.startPoint.y).toBe(5)
      expect(parsedData.courseDesign.path.startPoint.rotation).toBe(0)

      // 需求 1.4: 导出包含终点的位置和旋转角度
      expect(parsedData.courseDesign.path.endPoint).toBeDefined()
      expect(parsedData.courseDesign.path.endPoint.x).toBe(40)
      expect(parsedData.courseDesign.path.endPoint.y).toBe(40)
      expect(parsedData.courseDesign.path.endPoint.rotation).toBe(90)

      // 需求 1.5: 路径存在时hasPath为true
      const validation = parsedData.metadata?.validationResults
      expect(validation.statistics.hasPath).toBe(true)

      // 需求 2.1-2.5: 数据提取和验证
      expect(result.success).toBe(true)
      expect(parsedData.courseDesign).toBeDefined()

      // 需求 3.1-3.5: 路径数据验证
      expect(validation).toBeDefined()
      expect(validation.statistics.pathPointCount).toBe(5)
      expect(result.qualityReport.pathCompleteness).toBeGreaterThan(80)
    })
  })
})
