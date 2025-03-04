import { createRouter, createWebHistory } from 'vue-router'
import ResetPassword from '../views/ResetPassword.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../App.vue'),
    },
    {
      path: '/reset-password',
      name: 'resetPassword',
      component: ResetPassword,
    },
    {
      path: '/collaborate/:designId',
      name: 'collaborate',
      component: () => import('../App.vue'),
      props: true,
    },
  ],
})

export default router
