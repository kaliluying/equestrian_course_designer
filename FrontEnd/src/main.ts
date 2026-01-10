import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import router from './router'
import { useUserStore } from '@/stores/user'

import App from './App.vue'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)

// 在使用路由器之前初始化用户认证状态
const userStore = useUserStore()
userStore.initializeAuth()

app.use(ElementPlus)
app.use(router)

app.mount('#app')
