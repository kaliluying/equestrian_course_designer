<!-- 用户订单列表页面 -->
<template>
  <div class="order-list">
    <!-- 当作为独立页面时显示标题，作为嵌入组件时隐藏 -->
    <div v-if="!props.embedded" class="page-header">
      <h2>我的订单</h2>
      <el-button type="primary" @click="refreshOrders">刷新</el-button>
    </div>

    <!-- 订单筛选 -->
    <div class="filter-section">
      <div class="filter-header">
        <h3 v-if="props.embedded">订单查询</h3>
        <el-button type="primary" size="small" @click="refreshOrders">刷新</el-button>
      </div>
      <el-form :inline="true" :model="filterForm" class="filter-form">
        <el-form-item label="订单状态">
          <el-select v-model="filterForm.status" placeholder="全部状态" clearable style="width: 120px">
            <el-option label="待支付" value="pending" />
            <el-option label="已支付" value="paid" />
            <el-option label="已取消" value="cancelled" />
            <el-option label="已退款" value="refunded" />
            <el-option label="支付失败" value="failed" />
          </el-select>
        </el-form-item>
        <el-form-item label="时间范围">
          <el-date-picker v-model="filterForm.dateRange" type="daterange" range-separator="至" start-placeholder="开始日期"
            end-placeholder="结束日期" format="YYYY-MM-DD" value-format="YYYY-MM-DD" :shortcuts="dateShortcuts"
            :locale="zhCn" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleFilter">查询</el-button>
          <el-button @click="resetFilter">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 订单列表 -->
    <div class="order-table">
      <el-table v-loading="loading" :data="orders" style="width: 100%" border stripe>
        <el-table-column prop="order_id" label="订单编号" min-width="180" show-overflow-tooltip />
        <el-table-column prop="plan_name" label="会员计划" min-width="120" show-overflow-tooltip />
        <el-table-column prop="amount" label="金额" min-width="100" align="right">
          <template #default="scope">
            <span class="amount">¥{{ Number(scope.row.amount).toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" min-width="100" align="center">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)" size="small">
              {{ scope.row.status_display }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" min-width="180" show-overflow-tooltip>
          <template #default="scope">
            {{ formatDate(scope.row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="180" fixed="right" align="center">
          <template #default="scope">
            <el-button v-if="scope.row.status === 'pending'" type="primary" size="small" @click="handlePay(scope.row)">
              支付
            </el-button>
            <el-button v-if="scope.row.status === 'pending'" type="danger" size="small"
              @click="handleCancel(scope.row)">
              取消
            </el-button>
            <el-button type="info" size="small" @click="handleDetail(scope.row)">
              详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination">
        <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize" :page-sizes="[10, 20, 50, 100]"
          :total="total" layout="total, sizes, prev, pager, next, jumper" :pager-count="7" background
          @size-change="handleSizeChange" @current-change="handleCurrentChange" />
      </div>
    </div>

    <!-- 订单详情对话框 -->
    <el-dialog v-model="detailDialogVisible" title="订单详情" width="600px" destroy-on-close :modal="true"
      :append-to-body="true" :lock-scroll="true" :show-close="true" :close-on-click-modal="false"
      :close-on-press-escape="true" class="order-detail-dialog">
      <div v-if="currentOrder" class="order-detail">
        <div class="detail-item">
          <span class="label">订单编号：</span>
          <span class="value">{{ currentOrder.order_id }}</span>
        </div>
        <div class="detail-item">
          <span class="label">会员计划：</span>
          <span class="value">{{ currentOrder.plan_name }}</span>
        </div>
        <div class="detail-item">
          <span class="label">订单金额：</span>
          <span class="value amount">¥{{ Number(currentOrder.amount).toFixed(2) }}</span>
        </div>
        <div class="detail-item">
          <span class="label">支付方式：</span>
          <span class="value">{{ currentOrder.payment_channel_display }}</span>
        </div>
        <div class="detail-item">
          <span class="label">订单状态：</span>
          <el-tag :type="getStatusType(currentOrder.status)" size="small">
            {{ currentOrder.status_display }}
          </el-tag>
        </div>
        <div class="detail-item">
          <span class="label">计费周期：</span>
          <span class="value">{{ currentOrder.billing_cycle_display }}</span>
        </div>
        <div class="detail-item">
          <span class="label">创建时间：</span>
          <span class="value">{{ formatDate(currentOrder.created_at) }}</span>
        </div>
        <div class="detail-item">
          <span class="label">支付时间：</span>
          <span class="value">{{ currentOrder.payment_time ? formatDate(currentOrder.payment_time) : '未支付' }}</span>
        </div>
        <div class="detail-item">
          <span class="label">交易号：</span>
          <span class="value">{{ currentOrder.trade_no || '无' }}</span>
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="detailDialogVisible = false">关闭</el-button>
          <el-button v-if="currentOrder?.status === 'pending'" type="primary" @click="handlePay(currentOrder)">
            去支付
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, defineProps, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { orderApi } from '@/api/order'
import type { Order } from '@/types/order'
import type { GetOrdersParams } from '@/api/order'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

const props = defineProps({
  // 是否为嵌入模式，用于在个人中心中显示
  embedded: {
    type: Boolean,
    default: false
  }
})

// 状态和加载
const loading = ref(false)
const orders = ref<Order[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(10)
const detailDialogVisible = ref(false)
const currentOrder = ref<Order | null>(null)

// 日期快捷选项
const dateShortcuts = [
  {
    text: '最近一周',
    value: () => {
      const end = new Date()
      const start = new Date()
      start.setTime(start.getTime() - 3600 * 1000 * 24 * 7)
      return [start, end]
    },
  },
  {
    text: '最近一个月',
    value: () => {
      const end = new Date()
      const start = new Date()
      start.setTime(start.getTime() - 3600 * 1000 * 24 * 30)
      return [start, end]
    },
  },
  {
    text: '最近三个月',
    value: () => {
      const end = new Date()
      const start = new Date()
      start.setTime(start.getTime() - 3600 * 1000 * 24 * 90)
      return [start, end]
    },
  },
]

// 筛选表单
const filterForm = reactive({
  status: '',
  dateRange: [] as string[],
})

// 获取订单列表
const fetchOrders = async () => {
  loading.value = true
  try {
    // 构建查询参数
    const params: GetOrdersParams = {
      page: currentPage.value,
      page_size: pageSize.value
    }

    // 添加状态过滤
    if (filterForm.status) {
      params.status = filterForm.status
    }

    // 添加日期范围过滤
    if (filterForm.dateRange && filterForm.dateRange.length === 2) {
      params.start_date = filterForm.dateRange[0]
      params.end_date = filterForm.dateRange[1]
    }

    const response = await orderApi.getOrders(params)
    orders.value = response.results
    total.value = response.count
  } catch (error) {
    console.error('获取订单列表失败:', error)
    ElMessage.error('获取订单列表失败')
  } finally {
    loading.value = false
  }
}

// 刷新订单列表
const refreshOrders = () => {
  currentPage.value = 1
  fetchOrders()
}

// 处理筛选
const handleFilter = () => {
  currentPage.value = 1
  fetchOrders()
}

// 重置筛选
const resetFilter = () => {
  filterForm.status = ''
  filterForm.dateRange = []
  handleFilter()
}

// 处理支付
const handlePay = async (order: Order) => {
  try {
    window.open(order.payment_url, '_blank')
    // 开始轮询订单状态
    await pollOrderStatus(order.order_id)
  } catch (error) {
    console.error('支付失败:', error)
    ElMessage.error('支付失败')
  }
}

// 轮询订单状态
const pollOrderStatus = async (orderId: string) => {
  const maxAttempts = 30 // 最多轮询30次
  const interval = 3000 // 每3秒轮询一次
  let attempts = 0

  const poll = async () => {
    try {
      const response = await orderApi.queryOrderStatus(orderId)
      if (response.order.status === 'paid') {
        ElMessage.success('支付成功')
        refreshOrders()
        return true
      }
      if (response.order.status === 'failed') {
        ElMessage.error('支付失败')
        return true
      }
      return false
    } catch (error) {
      console.error('查询订单状态失败:', error)
      return true // 出错时停止轮询
    }
  }

  const polling = async () => {
    if (attempts >= maxAttempts) {
      ElMessage.warning('支付结果查询超时，请刷新页面查看最新状态')
      return
    }

    attempts++
    const shouldStop = await poll()
    if (!shouldStop) {
      setTimeout(polling, interval)
    }
  }

  await polling()
}

// 处理取消
const handleCancel = async (order: Order) => {
  try {
    await ElMessageBox.confirm('确定要取消该订单吗？', '提示', {
      type: 'warning',
    })
    await orderApi.cancelOrder(order.order_id)
    ElMessage.success('订单已取消')
    refreshOrders()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('取消订单失败:', error)
      ElMessage.error('取消订单失败')
    }
  }
}

// 查看详情
const handleDetail = (order: Order) => {
  currentOrder.value = order
  detailDialogVisible.value = true
}

// 处理分页
const handleSizeChange = (val: number) => {
  pageSize.value = val
  fetchOrders()
}

const handleCurrentChange = (val: number) => {
  currentPage.value = val
  fetchOrders()
}

// 格式化日期
const formatDate = (date: string) => {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}

// 获取状态类型
const getStatusType = (status: string) => {
  const statusMap: Record<string, string> = {
    pending: 'warning',
    paid: 'success',
    failed: 'danger',
    cancelled: 'info',
    refunded: 'info'
  }
  return statusMap[status] || 'info'
}

// 在组件挂载时获取订单数据
onMounted(() => {
  fetchOrders()
})
</script>

<style scoped lang="scss">
.order-list {
  // 减少内边距，适应嵌入模式
  padding: v-bind('props.embedded ? "0" : "20px"');

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;

    h2 {
      margin: 0;
      font-size: 24px;
      color: var(--el-text-color-primary);
    }
  }

  .filter-section {
    margin-bottom: 20px;
    padding: 20px;
    background-color: var(--el-bg-color);
    border-radius: 8px;
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);

    .filter-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;

      h3 {
        margin: 0;
        font-size: 16px;
        color: var(--el-text-color-primary);
      }
    }

    .filter-form {
      :deep(.el-select) {
        width: 120px !important;
      }

      :deep(.el-form-item) {
        margin-right: 20px;
        margin-bottom: 0;
      }

      :deep(.el-form-item__label) {
        font-size: 14px;
        color: var(--el-text-color-regular);
      }
    }
  }

  .order-table {
    background-color: var(--el-bg-color);
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);

    .amount {
      font-family: Monaco, Menlo, Consolas, "Courier New", monospace;
      color: #f56c6c;
      font-weight: bold;
    }

    .pagination {
      margin-top: 20px;
      display: flex;
      justify-content: flex-end;
    }
  }
}

.order-detail {
  padding: 0 20px;

  .detail-item {
    margin-bottom: 20px;
    display: flex;
    align-items: center;

    .label {
      width: 100px;
      color: var(--el-text-color-secondary);
      font-size: 14px;
    }

    .value {
      flex: 1;
      color: var(--el-text-color-primary);
      font-size: 14px;
      word-break: break-all;

      &.amount {
        font-family: Monaco, Menlo, Consolas, "Courier New", monospace;
        color: #f56c6c;
        font-weight: bold;
      }
    }
  }
}

.dialog-footer {
  padding: 20px 0 0;
  text-align: right;
}

:deep(.el-table) {
  border-radius: 4px;
  overflow: hidden;
}

:deep(.el-table__header) {
  background-color: var(--el-fill-color-light);
}

:deep(.el-button--small) {
  padding: 6px 12px;
  font-size: 12px;
}
</style>
