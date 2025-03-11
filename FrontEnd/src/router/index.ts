import { createRouter, createWebHistory } from 'vue-router'
import ResetPassword from '../views/ResetPassword.vue'
import SharedDesigns from '../views/SharedDesigns.vue'
import MyDesigns from '../views/MyDesigns.vue'
import UserProfile from '../views/UserProfile.vue'
import Feedback from '../views/Feedback.vue'
import { useUserStore } from '@/stores/user'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/Home.vue'),
    },
    {
      path: '/reset-password',
      name: 'resetPassword',
      component: ResetPassword,
    },
    {
      path: '/collaborate/:designId',
      name: 'collaborate',
      component: () => import('../views/Home.vue'),
      props: true,
    },
    {
      path: '/shared-designs',
      name: 'sharedDesigns',
      component: SharedDesigns,
    },
    {
      path: '/my-designs',
      name: 'myDesigns',
      component: MyDesigns,
    },
    {
      path: '/profile',
      name: 'userProfile',
      component: UserProfile,
    },
    {
      path: '/feedback',
      name: 'feedback',
      component: Feedback,
    },
    {
      path: '/orders',
      name: 'orders',
      component: () => import('@/views/OrderList.vue'),
      meta: {
        requiresAuth: true,
        title: '我的订单',
      },
    },
  ],
})

// 添加全局前置守卫
router.beforeEach((to, from, next) => {
  const userStore = useUserStore()

  // 需要登录才能访问的页面
  const requiresAuth = ['/profile', '/my-designs']

  // 需要会员才能访问的页面
  const requiresPremium = ['/collaborate']

  // 检查是否需要登录
  if (requiresAuth.some((path) => to.path.startsWith(path))) {
    if (!userStore.isAuthenticated) {
      next('/')
      return
    }
  }

  // 检查是否需要会员权限
  if (requiresPremium.some((path) => to.path.startsWith(path))) {
    if (!userStore.isAuthenticated) {
      next('/')
      return
    }

    // 检查用户是否为活跃会员
    if (!userStore.currentUser?.is_premium_active) {
      // 重定向到用户资料页面，提示升级会员
      next('/profile')
      return
    }
  }

  next()
})

export default router
