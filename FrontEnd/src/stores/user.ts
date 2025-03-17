import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LoginForm, RegisterForm } from '@/types/user'
import { login, register } from '@/api/user'
import type { Router } from 'vue-router'

// 定义用户类型
interface User {
  id: number
  username: string
  is_premium_active?: boolean
}

export const useUserStore = defineStore('user', () => {
  const currentUser = ref<User | null>(null)
  const isAuthenticated = ref(false)

  const initializeAuth = () => {
    const token = localStorage.getItem('access_token')
    const userData = localStorage.getItem('user')
    if (token && userData) {
      currentUser.value = JSON.parse(userData)
      isAuthenticated.value = true

      // 获取最新的用户资料，包括会员状态
      updateUserProfile()
    } else {
    }
  }

  const loginUser = async (form: LoginForm) => {
    try {
      const response = await login(form)

      // 保存令牌到localStorage
      localStorage.setItem('access_token', response.access_token)
      localStorage.setItem('refresh_token', response.refresh_token)

      // 保存用户信息到localStorage
      const userData = {
        id: response.user_id,
        username: response.username,
      }
      localStorage.setItem('user', JSON.stringify(userData))

      // 更新用户状态
      currentUser.value = userData
      isAuthenticated.value = true

      // 获取最新的用户资料，包括会员状态
      updateUserProfile()

      // 在用户登录成功后初始化障碍物存储
      // 动态导入避免循环依赖
      const { useObstacleStore } = await import('@/stores/obstacle')
      const obstacleStore = useObstacleStore()
      obstacleStore.initObstacles()

      return currentUser.value
    } catch (error) {
      console.error('用户状态管理: 登录失败:', error)
      throw error
    }
  }

  const registerUser = async (form: RegisterForm) => {
    try {
      // 使用api中的register方法，它已经处理了CSRF令牌
      const response = await register(form)

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

      isAuthenticated.value = true

      // 在用户注册成功后初始化障碍物存储
      // 动态导入避免循环依赖
      const { useObstacleStore } = await import('@/stores/obstacle')
      const obstacleStore = useObstacleStore()
      obstacleStore.initObstacles()

      return currentUser.value
    } catch (error) {
      console.error('用户状态管理: 注册失败:', error)
      throw error
    }
  }

  const logout = (router?: Router) => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')

    // 清除 cookie 中的 refresh token
    document.cookie = 'refresh_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;'

    currentUser.value = null
    isAuthenticated.value = false

    // 用户登出后清空障碍物存储
    // 动态导入避免循环依赖
    import('@/stores/obstacle').then(({ useObstacleStore }) => {
      const obstacleStore = useObstacleStore()
      obstacleStore.initObstacles() // 这将清空障碍物存储，因为用户已登出
    })

    // 如果提供了router实例，则重定向到首页
    if (router) {
      router.push('/')
    }
  }

  // 更新用户资料，包括会员状态
  const updateUserProfile = async () => {
    if (!isAuthenticated.value || !currentUser.value) return

    try {
      const { getUserProfile } = await import('@/api/user')
      interface UserProfileResponse {
        success: boolean
        is_premium_active?: boolean
      }
      const response = (await getUserProfile()) as UserProfileResponse

      if (response && response.success) {
        // 更新用户会员状态
        currentUser.value = {
          ...currentUser.value,
          is_premium_active: response.is_premium_active,
        }

        // 更新本地存储
        localStorage.setItem('user', JSON.stringify(currentUser.value))
      }
    } catch (error) {
      console.error('更新用户资料失败:', error)
    }
  }

  return {
    currentUser,
    isAuthenticated,
    initializeAuth,
    loginUser,
    registerUser,
    logout,
    updateUserProfile,
    login: loginUser,
  }
})
