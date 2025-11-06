/**
 * PDF导出引擎测试
 * 验证PDF导出功能的核心逻辑
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PDFExportEngine } from '../pdfExportEngine'
import { ExportFormat } from '@/types/export'

// Mock jsPDF
vi.mock('jspdf', () => ({
  default: vi.fn().mockImplementation(() => ({
    setProperties: vi.fn(),
    addImage: vi.fn(),
    setFontSize: vi.fn(),
    setTextColor: vi.fn(),
    text: vi.fn(),
    getTextWidth: vi.fn().mockReturnValue(50),
    getCurrentPageInfo: vi.fn().mockReturnValue({ pageNumber: 1 }),
    output: vi.fn().mockReturnValue(new Blob(['test'], { type: 'application/pdf' })),
    internal: {
      pageSize: { width: 210, height: 297 }
    },
    setDrawColor: vi.fn(),
    setLineWidth: vi.fn(),
    line: vi.fn(),
    rect: vi.fn(),
    setFillColor: vi.fn(),
    saveGraphicsState: vi.fn(),
    restoreGraphicsState: vi.fn(),
    setGState: vi.fn(),
    GState: vi.fn().mockReturnValue({}),
    getProperties: vi.fn().mockReturnValue({})
  }))
}))

// Mock canvas renderer
vi.mock('../canvasRenderer', () => ({
  canvasRenderer: {
    render: vi.fn().mockResolvedValue({
      width: 800,
      height: 600,
      toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,test')
    }),
    renderWithBackup: vi.fn().mockResolvedValue({
      width: 800,
      height: 600,
      toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,test')
    })
  }
}))

// Mock quality validator
vi.mock('../exportQualityValidator', () => ({
  exportQualityValidator: {
    validatePathCompleteness: vi.fn().mockResolvedValue({
      isValid: true,
      issues: [],
      pathCompleteness: 95,
      keyPointsValidated: 10,
      continuityScore: 90
    }),
    checkSVGRendering: vi.fn().mockResolvedValue({
      svgElementsFound: 5,
      svgElementsRendered: 5,
      pathElementsFound: 3,
      pathElementsRendered: 3,
      renderingIssues: []
    }),
    generateComprehensiveReport: vi.fn().mockReturnValue({
      overallScore: 0.9,
      pathCompleteness: 95,
      renderingAccuracy: 0.9,
      styleAccuracy: 0.85,
      recommendations: ['PDF导出质量良好'],
      detailedResults: []
    })
  }
}))

describe('PDFExportEngine', () => {
  let pdfEngine: PDFExportEngine
  let mockCanvas: HTMLElement

  beforeEach(() => {
    pdfEngine = new PDFExportEngine()

    // 创建模拟画布元素
    mockCanvas = document.createElement('div')
    mockCanvas.style.width = '800px'
    mockCanvas.style.height = '600px'

    // 添加一些SVG内容用于测试
    mockCanvas.innerHTML = `
      <svg width="800" height="600">
        <path d="M10,10 L100,100" stroke="blue" fill="none"/>
        <circle cx="50" cy="50" r="20" fill="red"/>
      </svg>
    `

    // Mock getBoundingClientRect
    vi.spyOn(mockCanvas, 'getBoundingClientRect').mockReturnValue({
      width: 800,
      height: 600,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      toJSON: () => ({})
    } as DOMRect)
  })

  describe('基础PDF导出功能', () => {
    it('应该成功导出基础PDF', async () => {
      const options = {
        paperSize: 'a4' as const,
        orientation: 'auto' as const,
        margins: { top: 20, right: 20, bottom: 20, left: 20 },
        quality: 0.9
      }

      const result = await pdfEngine.exportToPDF(mockCanvas, options)

      expect(result.success).toBe(true)
      expect(result.format).toBe(ExportFormat.PDF)
      expect(result.data).toBeInstanceOf(Blob)
      expect(result.metadata.fileName).toContain('.pdf')
      expect(result.qualityReport.overallScore).toBeGreaterThan(0)
    })

    it('应该处理不同的纸张大小', async () => {
      const paperSizes = ['a3', 'a4', 'a5', 'letter'] as const

      for (const paperSize of paperSizes) {
        const options = {
          paperSize,
          orientation: 'auto' as const,
          margins: { top: 20, right: 20, bottom: 20, left: 20 }
        }

        const result = await pdfEngine.exportToPDF(mockCanvas, options)
        expect(result.success).toBe(true)
      }
    })

    it('应该处理不同的页面方向', async () => {
      const orientations = ['auto', 'portrait', 'landscape'] as const

      for (const orientation of orientations) {
        const options = {
          paperSize: 'a4' as const,
          orientation,
          margins: { top: 20, right: 20, bottom: 20, left: 20 }
        }

        const result = await pdfEngine.exportToPDF(mockCanvas, options)
        expect(result.success).toBe(true)
      }
    })
  })

  describe('PDF格式化和元数据', () => {
    it('应该包含元数据当启用时', async () => {
      const options = {
        paperSize: 'a4' as const,
        orientation: 'auto' as const,
        margins: { top: 20, right: 20, bottom: 20, left: 20 },
        includeMetadata: true,
        fileName: '测试文档'
      }

      const result = await pdfEngine.exportToPDF(mockCanvas, options)

      expect(result.success).toBe(true)
      expect(result.metadata.fileName).toBe('测试文档.pdf')
    })

    it('应该包含页脚当启用时', async () => {
      const options = {
        paperSize: 'a4' as const,
        orientation: 'auto' as const,
        margins: { top: 20, right: 20, bottom: 20, left: 20 },
        includeFooter: true
      }

      const result = await pdfEngine.exportToPDF(mockCanvas, options)

      expect(result.success).toBe(true)
    })
  })

  describe('质量验证', () => {
    it('应该生成质量报告', async () => {
      const options = {
        paperSize: 'a4' as const,
        orientation: 'auto' as const,
        margins: { top: 20, right: 20, bottom: 20, left: 20 }
      }

      const result = await pdfEngine.exportToPDF(mockCanvas, options)

      expect(result.qualityReport).toBeDefined()
      expect(result.qualityReport.overallScore).toBeGreaterThanOrEqual(0)
      expect(result.qualityReport.overallScore).toBeLessThanOrEqual(1)
      expect(Array.isArray(result.qualityReport.recommendations)).toBe(true)
    })

    it('应该检测质量问题', async () => {
      // Mock质量验证器返回问题
      const { exportQualityValidator } = await import('../exportQualityValidator')
      vi.mocked(exportQualityValidator.validatePathCompleteness).mockResolvedValueOnce({
        isValid: false,
        issues: [{
          type: 'missing_path',
          severity: 'high',
          message: '路径缺失',
          expectedValue: 'path',
          actualValue: null
        }],
        pathCompleteness: 60,
        keyPointsValidated: 5,
        continuityScore: 70
      })

      const options = {
        paperSize: 'a4' as const,
        orientation: 'auto' as const,
        margins: { top: 20, right: 20, bottom: 20, left: 20 }
      }

      const result = await pdfEngine.exportToPDF(mockCanvas, options)

      expect(result.success).toBe(true) // 即使有质量问题，导出仍应成功
      expect(result.qualityReport.pathCompleteness).toBeLessThan(95)
    })
  })

  describe('错误处理', () => {
    it('应该处理渲染失败', async () => {
      // Mock渲染器失败
      const { canvasRenderer } = await import('../canvasRenderer')
      vi.mocked(canvasRenderer.render).mockRejectedValueOnce(new Error('渲染失败'))
      vi.mocked(canvasRenderer.renderWithBackup).mockResolvedValueOnce({
        width: 800,
        height: 600,
        toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,backup')
      })

      const options = {
        paperSize: 'a4' as const,
        orientation: 'auto' as const,
        margins: { top: 20, right: 20, bottom: 20, left: 20 }
      }

      const result = await pdfEngine.exportToPDF(mockCanvas, options)

      expect(result.success).toBe(true) // 应该使用备用渲染器成功
    })

    it('应该处理完全失败的情况', async () => {
      // Mock所有渲染器都失败
      const { canvasRenderer } = await import('../canvasRenderer')
      vi.mocked(canvasRenderer.render).mockRejectedValueOnce(new Error('主渲染器失败'))
      vi.mocked(canvasRenderer.renderWithBackup).mockRejectedValueOnce(new Error('备用渲染器失败'))

      const options = {
        paperSize: 'a4' as const,
        orientation: 'auto' as const,
        margins: { top: 20, right: 20, bottom: 20, left: 20 }
      }

      const result = await pdfEngine.exportToPDF(mockCanvas, options)

      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('进度跟踪', () => {
    it('应该报告导出进度', async () => {
      const progressCallback = vi.fn()
      const options = {
        paperSize: 'a4' as const,
        orientation: 'auto' as const,
        margins: { top: 20, right: 20, bottom: 20, left: 20 }
      }

      await pdfEngine.exportToPDF(mockCanvas, options, progressCallback)

      expect(progressCallback).toHaveBeenCalled()

      // 检查是否报告了不同的阶段
      const calls = progressCallback.mock.calls
      const stages = calls.map(call => call[0].stage)

      expect(stages).toContain('preparing_canvas')
      expect(stages).toContain('generating_file')
      expect(stages).toContain('finalizing')
    })
  })
})
