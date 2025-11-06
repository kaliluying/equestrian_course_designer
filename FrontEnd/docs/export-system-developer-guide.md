# 增强导出系统 - 开发者指南

## 概述

增强导出系统是一个全面的、模块化的导出解决方案，支持PNG、PDF和JSON格式的高质量导出。系统采用现代TypeScript架构，提供强大的错误处理、质量验证和进度跟踪功能。

## 系统架构

### 核心组件

1. **导出管理器 (ExportManager)** - 系统的核心协调器
2. **格式特定引擎** - PNG、PDF、JSON导出引擎
3. **质量验证器** - 导出质量检查和验证
4. **错误处理器** - 智能错误恢复和重试机制
5. **进度跟踪器** - 实时进度监控和用户反馈

### 文件结构

```
FrontEnd/src/
├── types/
│   └── export.ts                    # 导出系统类型定义
├── utils/
│   ├── exportManager.ts             # 导出管理器核心
│   ├── pngExportEngine.ts           # PNG导出引擎
│   ├── pdfExportEngine.ts           # PDF导出引擎
│   ├── jsonExportEngine.ts          # JSON导出引擎
│   ├── exportQualityValidator.ts    # 质量验证器
│   ├── exportErrorHandler.ts        # 错误处理器
│   ├── exportProgressTracker.ts     # 进度跟踪器
│   └── svgExportEnhancer.ts         # SVG导出增强器
└── components/
    └── ToolBar.vue                  # 用户界面集成
```

## 快速开始

### 基本用法

```typescript
import { exportManager, ExportFormat } from '@/utils/exportManager'

// 获取画布元素
const canvas = document.querySelector('.course-canvas') as HTMLElement

// 导出为PNG
const result = await exportManager.exportCanvas(
  canvas,
  ExportFormat.PNG,
  {
    scale: 2,
    backgroundColor: 'white',
    quality: 0.9
  },
  {
    onProgress: (state) => console.log(`进度: ${state.progress}%`),
    onComplete: (result) => console.log('导出完成:', result),
    onError: (error) => console.error('导出失败:', error)
  }
)
```

### 高级配置

```typescript
// 自定义PDF导出
const pdfResult = await exportManager.exportCanvas(
  canvas,
  ExportFormat.PDF,
  {
    paperSize: 'a4',
    orientation: 'landscape',
    margins: { top: 20, right: 20, bottom: 20, left: 20 },
    includeMetadata: true,
    quality: 0.95
  }
)

// JSON导出带选择性包含
const jsonResult = await exportManager.exportCanvas(
  canvas,
  ExportFormat.JSON,
  {
    includeViewportInfo: true,
    prettyPrint: true,
    selectiveInclude: {
      includeObstacles: true,
      includePath: true,
      includeTimestamps: false
    }
  }
)
```

## API 参考

### ExportManager

#### 方法

##### `exportCanvas(canvas, format, options?, callbacks?)`

导出画布为指定格式。

**参数:**
- `canvas: HTMLElement` - 要导出的画布元素
- `format: ExportFormat` - 导出格式 (PNG, PDF, JSON)
- `options?: Partial<ExportOptions>` - 导出选项
- `callbacks?` - 回调函数对象

**返回:** `Promise<ExportResult>`

##### `getSupportedFormats()`

获取支持的导出格式列表。

**返回:** `ExportFormat[]`

##### `getDefaultOptions(format)`

获取指定格式的默认选项。

**参数:**
- `format: ExportFormat` - 导出格式

**返回:** `ExportOptions`

##### `savePreset(preset)`

保存导出预设。

**参数:**
- `preset: Omit<ExportPreset, 'id' | 'createdAt' | 'updatedAt'>` - 预设配置

**返回:** `string` - 预设ID

### 导出选项

#### PNG导出选项

```typescript
interface PNGExportOptions {
  scale: number              // 缩放倍数 (1-5)
  backgroundColor: string    // 背景颜色或 'transparent'
  quality?: number          // 图像质量 (0.1-1.0)
  includeWatermark?: boolean // 是否包含水印
}
```

#### PDF导出选项

```typescript
interface PDFExportOptions {
  paperSize: 'a3' | 'a4' | 'a5' | 'letter'  // 纸张大小
  orientation: 'auto' | 'landscape' | 'portrait'  // 方向
  margins: {                                 // 页边距
    top: number
    right: number
    bottom: number
    left: number
  }
  includeFooter?: boolean    // 是否包含页脚
  includeMetadata?: boolean  // 是否包含元数据
  quality?: number          // 图像质量 (0.5-1.0)
}
```

#### JSON导出选项

```typescript
interface JSONExportOptions {
  includeViewportInfo?: boolean    // 包含视口信息
  includeMetadata?: boolean        // 包含元数据
  minify?: boolean                // 压缩输出
  prettyPrint?: boolean           // 格式化输出
  indentSize?: number             // 缩进大小
  selectiveInclude?: {            // 选择性包含
    includeObstacles?: boolean
    includePath?: boolean
    includeTimestamps?: boolean
    // ... 更多选项
  }
}
```

