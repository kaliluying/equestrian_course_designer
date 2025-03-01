import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { User, LoginForm, RegisterForm, AuthResponse } from '@/types/user'
import { request } from '@/utils/request'

export const useUserStore = defineStore('user', () => {
  const currentUser = ref<User | null>(null)

  const initializeAuth = () => {
    const token = localStorage.getItem('access_token')
    const userData = localStorage.getItem('user')
    if (token && userData) {
      currentUser.value = JSON.parse(userData)
    }
  }

  const login = async (form: LoginForm) => {
    const response = await request.post<AuthResponse>('/login/', form)
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

  const register = async (form: RegisterForm) => {
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
  }

  return {
    currentUser,
    login,
    register,
    logout,
    initializeAuth,
  }
})
