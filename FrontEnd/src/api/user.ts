import { request } from '@/utils/request'
import axios from 'axios'
import apiConfig from '@/config/api'

// 获取CSRF令牌
export const getCsrfToken = async () => {
  try {
    console.log('正在获取CSRF令牌...')
    const response = await axios.get(apiConfig.endpoints.user.csrf, {
      withCredentials: true,
      params: { _t: new Date().getTime() },
    })
    console.log('CSRF令牌获取成功:', response.data)
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
    console.log('开始注册流程，获取CSRF令牌...')
    // 先获取CSRF令牌
    const csrfToken = await getCsrfToken()
    console.log('获取到的CSRF令牌:', csrfToken)

    console.log('发送注册请求...')
    // 使用axios直接发送请求，确保包含CSRF令牌
    const response = await axios.post(apiConfig.endpoints.user.register, data, {
      withCredentials: true,
      headers: {
        'X-CSRFToken': csrfToken || '',
        'Content-Type': 'application/json',
      },
    })

    console.log('注册请求成功，响应数据:', response.data)
    return response.data
  } catch (error) {
    console.error('注册请求失败:', error)
    throw error
  }
}

// 用户登录
export const login = async (data: { username: string; password: string }) => {
  try {
    console.log('开始登录流程，获取CSRF令牌...')
    // 先获取CSRF令牌
    const csrfToken = await getCsrfToken()
    console.log('获取到的CSRF令牌:', csrfToken)

    console.log('发送登录请求...')
    // 使用axios直接发送请求，确保包含CSRF令牌
    const response = await axios.post(apiConfig.endpoints.user.login, data, {
      withCredentials: true,
      headers: {
        'X-CSRFToken': csrfToken || '',
        'Content-Type': 'application/json',
      },
    })

    console.log('登录请求成功，响应数据:', response.data)
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
  console.log('正在获取用户资料...')
  try {
    const response = await request.get(apiConfig.endpoints.user.profile)
    console.log('获取用户资料成功:', response)
    return response
  } catch (error) {
    console.error('获取用户资料失败:', error)
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
  console.log('正在修改密码...')
  try {
    const response = await request.post(apiConfig.endpoints.user.changePassword, data)
    console.log('修改密码成功:', response)
    return response
  } catch (error) {
    console.error('修改密码失败:', error)
    throw error
  }
}

// 修改邮箱
export const changeEmail = async (data: { password: string; new_email: string }) => {
  console.log('正在修改邮箱...')
  try {
    const response = await request.post(apiConfig.endpoints.user.changeEmail, data)
    console.log('修改邮箱成功:', response)
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
  console.log('正在创建会员订单...')
  try {
    const response = await request.post(apiConfig.endpoints.user.createOrder, data)
    console.log('创建会员订单成功:', response)
    return response
  } catch (error) {
    console.error('创建会员订单失败:', error)
    throw error
  }
}

// 获取用户订单列表
export const getUserOrders = async () => {
  console.log('正在获取用户订单列表...')
  try {
    const response = await request.get(apiConfig.endpoints.user.orders)
    console.log('获取用户订单列表成功:', response)
    return response
  } catch (error) {
    console.error('获取用户订单列表失败:', error)
    throw error
  }
}

// 获取订单状态
export const getOrderStatus = async (orderId: string) => {
  console.log('正在获取订单状态...')
  try {
    const response = await request.get(apiConfig.endpoints.user.orderStatus(orderId))
    console.log('获取订单状态成功:', response)
    return response
  } catch (error) {
    console.error('获取订单状态失败:', error)
    throw error
  }
}
