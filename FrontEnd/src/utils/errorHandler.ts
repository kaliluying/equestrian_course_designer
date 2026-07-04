/**
 * @file errorHandler.ts
 * @description 统一错误处理工具
 * 提供错误分类、用户友好消息映射、错误上报等功能
 */

import { ElMessage, ElNotification } from 'element-plus'

/**
 * 错误类型枚举
 */
export enum ErrorType {
  NETWORK = 'NETWORK',
  AUTH = 'AUTH',
  VALIDATION = 'VALIDATION',
  BUSINESS = 'BUSINESS',
  SYSTEM = 'SYSTEM',
  UNKNOWN = 'UNKNOWN'
}

/**
 * 错误级别枚举
 */
export enum ErrorLevel {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

/**
 * 错误信息接口
 */
export interface ErrorInfo {
  type: ErrorType
  level: ErrorLevel
  message: string
  originalError?: Error | unknown
  context?: Record<string, unknown>
  timestamp: number
}

/**
 * 错误消息映射表
 */
const ERROR_MESSAGES: Record<string, string> = {
  // 网络错误
  'Network Error': '网络连接失败，请检查网络设置',
  'timeout': '请求超时，请稍后重试',
  'ERR_NETWORK': '网络异常，请检查网络连接',
  
  // 认证错误
  '401': '登录已过期，请重新登录',
  '403': '没有权限访问此资源',
  'Token expired': '登录已过期，请重新登录',
  
  // 验证错误
  '400': '请求参数错误',
  '422': '数据验证失败',
  
  // 业务错误
  '404': '请求的资源不存在',
  '409': '操作冲突，请刷新后重试',
  
  // 服务器错误
  '500': '服务器内部错误，请稍后重试',
  '502': '服务器网关错误',
  '503': '服务暂时不可用，请稍后重试',
  '504': '服务器响应超时'
}

interface HttpErrorLike {
  code?: string
  response?: {
    status?: number
    data?: {
      message?: string | Record<string, unknown>
    }
  }
}

function toHttpError(error: unknown): HttpErrorLike {
  return typeof error === 'object' && error !== null ? error as HttpErrorLike : {}
}

/**
 * 分类错误类型
 */
function classifyError(error: unknown): ErrorType {
  if (!error) return ErrorType.UNKNOWN

  const errorStr = String(error)
  const errorObj = toHttpError(error)

  // 网络错误
  if (
    errorStr.includes('Network Error') ||
    errorStr.includes('ERR_NETWORK') ||
    errorStr.includes('timeout') ||
    errorObj?.code === 'ECONNABORTED'
  ) {
    return ErrorType.NETWORK
  }

  // 认证错误
  if (
    errorObj?.response?.status === 401 ||
    errorObj?.response?.status === 403 ||
    errorStr.includes('Token expired') ||
    errorStr.includes('Unauthorized')
  ) {
    return ErrorType.AUTH
  }

  // 验证错误
  if (
    errorObj?.response?.status === 400 ||
    errorObj?.response?.status === 422
  ) {
    return ErrorType.VALIDATION
  }

  // 业务错误
  if (
    errorObj?.response?.status === 404 ||
    errorObj?.response?.status === 409
  ) {
    return ErrorType.BUSINESS
  }

  // 系统错误
  const status = errorObj.response?.status || 0
  if (
    status >= 500 ||
    error instanceof TypeError ||
    error instanceof ReferenceError
  ) {
    return ErrorType.SYSTEM
  }

  return ErrorType.UNKNOWN
}

/**
 * 获取用户友好的错误消息
 */
function getUserFriendlyMessage(error: unknown): string {
  if (!error) return '发生未知错误'

  const errorObj = toHttpError(error)

  // 优先使用后端返回的消息
  if (errorObj?.response?.data?.message) {
    const backendMessage = errorObj.response.data.message
    if (typeof backendMessage === 'string') {
      return backendMessage
    }
    if (typeof backendMessage === 'object') {
      // 处理字段验证错误
      const firstError = Object.values(backendMessage)[0]
      if (Array.isArray(firstError) && firstError.length > 0) {
        return String(firstError[0])
      }
    }
  }

  // 使用状态码映射
  const statusCode = errorObj?.response?.status
  if (statusCode && ERROR_MESSAGES[String(statusCode)]) {
    return ERROR_MESSAGES[String(statusCode)]
  }

  // 使用错误消息映射
  const errorStr = String(error)
  for (const [key, message] of Object.entries(ERROR_MESSAGES)) {
    if (errorStr.includes(key)) {
      return message
    }
  }

  // 默认消息
  if (error instanceof Error) {
    return error.message || '操作失败，请稍后重试'
  }

  return '操作失败，请稍后重试'
}

/**
 * 确定错误级别
 */
function determineErrorLevel(type: ErrorType, statusCode?: number): ErrorLevel {
  if (type === ErrorType.AUTH) return ErrorLevel.WARNING
  if (type === ErrorType.VALIDATION) return ErrorLevel.WARNING
  if (type === ErrorType.BUSINESS) return ErrorLevel.INFO
  if (statusCode && statusCode >= 500) return ErrorLevel.CRITICAL
  if (type === ErrorType.SYSTEM) return ErrorLevel.CRITICAL
  return ErrorLevel.ERROR
}

/**
 * 处理错误并显示提示
 */
export function handleError(error: unknown, context?: Record<string, unknown>): ErrorInfo {
  const type = classifyError(error)
  const message = getUserFriendlyMessage(error)
  const statusCode = toHttpError(error).response?.status
  const level = determineErrorLevel(type, statusCode)

  const errorInfo: ErrorInfo = {
    type,
    level,
    message,
    originalError: error,
    context,
    timestamp: Date.now()
  }

  // 显示用户提示
  showErrorNotification(errorInfo)

  // 记录错误（开发环境）
  if (import.meta.env.DEV) {
    console.error('[Error Handler]', errorInfo)
  }

  // 上报错误（生产环境）
  if (import.meta.env.PROD) {
    reportError(errorInfo)
  }

  return errorInfo
}

/**
 * 显示错误通知
 */
function showErrorNotification(errorInfo: ErrorInfo): void {
  const { type, level, message } = errorInfo

  // 认证错误使用通知
  if (type === ErrorType.AUTH) {
    ElNotification({
      title: '认证失败',
      message,
      type: 'warning',
      duration: 5000,
      position: 'top-right'
    })
    return
  }

  // 严重错误使用通知
  if (level === ErrorLevel.CRITICAL) {
    ElNotification({
      title: '系统错误',
      message,
      type: 'error',
      duration: 0, // 不自动关闭
      position: 'top-right'
    })
    return
  }

  // 其他错误使用消息提示
  const messageType = level === ErrorLevel.WARNING ? 'warning' : 
                     level === ErrorLevel.INFO ? 'info' : 'error'
  
  ElMessage({
    message,
    type: messageType,
    duration: 3000,
    showClose: true
  })
}

/**
 * 上报错误到监控系统
 * TODO: 集成 Sentry 或其他错误监控服务
 */
function reportError(errorInfo: ErrorInfo): void {
  // 这里可以集成 Sentry、LogRocket 等错误监控服务
  // 示例：
  // if (window.Sentry) {
  //   window.Sentry.captureException(errorInfo.originalError, {
  //     level: errorInfo.level,
  //     tags: { type: errorInfo.type },
  //     extra: errorInfo.context
  //   })
  // }
  
  // 暂时只在控制台记录
  console.error('[Error Report]', errorInfo)
}

/**
 * 创建错误处理装饰器（用于 async 函数）
 */
export function withErrorHandler<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  context?: Record<string, unknown>
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args)
    } catch (error) {
      handleError(error, context)
      throw error
    }
  }) as T
}

/**
 * 全局错误处理器（用于 window.onerror）
 */
export function setupGlobalErrorHandler(): void {
  // 捕获未处理的 Promise 错误
  window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault()
    handleError(event.reason, { type: 'unhandledRejection' })
  })

  // 捕获全局错误
  window.addEventListener('error', (event) => {
    event.preventDefault()
    handleError(event.error || event.message, {
      type: 'globalError',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    })
  })
}
