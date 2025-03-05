import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { User, LoginForm, RegisterForm, AuthResponse } from '@/types/user'
import { request } from '@/utils/request'
import { login } from '@/api/user'

export const useUserStore = defineStore('user', () => {
  const currentUser = ref<User | null>(null)
  const isAuthenticated = ref(false)

  const initializeAuth = () => {
    console.log('初始化用户认证状态...')
    const token = localStorage.getItem('access_token')
    const userData = localStorage.getItem('user')
    if (token && userData) {
      currentUser.value = JSON.parse(userData)
      isAuthenticated.value = true
      console.log('用户已登录:', currentUser.value)
    } else {
      console.log('用户未登录')
    }
  }

  const loginUser = async (form: LoginForm) => {
    try {
      console.log('用户状态管理: 尝试登录:', form.username)
      const response = await login(form)
      console.log('用户状态管理: 登录API响应:', response)

      // 保存令牌到localStorage
      localStorage.setItem('access_token', response.access_token)
      localStorage.setItem('refresh_token', response.refresh_token)
      console.log('用户状态管理: 令牌已保存到localStorage')

      // 保存用户信息到localStorage
      const userData = {
        id: response.user_id,
        username: response.username,
      }
      localStorage.setItem('user', JSON.stringify(userData))
      console.log('用户状态管理: 用户信息已保存到localStorage')

      // 更新用户状态
      currentUser.value = userData
      isAuthenticated.value = true
      console.log('用户状态管理: 用户状态已更新')

      return currentUser.value
    } catch (error) {
      console.error('用户状态管理: 登录失败:', error)
      throw error
    }
  }

  const registerUser = async (form: RegisterForm) => {
    const response = await request.post<AuthResponse>('/register/', form)
    const { access_token, refresh_token, user_id, username } = response

    // 保存 token 和用户信息
    localStorage.setItem('access_token', access_token)
    localStorage.setItem('refresh_token', refresh_token)
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: user_id,
        username: username,
      }),
    )

    // 设置 refresh token 到 cookie
    document.cookie = `refresh_token=${refresh_token}; path=/; secure; samesite=strict`

    currentUser.value = {
      id: user_id,
      username: username,
    }

    return currentUser.value
  }

  const logout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')

    // 清除 cookie 中的 refresh token
    document.cookie = 'refresh_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;'

    currentUser.value = null
    isAuthenticated.value = false
  }

  return {
    currentUser,
    isAuthenticated,
    login: loginUser,
    register: registerUser,
    logout,
    initializeAuth,
  }
})
