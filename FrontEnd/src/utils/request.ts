import axios from 'axios'
import type { AxiosRequestConfig, AxiosError } from 'axios'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'
import apiConfig from '@/config/api'
import router from '@/router' // 导入router实例

// 创建 axios 实例
const axiosInstance = axios.create({
  baseURL: apiConfig.apiBaseUrl,
  timeout: 5000,
  // 添加withCredentials以支持跨域请求时携带cookie
  withCredentials: true,
})

// 获取CSRF令牌的函数
const getCsrfToken = async () => {
  try {
    // 从Django获取CSRF令牌
    const response = await axios.get(apiConfig.endpoints.user.csrf, {
      withCredentials: true,
      // 添加时间戳防止缓存
      params: { _t: new Date().getTime() },
    })

    // 如果响应中包含csrfToken，则手动设置cookie
    if (response.data && response.data.csrfToken) {
      document.cookie = `csrftoken=${response.data.csrfToken}; path=/; SameSite=Lax`

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
    // 获取JWT令牌
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    // 对于非GET请求，添加CSRF令牌
    if (config.method !== 'get') {
      // 从cookie中获取CSRF令牌
      const csrfToken = document.cookie
        .split('; ')
        .find((row) => row.startsWith('csrftoken='))
        ?.split('=')[1]

      if (csrfToken) {
        config.headers['X-CSRFToken'] = csrfToken
      } else {
        // 如果cookie中没有，尝试从服务器获取

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

    if (error.response?.status === 401) {
      // Token 过期，尝试使用 refresh token 获取新的 access token
      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken) {
        try {
          const response = await axios.post(apiConfig.endpoints.user.refreshToken, {
            refresh: refreshToken,
          })
          const { access } = response.data
          localStorage.setItem('access_token', access)

          // 重试原始请求
          if (error.config) {
            error.config.headers = error.config.headers || {}
            error.config.headers.Authorization = `Bearer ${access}`
            return axiosInstance(error.config)
          }
        } catch (refreshError) {
          console.error('request.ts: 刷新token失败:', refreshError)
          // Refresh token 也过期了，需要重新登录
          const userStore = useUserStore()
          userStore.logout(router)

          // 显示友好的错误提示
          ElMessage.error({
            message: '登录已过期，请重新登录',
            duration: 3000,
            showClose: true,
            grouping: true,
          })
        }
      } else {
        // 没有refresh token，直接登出
        const userStore = useUserStore()
        userStore.logout(router)

        // 显示友好的错误提示
        ElMessage.error({
          message: '登录已过期，请重新登录',
          duration: 3000,
          showClose: true,
          grouping: true,
        })
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
