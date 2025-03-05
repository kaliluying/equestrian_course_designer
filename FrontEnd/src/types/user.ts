// 用户类型
export interface User {
  id: number
  username: string
}

// 登录表单类型
export interface LoginForm {
  username: string
  password: string
}

// 注册表单类型
export interface RegisterForm {
  username: string
  email: string
  password: string
  confirmPassword: string
}

// 错误响应类型
export interface ErrorResponse {
  code: number
  message: {
    [key: string]: string[]
  }
}

// 认证响应类型
export interface AuthResponse {
  message: string
  user_id: number
  username: string
  access_token: string
  refresh_token: string
}
