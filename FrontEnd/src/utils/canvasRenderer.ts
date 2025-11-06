/**
 * 画布渲染器
 * 提供统一的画布渲染接口，支持主渲染器和备用渲染器
 */

import { MainCanvasRenderer, EnhancedHtml2CanvasOptions } from './enhancedHtml2CanvasConfig'
import { BackupCanvasRenderer } from './backupCanvasRenderer'
import { RenderOptions, BackupRenderOptions } from '@/types/export'

/**
 * 统一画布渲染器类
 * 整合主渲染器和备用渲染器，提供统一接口
 */
export class CanvasRenderer {
  private mainRenderer: MainCanvasRenderer
  private backupRenderer: BackupCanvasRenderer

  constructor() {
    this.mainRenderer = new MainCanvasRenderer({ debugMode: false })
    this.backupRenderer = new BackupCanvasRenderer()
  }

  /**
   * 使用主渲染器渲染画布
   * @param canvas 画布元素
   * @param options 渲染选项
   * @returns 渲染的画布
   */
  async render(canvas: HTMLElement, options: RenderOptions): Promise<HTMLCanvasElement> {
    // 转换选项格式
    const enhancedOptions: EnhancedHtml2CanvasOptions = {
      backgroundColor: options.backgroundColor,
      scale: options.scale,
      quality: 1.0,
      svgRenderingMode: 'enhanced',
      forceInlineStyles: true,
      preserveSVGViewBox: true,
      enhanceSVGVisibility: true,
      enableDebugMode: options.logging || false,
      logSVGProcessing: options.logging || false,
      textCleanupMode: 'basic'
    }

    return await this.mainRenderer.render(canvas, enhancedOptions)
  }

  /**
   * 使用备用渲染器渲染画布
   * @param canvas 画布元素
   * @param options 备用渲染选项
   * @returns 渲染的画布
   */
  async renderWithBackup(canvas: HTMLElement, options: BackupRenderOptions): Promise<HTMLCanvasElement> {
    return await this.backupRenderer.render(canvas, options)
  }

  /**
   * 获取渲染器统计信息
   * @returns 统计信息
   */
  getStats() {
    return {
      main: this.mainRenderer.getStats(),
      backup: this.backupRenderer.getStats()
    }
  }

  /**
   * 清理渲染器资源
   */
  cleanup(): void {
    // 主渲染器的清理在其内部处理
    this.backupRenderer.cleanup()
  }
}

// 创建全局画布渲染器实例
export const canvasRenderer = new CanvasRenderer()

// 导出类型和实例
export default CanvasRenderer
