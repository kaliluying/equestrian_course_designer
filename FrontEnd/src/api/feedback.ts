import axios from 'axios'
import { ElMessage } from 'element-plus'

// 导入API配置
import apiConfig from '@/config/api'

const baseURL = apiConfig.apiBaseUrl

// 创建axios实例
const feedbackApi = axios.create({
  baseURL,
  timeout: 10000,
})

// 请求拦截器
feedbackApi.interceptors.request.use(
  (config) => {
    // 从localStorage获取token
    const token = localStorage.getItem('token')
    // 如果有token则添加到请求头
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
feedbackApi.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    // 处理错误响应
    if (error.response) {
      const { status, data } = error.response

      switch (status) {
        case 400:
          ElMessage.error(data.message || '请求参数错误')
          break
        case 401:
          ElMessage.error('未授权，请重新登录')
          break
        case 403:
          ElMessage.error('拒绝访问')
          break
        case 404:
          ElMessage.error('请求的资源不存在')
          break
        case 500:
          ElMessage.error('服务器内部错误')
          break
        default:
          ElMessage.error(`请求失败: ${error.message}`)
      }
    } else {
      ElMessage.error(`网络错误: ${error.message}`)
    }

    return Promise.reject(error)
  },
)

// 反馈接口类型定义
export interface FeedbackForm {
  type: string
  title: string
  content: string
  contact?: string
}

/**
 * 提交用户反馈
 * @param feedback 反馈信息
 * @returns Promise
 */
export const submitUserFeedback = async (feedback: FeedbackForm) => {
  try {
    const response = await feedbackApi.post(apiConfig.endpoints.feedback.submit, feedback)
    return response.data
  } catch (error) {
    console.error('提交反馈失败:', error)
    throw error
  }
}

export default feedbackApi
