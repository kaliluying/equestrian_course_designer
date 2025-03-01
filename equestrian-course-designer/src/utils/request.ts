import axios from 'axios'
import type { AxiosRequestConfig } from 'axios'
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
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  },
)

// 响应拦截器
axiosInstance.interceptors.response.use(
  (response) => {
    // 直接返回响应数据
    return response.data
  },
  async (error) => {
    if (error.response?.status === 401) {
      // Token 过期，尝试使用 refresh token 获取新的 access token
      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken) {
        try {
          const response = await axios.post('/api/token/refresh/', {
            refresh: refreshToken,
          })
          const { access } = response.data
          localStorage.setItem('access_token', access)

          // 重试原始请求
          error.config.headers.Authorization = `Bearer ${access}`
          return axiosInstance(error.config)
        } catch {
          // Refresh token 也过期了，需要重新登录
          const userStore = useUserStore()
          userStore.logout()
          window.dispatchEvent(new Event('token-expired'))
          return Promise.reject(error)
        }
      }
    }

    ElMessage.error(error.response?.data?.message || '请求失败')
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
