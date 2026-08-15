import { request } from '@/utils/request'
import apiConfig from '@/config/api'

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
export const submitUserFeedback = (feedback: FeedbackForm) => {
  return request.post(apiConfig.endpoints.feedback.submit, feedback)
}
