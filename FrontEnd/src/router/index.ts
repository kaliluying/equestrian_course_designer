import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useCourseStore } from '@/stores/course'
import ResetPassword from '../views/ResetPassword.vue'
import SharedDesigns from '../views/SharedDesigns.vue'
import MyDesigns from '../views/MyDesigns.vue'
import UserProfile from '../views/UserProfile.vue'
import Feedback from '../views/Feedback.vue'
import Home from '../views/Home.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home,
    },
    {
      path: '/my-designs',
      name: 'my-designs',
      component: MyDesigns,
      meta: { requiresAuth: true },
    },
    {
      path: '/shared-designs',
      name: 'shared-designs',
      component: SharedDesigns,
      meta: { requiresAuth: true },
    },
    {
      path: '/profile',
      name: 'profile',
      component: UserProfile,
      meta: { requiresAuth: true },
    },
    {
      path: '/feedback',
      name: 'feedback',
      component: Feedback,
    },
    {
      path: '/reset-password',
      name: 'reset-password',
      component: ResetPassword,
    },
  ],
})

// 路由守卫
router.beforeEach(async (to, from, next) => {
  const userStore = useUserStore()
  const courseStore = useCourseStore()

  // 检查是否需要认证
  if (to.meta.requiresAuth && !userStore.isAuthenticated) {
    next('/')
    return
  }

  // 如果用户已登录，尝试恢复用户会话
  if (userStore.isAuthenticated) {
    try {
      await userStore.updateUserProfile()
    } catch (error) {
      console.error('更新用户资料失败:', error)
      userStore.logout()
      next('/')
      return
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
