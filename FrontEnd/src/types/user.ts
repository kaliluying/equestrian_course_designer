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


// 会员计划摘要
export interface MembershipPlanSummary {
  id: number
  name: string
  code: string
  storage_limit: number
  custom_obstacle_limit: number | null
}

// 用户权益快照
export interface EntitlementSnapshot {
  user_id: number
  plan_code: string
  plan_name: string
  is_premium_active: boolean
  design_count: number
  design_limit: number
  custom_obstacle_count: number
  custom_obstacle_limit: number | null
  custom_obstacle_unlimited: boolean
  ai_remaining_quota: number
  can_collaborate: boolean
  pending_plan: MembershipPlanSummary | null
}
