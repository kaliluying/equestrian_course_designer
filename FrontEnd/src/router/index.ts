import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useCourseStore } from '@/stores/course'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/Home.vue'),
    },
    {
      path: '/my-designs',
      name: 'my-designs',
      component: () => import('../views/MyDesigns.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/shared-designs',
      name: 'shared-designs',
      component: () => import('../views/SharedDesigns.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('../views/UserProfile.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/feedback',
      name: 'feedback',
      component: () => import('../views/Feedback.vue'),
    },
    {
      path: '/reset-password',
      name: 'reset-password',
      component: () => import('../views/ResetPassword.vue'),
    },
  ],
})

// 路由守卫
router.beforeEach(async (to, from, next) => {
  const userStore = useUserStore()
  const courseStore = useCourseStore()

  // 检查是否需要认证
  if (to.meta.requiresAuth) {
    // 双重检查：既检查 store 状态，也检查 localStorage
    const hasToken = !!localStorage.getItem('access_token')
    if (!userStore.isAuthenticated && !hasToken) {
      next('/')
      return
    }
    // 如果 localStorage 有 token 但 store 未初始化，重新初始化
    if (!userStore.isAuthenticated && hasToken) {
      userStore.initializeAuth()
    }
  }

  // 检查是否有待处理的协作邀请
  if (userStore.isAuthenticated) {
    const pendingCollaboration = localStorage.getItem('pendingCollaboration')
    if (pendingCollaboration) {
      try {
        const { designId, timestamp } = JSON.parse(pendingCollaboration)
        const inviteTime = new Date(timestamp)
        const now = new Date()

        // 检查邀请是否在24小时内
        if (now.getTime() - inviteTime.getTime() < 24 * 60 * 60 * 1000) {
          courseStore.setCurrentCourseId(designId)
        }
      } catch (error) {
        console.error('处理待处理协作邀请时出错:', error)
        localStorage.removeItem('pendingCollaboration')
      }
    }
  }

  next()
})

export default router
