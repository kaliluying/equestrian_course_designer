import axios from 'axios'
import type { AxiosRequestConfig, AxiosError } from 'axios'
import { ElMessage } from 'element-plus'
import { logout as logoutApi } from '@/api/user'
import { useUserStore } from '@/stores/user'
import apiConfig from '@/config/api'
import router from '@/router'

// Security fix: Use httpOnly cookies for JWT tokens instead of localStorage
// CSRF token stored in memory (not cookie) since cookie is httpOnly
let csrfTokenInMemory: string | null = null

// 创建 axios 实例
const axiosInstance = axios.create({
  baseURL: apiConfig.apiBaseUrl,
  timeout: 120000,  // 2 minutes for AI generation
  // Security fix: withCredentials is required for cookies to be sent
  withCredentials: true,
})

// 获取CSRF令牌的函数 - now stores in memory
const getCsrfToken = async (): Promise<string | null> => {
  try {
    const response = await axios.get(apiConfig.endpoints.user.csrf, {
      withCredentials: true,
      params: { _t: new Date().getTime() },
    })

    if (response.data && response.data.csrfToken) {
      // Security fix: store in memory, not document.cookie (cookie is httpOnly)
      csrfTokenInMemory = response.data.csrfToken
      return response.data.csrfToken
    }
    return null
  } catch (error) {
    console.error('request.ts: 获取CSRF令牌失败:', error)
    return null
  }
}

// 请求拦截器
axiosInstance.interceptors.request.use(
  async (config) => {
    // Security fix: JWT tokens now come from httpOnly cookies, not Authorization header
    // Remove the old Authorization header since we're using cookies
    delete config.headers.Authorization

    // 对于非GET请求，添加CSRF令牌 (from memory)
    if (config.method !== 'get') {
      if (csrfTokenInMemory) {
        config.headers['X-CSRFToken'] = csrfTokenInMemory
      } else {
        // If no token in memory, fetch from server
        const newCsrfToken = await getCsrfToken()
        if (newCsrfToken) {
          config.headers['X-CSRFToken'] = newCsrfToken
        } else {
          console.warn('request.ts: 无法获取CSRF令牌')
        }
      }
    }

    return config
  },
  (error) => {
    console.error('request.ts: 请求错误:', error)
    return Promise.reject(error)
  },
)

// 响应拦截器
axiosInstance.interceptors.response.use(
  (response) => {
    // 直接返回响应数据
    return response.data
  },
  async (error: AxiosError) => {
    console.error(
      'request.ts: 响应错误:',
      error.message,
      error.response?.status,
      error.config?.url,
      error.response?.data,
    )

    const originalRequest = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined
    const isRefreshRequest = originalRequest?.url?.includes(apiConfig.endpoints.user.refreshToken) ?? false

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isRefreshRequest) {
      originalRequest._retry = true

      try {
        await axios.post(
          apiConfig.endpoints.user.refreshToken,
          {},
          {
            baseURL: apiConfig.apiBaseUrl,
            withCredentials: true,
          },
        )

        return axiosInstance(originalRequest)
      } catch (refreshError) {
        console.error('request.ts: 刷新token失败:', refreshError)
        const userStore = useUserStore()

        try {
          await logoutApi()
        } catch (logoutError) {
          console.error('request.ts: 调用登出接口失败:', logoutError)
        }

        await userStore.logout(router, false)
      }
    }

    // 构建错误消息
    let errorMessage = '请求失败'
    if (error.response?.data) {
      const data = error.response.data
      if (typeof data === 'string') {
        errorMessage = data
      } else if (typeof data === 'object' && data !== null) {
        if ('detail' in data && typeof data.detail === 'string') {
          errorMessage = data.detail
        } else if ('message' in data && typeof data.message === 'string') {
          errorMessage = data.message
        } else if ('error' in data && typeof data.error === 'string') {
          errorMessage = data.error
        } else {
          // 尝试将整个对象转为字符串
          try {
            errorMessage = JSON.stringify(data)
          } catch {
            errorMessage = '未知错误'
          }
        }
      }
    } else if (error.message) {
      if (error.message === 'Network Error') {
        errorMessage = '网络错误，请检查您的网络连接'
      } else if (error.message.includes('timeout')) {
        errorMessage = '请求超时，请稍后重试'
      } else {
        errorMessage = error.message
      }
    }

    // 显示错误消息
    ElMessage.error({
      message: errorMessage,
      duration: 5000,
      showClose: true,
      grouping: true,
    })

    return Promise.reject(error)
  },
)

// 创建一个包装的请求对象，处理泛型类型
const request = {
  get: <T>(url: string, config: AxiosRequestConfig = {}) => {
    return axiosInstance.get<T, T>(url, config)
  },
  post: <T>(url: string, data?: unknown, config: AxiosRequestConfig = {}) => {
    return axiosInstance.post<T, T>(url, data, config)
  },
  put: <T>(url: string, data?: unknown, config: AxiosRequestConfig = {}) => {
    return axiosInstance.put<T, T>(url, data, config)
  },
  delete: <T>(url: string, config: AxiosRequestConfig = {}) => {
    return axiosInstance.delete<T, T>(url, config)
  },
}

export { request }
