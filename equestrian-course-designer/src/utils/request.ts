import axios from 'axios'
import type { AxiosRequestConfig, AxiosError } from 'axios'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'

// 创建 axios 实例
const axiosInstance = axios.create({
  baseURL: 'http://localhost:8000/user',
  timeout: 5000,
})

// 请求拦截器
axiosInstance.interceptors.request.use(
  (config) => {
    console.log('发送请求:', config.method?.toUpperCase(), config.url, config.data || config.params)

    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    console.error('请求错误:', error)
    return Promise.reject(error)
  },
)

// 响应拦截器
axiosInstance.interceptors.response.use(
  (response) => {
    console.log('响应成功:', response.status, response.config.url, response.data)
    // 直接返回响应数据
    return response.data
  },
  async (error: AxiosError) => {
    console.error(
      '响应错误:',
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
          console.log('尝试刷新token...')
          const response = await axios.post('/api/token/refresh/', {
            refresh: refreshToken,
          })
          const { access } = response.data
          localStorage.setItem('access_token', access)
          console.log('token刷新成功')

          // 重试原始请求
          if (error.config) {
            error.config.headers = error.config.headers || {}
            error.config.headers.Authorization = `Bearer ${access}`
            return axiosInstance(error.config)
          }
        } catch (refreshError) {
          console.error('刷新token失败:', refreshError)
          // Refresh token 也过期了，需要重新登录
          const userStore = useUserStore()
          userStore.logout()
          window.dispatchEvent(new Event('token-expired'))
        }
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
        } else {
          // 尝试将整个对象转为字符串
          try {
            errorMessage = JSON.stringify(data)
          } catch (e) {
            errorMessage = '未知错误'
          }
        }
      }
    } else if (error.message) {
      errorMessage = error.message
    }

    ElMessage.error(errorMessage)
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