## 质量验证

系统内置质量验证器，自动检查导出结果的质量：

```typescript
// 质量报告示例
interface QualityReport {
  overallScore: number           // 总体质量评分 (0-1)
  pathCompleteness: number       // 路径完整性百分比
  renderingAccuracy: number      // 渲染准确性评分
  performanceMetrics: {          // 性能指标
    renderingTime: number
    memoryUsage: number
    elementCount: number
  }
  recommendations: string[]      // 改进建议
  detailedIssues: QualityIssue[] // 详细问题列表
}
```

## 错误处理

系统提供智能错误处理和恢复机制：

### 自动重试

```typescript
// 配置重试策略
const retryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  backoffMultiplier: 2,
  retryableErrors: ['svg_rendering', 'html2canvas']
}
```

### 错误恢复

系统支持多种恢复策略：
- Canvas备用渲染
- 降低质量重试
- 简化SVG处理
- 分段渲染

### 错误类型

```typescript
enum ExportErrorType {
  CANVAS_ACCESS_ERROR = 'canvas_access_error',
  SVG_RENDERING_ERROR = 'svg_rendering_error',
  HTML2CANVAS_ERROR = 'html2canvas_error',
  FILE_GENERATION_ERROR = 'file_generation_error',
  QUALITY_VALIDATION_ERROR = 'quality_validation_error',
  MEMORY_ERROR = 'memory_error',
  TIMEOUT_ERROR = 'timeout_error'
}
```

## 进度跟踪

系统提供详细的进度跟踪功能：

```typescript
// 进度状态
interface ProgressState {
  stage: ExportStage           // 当前阶段
  progress: number             // 进度百分比 (0-100)
  message: string              // 状态消息
  subProgress?: number         // 子进度
  estimatedTimeRemaining?: number // 预计剩余时间
}

// 导出阶段
enum ExportStage {
  INITIALIZING = 'initializing',
  PREPARING_CANVAS = 'preparing_canvas',
  PROCESSING_SVG = 'processing_svg',
  RENDERING = 'rendering',
  VALIDATING_QUALITY = 'validating_quality',
  GENERATING_FILE = 'generating_file',
  FINALIZING = 'finalizing'
}
```

## 性能优化

### 内存管理

- 自动清理临时资源
- 智能缓存策略
- 内存使用监控

### 渲染优化

- SVG预处理和优化
- 样式内联转换
- 分层渲染策略

### 并发处理

- Web Worker支持（可选）
- 异步处理管道
- 任务队列管理

## 扩展开发

### 添加新的导出格式

1. 创建格式特定的引擎文件
2. 实现导出接口
3. 在导出管理器中注册
4. 添加类型定义

```typescript
// 示例：SVG导出引擎
export class SVGExportEngine {
  async exportToSVG(
    canvas: HTMLElement,
    options: SVGExportOptions,
    onProgress?: ProgressCallback
  ): Promise<ExportResult> {
    // 实现SVG导出逻辑
  }
}
```

### 自定义质量验证器

```typescript
export class CustomQualityValidator {
  async validateCustomCriteria(
    canvas: HTMLCanvasElement,
    originalElement: HTMLElement
  ): Promise<ValidationResult> {
    // 实现自定义验证逻辑
  }
}
```

## 最佳实践

### 1. 错误处理

```typescript
try {
  const result = await exportManager.exportCanvas(canvas, format, options)
  // 处理成功结果
} catch (error) {
  if (error.recoverable) {
    // 尝试恢复策略
  } else {
    // 显示用户友好的错误消息
  }
}
```

### 2. 进度反馈

```typescript
const callbacks = {
  onProgress: (state) => {
    updateProgressBar(state.progress)
    showStatusMessage(state.message)
  },
  onComplete: (result) => {
    showSuccessMessage()
    if (result.warnings.length > 0) {
      showWarnings(result.warnings)
    }
  }
}
```

### 3. 性能优化

```typescript
// 预加载必要的模块
await import('@/utils/pngExportEngine')
await import('@/utils/svgExportEnhancer')

// 使用适当的质量设置
const options = {
  scale: window.devicePixelRatio > 1 ? 2 : 1,
  quality: 0.9 // 平衡质量和文件大小
}
```

## 故障排除

### 常见问题

1. **SVG渲染问题**
   - 检查SVG元素的样式
   - 确保路径定义正确
   - 使用SVG增强器预处理

2. **内存不足**
   - 降低导出分辨率
   - 使用分段渲染
   - 清理不必要的DOM元素

3. **导出质量差**
   - 增加缩放倍数
   - 检查原始元素样式
   - 使用质量验证器诊断

### 调试模式

```typescript
// 启用调试模式
const options = {
  enableDebugMode: true,
  logProcessingSteps: true
}
```

## 版本兼容性

- **浏览器支持:** Chrome 80+, Firefox 75+, Safari 13+, Edge 80+
- **Node.js:** 16+ (用于服务端渲染)
- **TypeScript:** 4.5+

## 许可证

本导出系统遵循项目的整体许可证协议。

---

*最后更新: 2024年11月*