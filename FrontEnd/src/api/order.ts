import { request } from '@/utils/request'
import type { Order, CreateOrderParams } from '@/types/order'

// 定义获取订单列表的参数类型
export interface GetOrdersParams {
  page: number
  page_size: number
  status?: string
  start_date?: string
  end_date?: string
}

// 订单相关API
export const orderApi = {
  // 获取订单列表
  getOrders: (params: GetOrdersParams) => {
    return request.get<{
      count: number
      next: string | null
      previous: string | null
      results: Order[]
    }>('/user/api/payment/orders/', { params })
  },

  // 获取订单详情
  getOrderDetail: (orderId: string) => {
    return request.get<{ success: boolean; order: Order }>(
      `/user/api/payment/order-status/${orderId}/`,
    )
  },

  // 创建会员订单
  createOrder: (params: CreateOrderParams) => {
    return request.post<{
      success: boolean
      message: string
      order: Order
      payment_url: string
    }>('/user/api/payment/create-order/', params)
  },

  // 查询订单状态
  queryOrderStatus: (orderId: string) => {
    return request.get<{
      success: boolean
      message?: string
      order: Order
      alipay_status?: string
    }>(`/user/api/payment/order-status/${orderId}/`)
  },

  // 支付订单
  payOrder: (params: PayOrderParams) => {
    return request.post<Order>(`/user/api/orders/${params.orderId}/pay`, params)
  },

  // 取消订单
  cancelOrder: (orderId: string) => {
    return request.post<Order>(`/user/api/orders/${orderId}/cancel`)
  },

  // 删除订单
  deleteOrder: (orderId: string) => {
    return request.delete(`/user/api/orders/${orderId}`)
  },
}
