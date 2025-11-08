/**
 * Enhanced Export System Types and Interfaces
 * Defines all TypeScript interfaces, enums, and data models for the export system
 */

// Export Format Enumeration
export enum ExportFormat {
  PNG = 'png',
  PDF = 'pdf',
  JSON = 'json'
}

// Export Stage Enumeration for Progress Tracking
export enum ExportStage {
  INITIALIZING = 'initializing',
  PREPARING_CANVAS = 'preparing_canvas',
  PROCESSING_SVG = 'processing_svg',
  RENDERING = 'rendering',
  VALIDATING_QUALITY = 'validating_quality',
  GENERATING_FILE = 'generating_file',
  FINALIZING = 'finalizing'
}

// Export Error Type Enumeration
export enum ExportErrorType {
  CANVAS_ACCESS_ERROR = 'canvas_access_error',
  SVG_RENDERING_ERROR = 'svg_rendering_error',
  HTML2CANVAS_ERROR = 'html2canvas_error',
  FILE_GENERATION_ERROR = 'file_generation_error',
  QUALITY_VALIDATION_ERROR = 'quality_validation_error',
  MEMORY_ERROR = 'memory_error',
  TIMEOUT_ERROR = 'timeout_error'
}

// Base Export Options Interface
export interface BaseExportOptions {
  fileName?: string
  includeBackground?: boolean
  quality?: number // 0.1-1.0
  timeout?: number // milliseconds
}

// Format-Specific Export Options
export interface PNGExportOptions extends BaseExportOptions {
  scale: number // 1-5x scaling factor
  backgroundColor: string // Background color or 'transparent'
  includeWatermark?: boolean
}

export interface PDFExportOptions extends BaseExportOptions {
  paperSize: 'a3' | 'a4' | 'a5' | 'letter'
  orientation: 'auto' | 'landscape' | 'portrait'
  margins: { top: number; right: number; bottom: number; left: number }
  includeFooter?: boolean
  includeMetadata?: boolean
}

export interface JSONExportOptions extends BaseExportOptions {
  includeViewportInfo?: boolean
  includeMetadata?: boolean
  minify?: boolean
  prettyPrint?: boolean
  indentSize?: number
  sortKeys?: boolean
  removeEmptyFields?: boolean
  includeComments?: boolean
  selectiveInclude?: {
    includeObstacles?: boolean
    includePath?: boolean
    includeTimestamps?: boolean
    includeIds?: boolean
    obstacleFields?: string[]
    pathFields?: string[]
    customFields?: Record<string, boolean>
  }
  validateData?: boolean
}

// Union type for all export options
export type ExportOptions = PNGExportOptions | PDFExportOptions | JSONExportOptions

// Export Metadata Interface
export interface ExportMetadata {
  fileName: string
  fileSize: number
  dimensions: { width: number; height: number }
  exportTime: number
  renderingMethod: 'html2canvas' | 'backup' | 'svg-native' | 'json-serialization'
  qualityScore: number
  timestamp: string
  format: ExportFormat
}

// Warning Interface
export interface ExportWarning {
  type: 'performance' | 'quality' | 'compatibility'
  message: string
  severity: 'low' | 'medium' | 'high'
  element?: string
  suggestedAction?: string
}

// Export Error Interface
export interface ExportError extends Error {
  type: ExportErrorType
  stage: ExportStage
  recoverable: boolean
  context: ErrorContext
  suggestedActions: string[]
}

// Error Context Interface
export interface ErrorContext {
  format: ExportFormat
  options: ExportOptions
  canvasElement?: HTMLElement
  timestamp: string
  userAgent: string
  memoryUsage?: number
}

// Export Result Interface
export interface ExportResult {
  success: boolean
  format: ExportFormat
  data: Blob | string // File data or JSON string
  metadata: ExportMetadata
  qualityReport: QualityReport
  warnings: ExportWarning[]
  errors: ExportError[]
}

// Progress Callback Types
export type ProgressCallback = (state: ProgressState) => void
export type CompletionCallback = (result: ExportResult) => void
export type ErrorCallback = (error: ExportError) => void

