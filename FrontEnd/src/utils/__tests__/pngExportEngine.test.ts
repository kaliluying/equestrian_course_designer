/**
 * PNG导出引擎测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PNGExportEngine } from '../pngExportEngine'
import { ExportFormat, ExportStage } from '@/types/export'

// Mock html2canvas
vi.mock('html2canvas', () => ({
  default: vi.fn(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 600
    return Promise.resolve(canvas)
  })
}))

describe('PNGExportEngine', () => {
  let pngEngine: PNGExportEngine
  let mockCanvas: HTMLElement

  beforeEach(() => {
    pngEngine = new PNGExportEngine()

    // 创建模拟画布元素
    mockCanvas = document.createElement('div')
    mockCanvas.style.width = '800px'
    mockCanvas.style.height = '600px'
    document.body.appendChild(mockCanvas)
  })

  it('should export PNG with default options', async () => {
    const result = await pngEngine.exportToPNG(mockCanvas)

    expect(result.success).toBe(true)
    expect(result.format).toBe(ExportFormat.PNG)
    expect(result.data).toBeInstanceOf(Blob)
    expect(result.metadata.fileName).toBe('course-design.png')
  })

  it('should handle custom export options', async () => {
    const customOptions = {
      scale: 3,
      backgroundColor: 'transparent',
      quality: 0.8,
      fileName: 'custom-export.png'
    }

    const result = await pngEngine.exportToPNG(mockCanvas, customOptions)

    expect(result.success).toBe(true)
    expect(result.metadata.fileName).toBe('custom-export.png')
  })

  it('should call progress callback during export', async () => {
    const progressCallback = vi.fn()

    await pngEngine.exportToPNG(mockCanvas, {}, progressCallback)

    expect(progressCallback).toHaveBeenCalled()

    // 检查是否调用了不同的阶段
    const calls = progressCallback.mock.calls
    const stages = calls.map(call => call[0].stage)

    expect(stages).toContain(ExportStage.INITIALIZING)
    expect(stages).toContain(ExportStage.PREPARING_CANVAS)
    expect(stages).toContain(ExportStage.RENDERING)
  })

  it('should validate canvas element', async () => {
    // 测试空画布
    const result = await pngEngine.exportToPNG(null as any)

    expect(result.success).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('should apply performance degradation for large exports', async () => {
    // 创建大尺寸画布
    const largeCanvas = document.createElement('div')
    largeCanvas.style.width = '4000px'
    largeCanvas.style.height = '3000px'
    document.body.appendChild(largeCanvas)

    const result = await pngEngine.exportToPNG(largeCanvas, { scale: 4 })

    // 应该有性能警告
    const performanceWarnings = result.warnings.filter(w => w.type === 'performance')
    expect(performanceWarnings.length).toBeGreaterThan(0)
  })

  it('should generate quality report', async () => {
    const result = await pngEngine.exportToPNG(mockCanvas)

    expect(result.qualityReport).toBeDefined()
    expect(result.qualityReport.overallScore).toBeGreaterThanOrEqual(0)
    expect(result.qualityReport.overallScore).toBeLessThanOrEqual(1)
    expect(result.qualityReport.performanceMetrics).toBeDefined()
  })
})
