import { defineStore } from 'pinia'
import axios from 'axios'
import { ref } from 'vue'
import type { EntitlementSnapshot, LoginForm, RegisterForm } from '@/types/user'
import { login, logout as logoutApi, register } from '@/api/user'
import type { Router } from 'vue-router'

// 定义用户类型
interface MembershipPlan {
  id: number
  name: string
  code: string
}

interface User {
  id: number
  username: string
  is_premium_active?: boolean
  membership_plan?: MembershipPlan | null
  design_storage_limit?: number
  entitlements?: EntitlementSnapshot | null
}

export const useUserStore = defineStore('user', () => {
  const currentUser = ref<User | null>(null)
  const isAuthenticated = ref(false)

  const clearAuthState = () => {
    localStorage.removeItem('user')
    currentUser.value = null
    isAuthenticated.value = false
  }

  const initializeAuth = async (): Promise<boolean> => {
    // 鉴权最终以服务端 cookie 为准，localStorage 只用于恢复界面展示
    const userData = localStorage.getItem('user')
    if (!userData) {
      clearAuthState()
      return false
    }

    try {
      currentUser.value = JSON.parse(userData)
      isAuthenticated.value = true

      // 刷新页面后立即向服务端确认 cookie 是否仍然有效
      return await updateUserProfile(true)
    } catch (error) {
      console.error('用户状态管理: 恢复本地登录态失败:', error)
      clearAuthState()
      return false
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

  const logout = async (router?: Router, callApi = true) => {
    if (callApi) {
      try {
        await logoutApi()
      } catch (error) {
        console.error('用户状态管理: 登出接口调用失败:', error)
      }
    }

    clearAuthState()

    const { useObstacleStore } = await import('@/stores/obstacle')
    const obstacleStore = useObstacleStore()
    obstacleStore.initObstacles()

    if (router) {
      await router.push('/')
    }
  }

  // 更新用户资料，包括会员状态
  const updateUserProfile = async (clearOnAuthFailure = false): Promise<boolean> => {
    if (!isAuthenticated.value || !currentUser.value) return false

    try {
      const { getUserProfile } = await import('@/api/user')
      interface UserProfileResponse {
        success: boolean
        is_premium_active?: boolean
        membership_plan?: MembershipPlan | null
        design_storage_limit?: number
        entitlements?: EntitlementSnapshot | null
      }
      const response = (await getUserProfile()) as UserProfileResponse

      if (response && response.success) {
        // 更新用户会员状态
        currentUser.value = {
          ...currentUser.value,
          is_premium_active: response.is_premium_active,
          membership_plan: response.membership_plan || null,
          design_storage_limit: response.design_storage_limit || response.entitlements?.design_limit || 5,
          entitlements: response.entitlements || null,
        }

        // 更新本地存储
        localStorage.setItem('user', JSON.stringify(currentUser.value))
      }

      return true
    } catch (error) {
      console.error('更新用户资料失败:', error)

      const statusCode = axios.isAxiosError(error) ? error.response?.status : undefined
      if (clearOnAuthFailure && (statusCode === 401 || statusCode === 403)) {
        clearAuthState()
      }

      return false
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