// Quality Report Interface
export interface QualityReport {
  overallScore: number // 0-1 quality score
  pathCompleteness: number // Percentage of paths correctly rendered
  renderingAccuracy: number // Visual fidelity score
  performanceMetrics: PerformanceMetrics
  recommendations: string[]
  detailedIssues: QualityIssue[]
}

// Quality Issue Interface
export interface QualityIssue {
  type: 'missing_element' | 'rendering_error' | 'style_mismatch' | 'position_offset'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  element?: string
  suggestedFix?: string
}

// Performance Metrics Interface
export interface PerformanceMetrics {
  renderingTime: number // milliseconds
  memoryUsage: number // bytes
  canvasSize: { width: number; height: number }
  elementCount: number
  svgElementCount: number
}

// Progress State Interface
export interface ProgressState {
  stage: ExportStage
  progress: number // 0-100 percentage
  message: string
  subProgress?: number // For detailed stage progress
  estimatedTimeRemaining?: number // milliseconds
}



// Canvas Renderer Options
export interface RenderOptions {
  scale: number
  backgroundColor?: string
  useCORS?: boolean
  allowTaint?: boolean
  foreignObjectRendering?: boolean
  removeContainer?: boolean
  logging?: boolean
}

// Backup Render Options
export interface BackupRenderOptions extends RenderOptions {
  useCanvas2D: boolean
  elementByElement: boolean
  simplifyPaths: boolean
}

// SVG Processing Result
export interface SVGProcessingResult {
  processedElements: number
  optimizedPaths: number
  inlinedStyles: number
  issues: string[]
}

// Recovery Strategy Interface
export interface RecoveryStrategy {
  canRecover(error: ExportError): boolean
  recover(error: ExportError, context: ExportContext): Promise<RecoveryResult>
  getAlternativeApproach(error: ExportError): AlternativeApproach
}

// Recovery Result Interface
export interface RecoveryResult {
  success: boolean
  result?: ExportResult
  fallbackUsed: boolean
  qualityDegraded: boolean
}

// Alternative Approach Interface
export interface AlternativeApproach {
  method: 'backup_renderer' | 'reduced_quality' | 'simplified_svg' | 'canvas_fallback'
  options: Record<string, unknown>
  expectedQuality: number
}

// Export Context Interface
export interface ExportContext {
  canvas: HTMLElement
  format: ExportFormat
  options: ExportOptions
  startTime: number
  retryCount: number
}

// Export Preferences Interface
export interface ExportPreferences {
  defaultFormat: ExportFormat
  defaultOptions: Record<ExportFormat, ExportOptions>
  rememberLastUsed: boolean
  autoSavePresets: boolean
  qualityThreshold: number
}

// Export Preset Interface
export interface ExportPreset {
  id: string
  name: string
  format: ExportFormat
  options: ExportOptions
  description?: string
  isDefault?: boolean
  createdAt: string
  updatedAt: string
}

// Canvas Element Information
export interface CanvasElementInfo {
  element: HTMLElement
  bounds: DOMRect
  styles: CSSStyleDeclaration
  children: CanvasElementInfo[]
  type: 'svg' | 'path' | 'obstacle' | 'decoration' | 'text' | 'other'
}

// Export Event Types
export interface ExportEvents {
  'export:started': { format: ExportFormat; options: ExportOptions }
  'export:progress': { stage: ExportStage; progress: number }
  'export:completed': { result: ExportResult }
  'export:failed': { error: ExportError; context: ExportContext }
  'export:quality-warning': { issues: QualityIssue[] }
}

// Retry Configuration
export interface RetryConfig {
  maxRetries: number
  baseDelay: number // milliseconds
  maxDelay: number // milliseconds
  backoffMultiplier: number
  retryableErrors: ExportErrorType[]
}

// Cache Configuration
export interface CacheConfig {
  enabled: boolean
  maxSize: number // bytes
  ttl: number // milliseconds
  keyStrategy: 'content-hash' | 'element-id' | 'timestamp'
}

// Web Worker Configuration
export interface WebWorkerConfig {
  enabled: boolean
  maxWorkers: number
  taskThreshold: number // minimum task size to use worker
  timeoutMs: number
}
