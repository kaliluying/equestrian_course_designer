import { request } from '@/utils/request'
import axios from 'axios'
import apiConfig from '@/config/api'

// 获取CSRF令牌
export const getCsrfToken = async () => {
  try {

    const response = await axios.get(apiConfig.endpoints.user.csrf, {
      withCredentials: true,
      params: { _t: new Date().getTime() },
    })

    return response.data.csrfToken
  } catch (error) {
    console.error('获取CSRF令牌失败:', error)
    return null
  }
}

// 用户注册
export const register = async (data: {
  username: string
  password: string
  confirmPassword: string
  email: string
}) => {
  try {

    // 先获取CSRF令牌
    const csrfToken = await getCsrfToken()



    // 使用axios直接发送请求，确保包含CSRF令牌
    const response = await axios.post(apiConfig.endpoints.user.register, data, {
      withCredentials: true,
      headers: {
        'X-CSRFToken': csrfToken || '',
        'Content-Type': 'application/json',
      },
    })


    return response.data
  } catch (error) {
    console.error('注册请求失败:', error)
    throw error
  }
}

// 用户登录
export const login = async (data: { username: string; password: string }) => {
  try {

    // 先获取CSRF令牌
    const csrfToken = await getCsrfToken()



    // 使用axios直接发送请求，确保包含CSRF令牌
    const response = await axios.post(apiConfig.endpoints.user.login, data, {
      withCredentials: true,
      headers: {
        'X-CSRFToken': csrfToken || '',
        'Content-Type': 'application/json',
      },
    })


    return response.data
  } catch (error) {
    console.error('登录请求失败:', error)
    throw error
  }
}

// 刷新token
export const refreshToken = (data: { refresh: string }) => {
  return request.post(apiConfig.endpoints.user.refreshToken, data)
}

// 忘记密码
export const forgotPassword = (data: { username: string; email: string }) => {
  return request.post(apiConfig.endpoints.user.forgotPassword, data)
}

// 重置密码
export const resetPassword = (data: {
  token: string
  password: string
  confirmPassword: string
}) => {
  return request.post(apiConfig.endpoints.user.resetPassword, data)
}

// 获取当前用户资料
export const getUserProfile = async () => {

  try {
    const response = await request.get(apiConfig.endpoints.user.profile)

    return response
  } catch (error) {
    console.error('获取用户资料失败:', error)
    throw error
  }
}

// 检查用户会员状态（轻量级接口）
export const checkPremiumStatus = async () => {
  try {
    const response = await request.get(`${apiConfig.apiBaseUrl}/user/users/check_premium/`)
    return response
  } catch (error) {
    console.error('检查会员状态失败:', error)
    throw error
  }
}

// 管理员设置用户会员状态
export const setPremiumStatus = async (
  userId: number,
  data: {
    is_premium: boolean
    duration_days?: number
    storage_limit?: number
  },
) => {
  return request.post(apiConfig.endpoints.user.setPremium(userId), data)
}

// 修改密码
export const changePassword = async (data: {
  old_password: string
  new_password: string
  confirm_password: string
}) => {

  try {
    const response = await request.post(apiConfig.endpoints.user.changePassword, data)

    return response
  } catch (error) {
    console.error('修改密码失败:', error)
    throw error
  }
}

// 修改邮箱
export const changeEmail = async (data: { password: string; new_email: string }) => {

  try {
    const response = await request.post(apiConfig.endpoints.user.changeEmail, data)

    return response
  } catch (error) {
    console.error('修改邮箱失败:', error)
    throw error
  }
}

// 创建会员订单
export const createMembershipOrder = async (data: {
  plan_id: number
  billing_cycle: 'month' | 'year'
}) => {

  try {
    const response = await request.post(apiConfig.endpoints.user.createOrder, data)

    return response
  } catch (error) {
    console.error('创建会员订单失败:', error)
    throw error
  }
}

// 获取用户订单列表
export const getUserOrders = async () => {

  try {
    const response = await request.get(apiConfig.endpoints.user.orders)

    return response
  } catch (error) {
    console.error('获取用户订单列表失败:', error)
    throw error
  }
}

// 获取订单状态
export const getOrderStatus = async (orderId: string) => {

  try {
    const response = await request.get(apiConfig.endpoints.user.orderStatus(orderId))

    return response
  } catch (error) {
    console.error('获取订单状态失败:', error)
    throw error
  }
}
