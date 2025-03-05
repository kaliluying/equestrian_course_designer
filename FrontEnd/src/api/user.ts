import { request } from '@/utils/request'
import axios from 'axios'

// 获取CSRF令牌
export const getCsrfToken = async () => {
  try {
    console.log('正在获取CSRF令牌...')
    const response = await axios.get('http://127.0.0.1:8000/user/csrf/', {
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
    const response = await axios.post('http://127.0.0.1:8000/user/register/', data, {
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
    const response = await axios.post('http://127.0.0.1:8000/user/login/', data, {
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
  return request.post('/user/token/refresh/', data)
}

// 忘记密码
export const forgotPassword = (data: { username: string; email: string }) => {
  return request.post('/user/forgot-password/', data)
}

// 重置密码
export const resetPassword = (data: {
  token: string
  password: string
  confirmPassword: string
}) => {
  return request.post('/user/reset-password/', data)
}

// 获取当前用户资料
export const getUserProfile = async () => {
  console.log('正在获取用户资料...')
  try {
    const response = await request.get('/user/users/my_profile/')
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
  return request.post(`/user/users/${userId}/set_premium/`, data)
}

// 修改密码
export const changePassword = async (data: {
  old_password: string
  new_password: string
  confirm_password: string
}) => {
  console.log('正在修改密码...')
  try {
    const response = await request.post('/user/users/change_password/', data)
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
    const response = await request.post('/user/users/change_email/', data)
    console.log('修改邮箱成功:', response)
    return response
  } catch (error) {
    console.error('修改邮箱失败:', error)
    throw error
  }
}
