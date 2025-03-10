/**
 * 统一错误代码枚举
 * 用于前后端一致的错误类型标识
 */
export enum ErrorCode {
  // 通用错误
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',

  // 障碍物相关错误
  OBSTACLE_NAME_EXISTS = 'OBSTACLE_NAME_EXISTS',
  OBSTACLE_NOT_FOUND = 'OBSTACLE_NOT_FOUND',
  OBSTACLE_LIMIT_REACHED = 'OBSTACLE_LIMIT_REACHED',
  OBSTACLE_DATA_INVALID = 'OBSTACLE_DATA_INVALID',
  LOAD_OBSTACLE_FAILED = 'LOAD_OBSTACLE_FAILED',
  SAVE_OBSTACLE_FAILED = 'SAVE_OBSTACLE_FAILED',
  DELETE_OBSTACLE_FAILED = 'DELETE_OBSTACLE_FAILED',
  LOAD_SHARED_OBSTACLE_FAILED = 'LOAD_SHARED_OBSTACLE_FAILED',
  TOGGLE_SHARING_FAILED = 'TOGGLE_SHARING_FAILED',

  // 用户相关错误
  USER_NOT_LOGGED_IN = 'USER_NOT_LOGGED_IN',
  USER_LIMIT_EXCEEDED = 'USER_LIMIT_EXCEEDED',

  // 权限相关错误
  PREMIUM_REQUIRED = 'PREMIUM_REQUIRED',
}

/**
 * 错误严重程度枚举
 */
export enum ErrorSeverity {
  INFO = 'info', // 提示性错误，不影响主要功能
  WARNING = 'warning', // 警告性错误，可能影响部分功能
  ERROR = 'error', // 严重错误，影响主要功能
  FATAL = 'fatal', // 致命错误，完全无法使用
}

/**
 * 统一错误数据结构
 * 前后端统一使用此结构传递错误信息
 */
export interface ErrorResponse {
  code: ErrorCode // 错误代码
  message: string // 用户友好的错误消息
  severity: ErrorSeverity // 错误严重程度
  details?: string // 详细错误信息（可选）
  solutions?: string[] // 可能的解决方案（可选）
  field?: string // 出错的字段（用于表单验证）
  timestamp?: number // 错误发生的时间戳
}

/**
 * 创建标准错误响应对象
 */
export function createErrorResponse(
  code: ErrorCode,
  message: string,
  severity: ErrorSeverity = ErrorSeverity.ERROR,
  options: Partial<Omit<ErrorResponse, 'code' | 'message' | 'severity'>> = {},
): ErrorResponse {
  return {
    code,
    message,
    severity,
    timestamp: Date.now(),
    ...options,
  }
}

/**
 * 从服务器响应或错误对象中提取错误信息
 */
export function extractErrorFromResponse(error: any): ErrorResponse {
  // 默认错误响应
  const defaultError = createErrorResponse(
    ErrorCode.UNKNOWN_ERROR,
    '发生未知错误，请重试',
    ErrorSeverity.ERROR,
  )

  if (!error) return defaultError

  // 处理标准 API 错误响应
  if (error.response && error.response.data) {
    const responseData = error.response.data

    // 如果后端已经按照我们的错误格式返回
    if (responseData.code && responseData.message) {
      return {
        code: responseData.code as ErrorCode,
        message: responseData.message,
        severity: (responseData.severity as ErrorSeverity) || ErrorSeverity.ERROR,
        details: responseData.details,
        solutions: responseData.solutions,
        field: responseData.field,
        timestamp: responseData.timestamp || Date.now(),
      }
    }

    // 处理常见错误模式
    if (typeof responseData === 'string') {
      // 字符串错误消息
      return createErrorResponse(ErrorCode.SERVER_ERROR, responseData, ErrorSeverity.ERROR)
    } else if (responseData.detail) {
      // Django REST 风格错误
      return createErrorResponse(ErrorCode.SERVER_ERROR, responseData.detail, ErrorSeverity.ERROR)
    } else if (responseData.message) {
      // 带有 message 属性的常见格式
      return createErrorResponse(ErrorCode.SERVER_ERROR, responseData.message, ErrorSeverity.ERROR)
    } else if (responseData.error) {
      // 带有 error 属性的常见格式
      return createErrorResponse(ErrorCode.SERVER_ERROR, responseData.error, ErrorSeverity.ERROR)
    } else if (typeof responseData === 'object') {
      // 尝试查找第一个错误字段
      const firstField = Object.keys(responseData)[0]
      if (firstField && Array.isArray(responseData[firstField])) {
        return createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          `${firstField}: ${responseData[firstField][0]}`,
          ErrorSeverity.WARNING,
          { field: firstField },
        )
      }
    }

    // 根据 HTTP 状态码生成错误
    const status = error.response.status
    if (status === 400) {
      return createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        '请求数据无效，请检查输入',
        ErrorSeverity.WARNING,
      )
    } else if (status === 401) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, '请先登录后再操作', ErrorSeverity.WARNING)
    } else if (status === 403) {
      return createErrorResponse(ErrorCode.FORBIDDEN, '您没有权限执行此操作', ErrorSeverity.WARNING)
    } else if (status === 404) {
      return createErrorResponse(ErrorCode.OBSTACLE_NOT_FOUND, '资源不存在', ErrorSeverity.WARNING)
    } else if (status === 429) {
      return createErrorResponse(
        ErrorCode.SERVER_ERROR,
        '请求过于频繁，请稍后再试',
        ErrorSeverity.WARNING,
      )
    } else if (status >= 500) {
      return createErrorResponse(
        ErrorCode.SERVER_ERROR,
        '服务器错误，请稍后再试',
        ErrorSeverity.ERROR,
      )
    }
  }

  // 处理网络错误
  if (error.message && error.message.includes('Network Error')) {
    return createErrorResponse(
      ErrorCode.NETWORK_ERROR,
      '网络连接失败，请检查您的网络连接',
      ErrorSeverity.ERROR,
    )
  }

  // 处理标准 Error 对象
  if (error instanceof Error) {
    return createErrorResponse(
      ErrorCode.UNKNOWN_ERROR,
      error.message || '发生未知错误',
      ErrorSeverity.ERROR,
    )
  }

  // 处理字符串错误
  if (typeof error === 'string') {
    return createErrorResponse(ErrorCode.UNKNOWN_ERROR, error, ErrorSeverity.ERROR)
  }

  return defaultError
}
