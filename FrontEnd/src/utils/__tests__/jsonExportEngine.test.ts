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
})
