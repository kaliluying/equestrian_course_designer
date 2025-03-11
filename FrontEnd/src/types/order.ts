// 订单状态枚举
export enum OrderStatus {
  PENDING = 'pending', // 待支付
  PAID = 'paid', // 已支付
  FAILED = 'failed', // 支付失败
  CANCELLED = 'cancelled', // 已取消
}

// 订单类型接口
export interface Order {
  id: number
  order_id: string // 订单编号
  user: number // 用户ID
  user_username: string // 用户名
  membership_plan: number // 会员计划ID
  plan_name: string // 会员计划名称
  amount: string // 订单金额
  payment_channel: string // 支付渠道
  payment_channel_display: string // 支付渠道显示名称
  status: OrderStatus // 订单状态
  status_display: string // 订单状态显示名称
  trade_no?: string // 支付平台交易号
  billing_cycle: 'month' | 'year' // 计费周期
  billing_cycle_display: string // 计费周期显示名称
  payment_url?: string // 支付链接
  payment_time?: string // 支付时间
  created_at: string // 创建时间
  updated_at: string // 更新时间
}

// 订单查询参数接口
export interface OrderQueryParams {
  page: number // 当前页码
  pageSize: number // 每页数量
  status?: OrderStatus // 订单状态
  startDate?: string // 开始日期
  endDate?: string // 结束日期
}

// 订单列表响应接口
export interface OrderListResponse {
  items: Order[] // 订单列表
  total: number // 总数量
  page: number // 当前页码
  pageSize: number // 每页数量
}

// 创建订单参数接口
export interface CreateOrderParams {
  plan_id: number // 会员计划ID
  billing_cycle: 'month' | 'year' // 计费周期
  amount: number // 订单金额
  remark?: string // 备注
}

// 支付订单参数接口
export interface PayOrderParams {
  orderId: string // 订单ID
  paymentMethod: string // 支付方式
}
