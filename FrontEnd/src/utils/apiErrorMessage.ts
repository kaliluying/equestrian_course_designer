type ErrorLike = {
  code?: string
  message?: string
  response?: {
    data?: unknown
  }
}

const CODE_MESSAGES: Record<string, string> = {
  ECONNREFUSED: '无法连接到服务器，请检查网络连接',
  TIMEOUT: '服务器响应超时，请稍后重试',
  NETWORK_ERROR: '网络错误，请检查网络连接',
}

const stringifyMessage = (message: unknown): string | null => {
  if (typeof message === 'string') {
    return message
  }

  if (Array.isArray(message)) {
    return message.map(stringifyMessage).filter(Boolean).join('；') || null
  }

  if (message && typeof message === 'object') {
    const parts = Object.values(message)
      .map(stringifyMessage)
      .filter(Boolean)
    return parts.join('；') || null
  }

  return null
}

export const getApiErrorMessage = (
  error: unknown,
  fallbackMessage = '请求失败'
): string => {
  const maybeError = error as ErrorLike
  const data = maybeError.response?.data

  if (typeof data === 'string') {
    return data
  }

  if (data && typeof data === 'object') {
    const responseData = data as Record<string, unknown>
    const message = stringifyMessage(
      responseData.message ?? responseData.detail ?? responseData.error
    )
    if (message) {
      return message
    }
  }

  if (maybeError.message === 'Network Error') {
    return '网络错误，请检查您的网络连接'
  }

  if (maybeError.message?.includes('timeout')) {
    return '请求超时，请稍后重试'
  }

  if (maybeError.code && CODE_MESSAGES[maybeError.code]) {
    return CODE_MESSAGES[maybeError.code]
  }

  return maybeError.message || fallbackMessage
}
