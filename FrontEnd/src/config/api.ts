/**
 * 接口配置文件
 * 集中管理所有需要在不同环境中调整的接口地址和配置
 */

// 环境类型
type EnvType = 'development' | 'production' | 'test' | 'staging'

// 环境变量，可以根据实际部署环境修改
console.log(import.meta.env.MODE)
const ENV = {
  // 当前环境：development, production, test, staging
  NODE_ENV: (import.meta.env.MODE || 'development') as EnvType,

  // 是否是开发环境
  isDev: import.meta.env.MODE === 'development',

  // 是否是生产环境
  isProd: import.meta.env.MODE === 'production',

  // 是否是测试环境
  isTest: import.meta.env.MODE === 'test',

  // 是否是预发布环境
  isStaging: import.meta.env.MODE === 'staging',
}

// 从环境变量中读取配置（如果存在）
const getEnvValue = (key: string, defaultValue: string): string => {
  // 尝试从Vite环境变量中读取
  const viteKey = `VITE_${key}`
  if (import.meta.env[viteKey] !== undefined) {
    return import.meta.env[viteKey] as string
  }
  return defaultValue
}

// 环境配置接口
interface EnvConfig {
  apiBaseUrl: string
  wsBaseUrl: string
  appBaseUrl: string
}

// 基础配置
const BASE_CONFIG: Record<EnvType, EnvConfig> = {
  // 开发环境配置
  development: {
    // 后端API基础URL，支持环境变量覆盖
    apiBaseUrl: `http://${getEnvValue('API_HOST', 'localhost:8000')}`,

    // WebSocket基础URL，支持环境变量覆盖
    wsBaseUrl: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${getEnvValue('API_HOST', 'localhost:8000')}/ws`,

    // 前端应用URL，支持环境变量覆盖
    appBaseUrl: getEnvValue('APP_URL', 'http://localhost:5173'),
  },

  // 生产环境配置
  production: {
    // 部署时修改这些值或通过环境变量覆盖
    apiBaseUrl: `http://${getEnvValue('API_HOST', '47.104.168.42')}`,
    wsBaseUrl: `ws://${getEnvValue('API_HOST', '47.104.168.42:8001')}/ws`,
    appBaseUrl: getEnvValue('APP_URL', 'http://47.104.168.42'),
  },

  // 预发布环境配置
  staging: {
    apiBaseUrl: `https://${getEnvValue('API_HOST', '47.104.168.42')}`,
    wsBaseUrl: `wss://${getEnvValue('API_HOST', '47.104.168.42')}/ws`,
    appBaseUrl: getEnvValue('APP_URL', 'https://47.104.168.42'),
  },

  // 测试环境配置
  test: {
    apiBaseUrl: `https://${getEnvValue('API_HOST', '47.104.168.42')}`,
    wsBaseUrl: `wss://${getEnvValue('API_HOST', '47.104.168.42')}/ws`,
    appBaseUrl: getEnvValue('APP_URL', 'https://47.104.168.42'),
  },
}

// 获取当前环境的配置
const currentEnv = ENV.NODE_ENV
const config = BASE_CONFIG[currentEnv] || BASE_CONFIG.development

// 用于构建API URL的辅助函数
const getApiUrl = (path: string): string => {
  return `${config.apiBaseUrl.replace('/api', '')}${path}`
}

// 导出配置项，使得所有组件可以引用这些配置
export default {
  // 环境信息
  env: ENV,

  // 基础URL配置
  apiBaseUrl: config.apiBaseUrl,
  wsBaseUrl: config.wsBaseUrl,
  appBaseUrl: config.appBaseUrl,

  // WebSocket相关配置
  websocket: {
    // WebSocket连接URL构建函数
    getConnectionUrl: (designId: string): string => {
      return `${config.wsBaseUrl}/collaboration/${designId}/`
    },

    // 重连配置
    reconnectAttempts: parseInt(getEnvValue('WS_MAX_RECONNECT_ATTEMPTS', '5')),
    reconnectInterval: parseInt(getEnvValue('WS_RECONNECT_INTERVAL', '2000')),
    pingInterval: parseInt(getEnvValue('WS_PING_INTERVAL', '30000')),
    connectionTimeout: parseInt(getEnvValue('WS_CONNECT_TIMEOUT', '10000')),
  },

  // API端点配置
  endpoints: {
    // 用户相关
    user: {
      login: getApiUrl('/user/login/'),
      register: getApiUrl('/user/register/'),
      profile: getApiUrl('/user/users/my_profile/'),
      csrf: getApiUrl('/user/csrf/'),
      refreshToken: getApiUrl('/user/token/refresh/'),
      forgotPassword: getApiUrl('/user/forgot-password/'),
      resetPassword: getApiUrl('/user/reset-password/'),
      changePassword: getApiUrl('/user/users/change_password/'),
      changeEmail: getApiUrl('/user/users/change_email/'),
      setPremium: (userId: number) => getApiUrl(`/user/users/${userId}/set_premium/`),
    },

    // 反馈相关
    feedback: {
      submit: getApiUrl('/api/feedback/'),
    },

    // 课程设计相关
    course: {
      list: `${config.apiBaseUrl}/courses/`,
      detail: (id: string) => `${config.apiBaseUrl}/courses/${id}/`,
      create: `${config.apiBaseUrl}/courses/`,
      update: (id: string) => `${config.apiBaseUrl}/courses/${id}/`,
      delete: (id: string) => `${config.apiBaseUrl}/courses/${id}/`,
    },

    // 协作相关
    collaboration: {
      status: (designId: string) => `${config.apiBaseUrl}/collaboration/${designId}/status/`,
      history: (designId: string) => `${config.apiBaseUrl}/collaboration/${designId}/history/`,
    },

    // 自定义障碍物相关
    obstacles: {
      list: getApiUrl('/api/obstacles/custom/'),
      detail: (id: string) => getApiUrl(`/api/obstacles/custom/${id}/`),
      create: getApiUrl('/api/obstacles/custom/'),
      update: (id: string) => getApiUrl(`/api/obstacles/custom/${id}/`),
      delete: (id: string) => getApiUrl(`/api/obstacles/custom/${id}/`),
    },
  },

  // 帮助和文档链接
  docs: {
    userGuide: 'https://docs.example.com/user-guide',
    apiDocs: 'https://docs.example.com/api',
    support: 'https://support.example.com',
  },
}

// 自定义障碍物API
export const CUSTOM_OBSTACLE_API = {
  // 获取用户所有自定义障碍物
  FETCH_USER_OBSTACLES: '/user/obstacles/',
  // 创建新的自定义障碍物
  CREATE_OBSTACLE: '/user/obstacles/',
  // 更新指定ID的自定义障碍物
  UPDATE_OBSTACLE: (id: number | string) => `/user/obstacles/${id}/`,
  // 删除指定ID的自定义障碍物
  DELETE_OBSTACLE: (id: number | string) => `/user/obstacles/${id}/`,
  // 获取用户自定义障碍物数量和限制信息
  GET_OBSTACLE_COUNT: '/user/obstacles/count/',
  // 获取其他用户共享的障碍物
  GET_SHARED_OBSTACLES: '/user/obstacles/shared/',
  // 切换障碍物共享状态
  TOGGLE_SHARE: (id: number | string) => `/user/obstacles/${id}/toggle-share/`,
}
