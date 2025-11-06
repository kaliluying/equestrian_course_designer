# 导出质量验证系统

本系统为马术障碍赛路线设计工具提供了完整的导出质量验证功能，确保导出的图片包含完整的路线图。

## 核心功能

### 1. 路径完整性检查 (`exportQualityValidator.ts`)

- **像素级路径分析**: 使用边缘检测算法分析导出图片中的路径
- **关键点验证**: 验证路径的起点、终点和控制点是否正确渲染
- **路径连续性检查**: 检测路径是否存在断裂或缺失

### 2. 导出预览功能 (`ExportPreviewDialog.vue`)

- **实时预览**: 在导出前生成预览图片
- **质量评分**: 提供详细的质量评分和问题报告
- **对比显示**: 支持原始画布与导出预览的并排对比、叠加对比等多种显示模式
- **问题提示**: 显示发现的问题和优化建议

### 3. 集成支持 (`exportQualityIntegration.ts`)

- **一键导出**: 提供带质量验证的导出函数
- **自动重试**: 支持导出失败时的自动重试机制
- **多种渲染方案**: 自动切换html2canvas和Canvas备用渲染

## 使用方法

### 基础使用

```typescript
import { exportQualityValidator } from '@/utils/exportQualityValidator'

// 验证导出质量
const validationResult = await exportQualityValidator.validatePathCompleteness(
  exportedCanvas,
  originalCanvas
)

console.log('路径完整性:', validationResult.pathCompleteness + '%')
console.log('发现问题:', validationResult.issues.length)
```

### 预览功能

```vue
<template>
  <ExportPreviewDialog
    v-model="showPreview"
    :source-canvas="canvasElement"
    :export-options="exportOptions"
    @confirm-export="handleConfirmExport"
  />
</template>

<script setup>
import ExportPreviewDialog from '@/components/ExportPreviewDialog.vue'
import { ref } from 'vue'

const showPreview = ref(false)
const canvasElement = ref(null)
const exportOptions = ref({
  format: 'png',
  quality: 0.95,
  scale: 2
})

const handleConfirmExport = (previewResult) => {
  console.log('质量评分:', previewResult.qualityReport.overallScore)
  // 执行实际导出
}
</script>
```

### 组合式函数

```typescript
import { useExportPreview } from '@/composables/useExportPreview'

const { 
  generatePreview, 
  previewResult, 
  isReady, 
  canExport 
} = useExportPreview()

// 生成预览
await generatePreview(canvasElement, {
  format: 'png',
  enableQualityValidation: true
})

if (canExport.value) {
  console.log('可以安全导出')
}
```

### 集成导出

```typescript
import { quickExportWithValidation, highQualityExport } from '@/utils/exportQualityIntegration'

// 快速导出（默认配置）
const result = await quickExportWithValidation(canvasElement, 'my-route', 'png')

// 高质量导出（启用所有验证）
const result = await highQualityExport(canvasElement, 'my-route', 'png')

if (result.success) {
  console.log('导出成功，质量评分:', result.qualityReport?.overallScore)
} else {
  console.error('导出失败:', result.errors)
}
```

## 质量评分标准

### 路径完整性 (0-100%)
- **100%**: 所有路径都完整渲染
- **80-99%**: 大部分路径正确，少量细节缺失
- **60-79%**: 主要路径存在，但有明显缺失
- **<60%**: 路径严重缺失或不完整

### 渲染质量 (0-1)
- **0.9-1.0**: 优秀 - 所有元素正确渲染
- **0.7-0.9**: 良好 - 轻微渲染问题
- **0.5-0.7**: 一般 - 存在一些渲染问题
- **<0.5**: 较差 - 严重渲染问题

### 样式准确性 (0-1)
- **0.9-1.0**: 样式完全匹配
- **0.7-0.9**: 样式基本匹配，轻微差异
- **0.5-0.7**: 样式有明显差异
- **<0.5**: 样式严重不匹配

## 问题类型

- **missing_path**: 路径缺失
- **incomplete_path**: 路径不完整
- **style_mismatch**: 样式不匹配
- **position_offset**: 位置偏移
- **visibility_issue**: 可见性问题

## 配置选项

### 导出配置
```typescript
interface ExportWithValidationConfig {
  format: 'png' | 'pdf' | 'jpg'
  quality: number // 0-1
  scale: number // 缩放倍数
  backgroundColor: string
  enableQualityValidation: boolean
  showPreview: boolean
  minQualityThreshold: number // 最低质量阈值
  autoRetryOnFailure: boolean
  maxRetryAttempts: number
}
```

### 预览选项
```typescript
interface ExportPreviewOptions {
  format: 'png' | 'pdf' | 'jpg'
  quality: number
  scale: number
  backgroundColor: string
  svgRenderingMode: 'enhanced' | 'fallback' | 'hybrid'
  enableQualityValidation: boolean
  showDetailedReport: boolean
}
```

## 最佳实践

1. **启用质量验证**: 对于包含复杂SVG路径的设计，建议启用质量验证
2. **使用预览功能**: 在正式导出前使用预览功能检查质量
3. **设置合适的阈值**: 根据需求设置最低质量阈值
4. **启用自动重试**: 对于重要的导出，启用自动重试机制
5. **监控质量报告**: 关注质量报告中的建议，优化导出配置

## 故障排除

### 常见问题

1. **路径缺失**: 
   - 检查SVG元素的可见性设置
   - 启用SVG样式内联转换
   - 使用Canvas备用渲染

2. **质量评分低**:
   - 增加导出缩放倍数
   - 启用增强的SVG处理
   - 检查CSS变量是否正确解析

3. **预览生成失败**:
   - 检查画布元素是否存在
   - 确认浏览器支持html2canvas
   - 尝试降低导出质量设置

### 调试模式

```typescript
// 启用调试模式
const config = {
  enableDebugMode: true,
  logSVGProcessing: true
}

const result = await generatePreview(canvas, config)
```

## 性能考虑

- 质量验证会增加导出时间，建议在需要时才启用
- 高分辨率导出会消耗更多内存，注意设备限制
- 预览功能适合在导出前使用，不建议频繁调用

## 浏览器兼容性

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

注意：某些高级功能可能在较旧的浏览器中不可用。