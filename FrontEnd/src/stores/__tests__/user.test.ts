import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUserStore } from '@/stores/user'

vi.mock('@/api/user', () => ({
  getUserProfile: vi.fn(async () => ({
    success: true,
    is_premium_active: true,
    entitlements: {
      user_id: 1,
      plan_code: 'premium',
      plan_name: '高级会员',
      is_premium_active: true,
      design_count: 3,
      design_limit: 500,
      custom_obstacle_count: 4,
      custom_obstacle_limit: null,
      custom_obstacle_unlimited: true,
      ai_remaining_quota: 2,
      can_collaborate: true,
      pending_plan: null,
    },
  })),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}))

describe('user store entitlements', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('刷新用户资料时同步权益快照', async () => {
    const store = useUserStore()
    store.currentUser = { id: 1, username: 'demo' }
    store.isAuthenticated = true

    const success = await store.updateUserProfile()

    expect(success).toBe(true)
    expect(store.currentUser?.entitlements?.plan_code).toBe('premium')
    expect(store.currentUser?.entitlements?.can_collaborate).toBe(true)
    expect(store.currentUser?.is_premium_active).toBe(true)
  })
})
