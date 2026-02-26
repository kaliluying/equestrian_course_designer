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
    // Tokens are now stored in httpOnly cookies by the backend
    // We only check localStorage for user data
    const userData = localStorage.getItem('user')
    if (userData) {
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

      // Tokens are now set as httpOnly cookies by the backend
      // No need to store them in localStorage

      // Save user info to localStorage (for UI display purposes only)
      const userData = {
        id: response.user_id,
        username: response.username,
      }
      localStorage.setItem('user', JSON.stringify(userData))

      // 更新用户状态
      currentUser.value = userData
      isAuthenticated.value = true

      // 注意：不在这里立即调用 updateUserProfile() 和 initObstacles()
      // 避免并发请求导致的 cookie 问题
      // 这些方法会在需要时由各组件自行调用，或通过路由守卫触发

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

      const { user_id, username } = response

      // Tokens are set as httpOnly cookies by the backend
      // No need to store them in localStorage

      // Save user info to localStorage (for UI display purposes only)
      localStorage.setItem(
        'user',
        JSON.stringify({
          id: user_id,
          username: username,
        }),
      )

      currentUser.value = {
        id: user_id,
        username: username,
      }

      isAuthenticated.value = true

      // 注意：不在这里立即调用 initObstacles()
      // 避免并发请求导致的 cookie 问题
      // 这些方法会在需要时由各组件自行调用

      return currentUser.value
    } catch (error) {
      console.error('用户状态管理: 注册失败:', error)
      throw error
    }
  }

  const logout = (router?: Router) => {
    // Tokens are in httpOnly cookies, so we just clear user data from localStorage
    localStorage.removeItem('user')

    // Clear the refresh token cookie (access_token cookie will expire naturally)
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
