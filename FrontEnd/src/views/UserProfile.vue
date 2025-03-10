<template>
  <div class="user-profile-container" style="padding-bottom: 100px;">
    <el-card class="profile-card">
      <template #header>
        <div class="card-header">
          <h2>用户资料</h2>
        </div>
      </template>

      <div v-if="loading" class="loading-container">
        <el-skeleton :rows="5" animated />
      </div>

      <div v-else class="profile-content">
        <div class="info-item">
          <span class="label">用户名：</span>
          <span class="value">{{ userProfile.username }}</span>
        </div>

        <div class="info-item">
          <span class="label">邮箱：</span>
          <span class="value">{{ userProfile.email }}</span>
          <el-button type="primary" link @click="showChangeEmailDialog">修改</el-button>
        </div>

        <div class="info-item">
          <span class="label">密码：</span>
          <span class="value">********</span>
          <el-button type="primary" link @click="showChangePasswordDialog">修改</el-button>
        </div>

        <div class="info-item">
          <span class="label">会员状态：</span>
          <span class="value">
            <el-tag v-if="userProfile.is_premium_active" type="success">有效</el-tag>
            <el-tag v-else-if="userProfile.is_premium && !userProfile.is_premium_active" type="warning">已过期</el-tag>
            <el-tag v-else type="info">未开通</el-tag>
          </span>
        </div>

        <div v-if="userProfile.membership_plan" class="info-item">
          <span class="label">当前会员计划：</span>
          <span class="value">{{ userProfile.membership_plan.name }}</span>
        </div>

        <div v-if="userProfile.is_premium" class="info-item">
          <span class="label">会员到期时间：</span>
          <span class="value">{{ formatDate(userProfile.premium_expire_date) }}</span>
        </div>

        <!-- 待生效会员计划信息 -->
        <div v-if="userProfile.pending_membership_plan" class="info-item pending-plan">
          <span class="label">待生效会员：</span>
          <span class="value">
            <el-tag type="warning">{{ userProfile.pending_membership_plan.name }}</el-tag>
            <div class="pending-plan-details">
              将在当前会员到期后自动生效
              <div class="pending-dates">
                <span>生效时间：{{ formatDate(userProfile.pending_membership_plan.start_date) }}</span>
                <span>到期时间：{{ formatDate(userProfile.pending_membership_plan.expire_date) }}</span>
              </div>
            </div>
          </span>
        </div>

        <div class="info-item">
          <span class="label">设计存储限制：</span>
          <span class="value">{{ userProfile.design_storage_limit }} 个</span>
        </div>

        <div class="info-item">
          <span class="label">当前设计数量：</span>
          <span class="value">
            {{ userProfile.design_count }} / {{ userProfile.design_storage_limit }}
            <el-progress :percentage="(userProfile.design_count / userProfile.design_storage_limit) * 100"
              :status="storageStatus" :stroke-width="10" class="storage-progress" />
          </span>
        </div>
      </div>

      <div v-if="!userProfile.is_premium_active" class="upgrade-section">
        <h3>升级到会员</h3>
        <p>成为会员，享受更多存储空间和高级功能！</p>
        <el-button type="primary" @click="showUpgradeDialog">立即升级</el-button>
      </div>

      <div v-else class="upgrade-section">
        <h3>会员管理</h3>
        <p>您当前的会员计划: {{ userProfile.membership_plan?.name }} (到期时间: {{ formatDate(userProfile.premium_expire_date) }})
        </p>
        <el-button type="primary" @click="showUpgradeDialog">续费/升级</el-button>
      </div>
    </el-card>

    <!-- 升级对话框 -->
    <el-dialog v-model="upgradeDialogVisible" :title="userProfile.is_premium_active ? '续费/升级会员' : '升级到会员'"
      class="membership-dialog" destroy-on-close width="850px">
      <div class="membership-dialog-content">
        <div class="membership-benefits">
          <h3 class="section-title">会员特权</h3>
          <div class="benefits-list">
            <div class="benefit-item">
              <el-icon>
                <Document />
              </el-icon>
              <div class="benefit-content">
                <div class="benefit-title">更大的设计存储空间</div>
                <div class="benefit-desc">存储更多的设计作品，不必担心空间限制</div>
              </div>
            </div>
            <div class="benefit-item">
              <el-icon>
                <SetUp />
              </el-icon>
              <div class="benefit-content">
                <div class="benefit-title">支持更多高级功能</div>
                <div class="benefit-desc">获得更多高级设计工具和编辑选项</div>
              </div>
            </div>
            <div class="benefit-item">
              <el-icon>
                <Connection />
              </el-icon>
              <div class="benefit-content">
                <div class="benefit-title">独家协作功能</div>
                <div class="benefit-desc">与团队成员实时协作设计，提高工作效率</div>
              </div>
            </div>
            <div class="benefit-item">
              <el-icon>
                <Star />
              </el-icon>
              <div class="benefit-content">
                <div class="benefit-title">优先获取新功能</div>
                <div class="benefit-desc">抢先体验平台新推出的功能和工具</div>
              </div>
            </div>
          </div>
        </div>

        <h3 class="section-title plans-title">选择会员计划</h3>

        <!-- 加载中提示 -->
        <div v-if="loading" class="loading-placeholder">
          <el-skeleton :rows="3" animated style="width: 100%" />
        </div>

        <!-- 会员计划加载失败提示 -->
        <div v-else-if="!loading && availablePlans.length === 0" class="empty-plans">
          <el-empty description="未能获取会员计划信息">
            <el-button type="primary" @click="fetchUserProfile">重新加载</el-button>
          </el-empty>
        </div>

        <div class="pricing-grid" v-else>
          <!-- 免费用户卡片 -->
          <div class="pricing-card" :class="{ 'is-active': !userProfile.is_premium }">
            <div class="pricing-header">
              <h4>免费用户</h4>
              <div v-if="!userProfile.is_premium" class="active-badge">当前方案</div>
            </div>
            <div class="pricing-price">
              <div class="price-value">¥0/月</div>
              <div class="price-period">¥0/年</div>
            </div>
            <div class="pricing-features">
              <div class="feature-item">
                <el-icon>
                  <Check />
                </el-icon>
                <span>基础设计功能</span>
              </div>
              <div class="feature-item muted">
                <el-icon>
                  <Close />
                </el-icon>
                <span>协作功能</span>
              </div>
              <div class="feature-item muted">
                <el-icon>
                  <Close />
                </el-icon>
                <span>5个存储空间</span>
              </div>
              <div class="feature-item muted">
                <el-icon>
                  <Close />
                </el-icon>
                <span>10个自定义障碍</span>
              </div>
            </div>
            <div class="pricing-cta">
              <span class="current-plan-label" v-if="!userProfile.is_premium">当前方案</span>
            </div>
          </div>

          <!-- 标准会员卡片 -->
          <div class="pricing-card"
            :class="{ 'is-selected': selectedPlan && selectedPlan.code === 'standard', 'is-active': userProfile.membership_plan && userProfile.membership_plan.code === 'standard' }"
            @click="selectStandardPlan()">
            <div class="pricing-header">
              <h4>标准会员</h4>
              <div v-if="userProfile.membership_plan && userProfile.membership_plan.code === 'standard'"
                class="active-badge">当前方案</div>
            </div>
            <div class="pricing-price">
              <div class="price-value"
                :class="{ 'selected': selectedPlan?.code === 'standard' && billingCycle === 'month' }"
                @click.stop="() => selectStandardPlan('month')">
                ¥{{ getStandardPlan()?.monthly_price || 39 }}/月
              </div>
              <div class="price-period"
                :class="{ 'selected': selectedPlan?.code === 'standard' && billingCycle === 'year' }"
                @click.stop="() => selectStandardPlan('year')">
                ¥{{ getStandardPlan()?.yearly_price || 399 }}/年
                <div class="price-savings">
                  相当于¥{{ getStandardPlan() ? (getStandardPlan()!.yearly_price / 12).toFixed(2) : '33.25' }}/月
                </div>
              </div>
            </div>
            <div class="pricing-features">
              <div class="feature-item">
                <el-icon>
                  <Check />
                </el-icon>
                <span>全部设计功能</span>
              </div>
              <div class="feature-item">
                <el-icon>
                  <Check />
                </el-icon>
                <span>100个设计存储空间</span>
              </div>
              <div class="feature-item">
                <el-icon>
                  <Check />
                </el-icon>
                <span>不限量个自定义障碍</span>
              </div>
              <div class="feature-item">
                <el-icon>
                  <Check />
                </el-icon>
                <span>优先支持</span>
              </div>
            </div>
            <div class="pricing-cta">
              <button class="select-plan-btn" :class="{ 'selected': selectedPlan && selectedPlan.code === 'standard' }">
                {{ userProfile.membership_plan && userProfile.membership_plan.code === 'standard' ? '续费' : '选择' }}
              </button>
            </div>
          </div>

          <!-- 高级会员卡片 -->
          <div class="pricing-card premium"
            :class="{ 'is-selected': selectedPlan && selectedPlan.code === 'premium', 'is-active': userProfile.membership_plan && userProfile.membership_plan.code === 'premium' }"
            @click="selectPremiumPlan()">
            <div class="pricing-badge">推荐</div>
            <div class="pricing-header">
              <h4>高级会员</h4>
              <div v-if="userProfile.membership_plan && userProfile.membership_plan.code === 'premium'"
                class="active-badge">当前方案</div>
            </div>
            <div class="pricing-price">
              <div class="price-value"
                :class="{ 'selected': selectedPlan?.code === 'premium' && billingCycle === 'month' }"
                @click.stop="() => selectPremiumPlan('month')">
                ¥{{ getPremiumPlan()?.monthly_price || 69 }}/月
              </div>
              <div class="price-period"
                :class="{ 'selected': selectedPlan?.code === 'premium' && billingCycle === 'year' }"
                @click.stop="() => selectPremiumPlan('year')">
                ¥{{ getPremiumPlan()?.yearly_price || 699 }}/年
                <div class="price-savings">
                  相当于¥{{ getPremiumPlan() ? (getPremiumPlan()!.yearly_price / 12).toFixed(2) : '58.25' }}/月
                </div>
              </div>
            </div>
            <div class="pricing-features">
              <div class="feature-item">
                <el-icon>
                  <Check />
                </el-icon>
                <span>全部设计功能</span>
              </div>
              <div class="feature-item">
                <el-icon>
                  <Check />
                </el-icon>
                <span>协作功能（无限人数）</span>
              </div>
              <div class="feature-item">
                <el-icon>
                  <Check />
                </el-icon>
                <span>500个设计存储空间</span>
              </div>
              <div class="feature-item">
                <el-icon>
                  <Check />
                </el-icon>
                <span>不限量个自定义障碍</span>
              </div>
              <div class="feature-item">
                <el-icon>
                  <Check />
                </el-icon>
                <span>优先支持</span>
              </div>
            </div>
            <div class="pricing-cta">
              <button class="select-plan-btn premium"
                :class="{ 'selected': selectedPlan && selectedPlan.code === 'premium' }">
                {{ userProfile.membership_plan && userProfile.membership_plan.code === 'premium' ? '续费' : '选择' }}
              </button>
            </div>
          </div>
        </div>

        <div class="dialog-footer">
          <el-button @click="upgradeDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="upgradeMembership" :disabled="!selectedPlan" :loading="upgradeLoading">
            {{ getActionButtonText() }}
          </el-button>
        </div>
      </div>
    </el-dialog>

    <!-- 修改密码对话框 -->
    <el-dialog v-model="changePasswordDialogVisible" title="修改密码" width="400px">
      <el-form :model="passwordForm" :rules="passwordRules" ref="passwordFormRef" label-width="100px">
        <el-form-item label="当前密码" prop="old_password">
          <el-input v-model="passwordForm.old_password" type="password" show-password placeholder="请输入当前密码"></el-input>
        </el-form-item>
        <el-form-item label="新密码" prop="new_password">
          <el-input v-model="passwordForm.new_password" type="password" show-password placeholder="请输入新密码"></el-input>
        </el-form-item>
        <el-form-item label="确认新密码" prop="confirm_password">
          <el-input v-model="passwordForm.confirm_password" type="password" show-password
            placeholder="请再次输入新密码"></el-input>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="submitChangePassword" :loading="passwordSubmitting">确认修改</el-button>
          <el-button @click="changePasswordDialogVisible = false">取消</el-button>
        </el-form-item>
      </el-form>
    </el-dialog>

    <!-- 修改邮箱对话框 -->
    <el-dialog v-model="changeEmailDialogVisible" title="修改邮箱" width="400px">
      <el-form :model="emailForm" :rules="emailRules" ref="emailFormRef" label-width="100px">
        <el-form-item label="当前邮箱">
          <span>{{ userProfile.email }}</span>
        </el-form-item>
        <el-form-item label="新邮箱" prop="new_email">
          <el-input v-model="emailForm.new_email" placeholder="请输入新邮箱"></el-input>
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="emailForm.password" type="password" show-password placeholder="请输入密码验证身份"></el-input>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="submitChangeEmail" :loading="emailSubmitting">确认修改</el-button>
          <el-button @click="changeEmailDialogVisible = false">取消</el-button>
        </el-form-item>
      </el-form>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getUserProfile, changePassword, changeEmail, createMembershipOrder, getOrderStatus } from '@/api/user'
import { useUserStore } from '@/stores/user'
import type { FormInstance } from 'element-plus'
import { Document, SetUp, Connection, Star, Check, Close } from '@element-plus/icons-vue'

// 定义会员计划类型
interface MembershipPlan {
  id: number;
  name: string;
  code: string;
  monthly_price: number;
  yearly_price: number;
  storage_limit: number;
  description: string;
}

// 定义用户资料类型
interface UserProfile {
  username: string;
  email: string;
  is_premium: boolean;
  is_premium_active: boolean;
  premium_expire_date: string | null;
  design_storage_limit: number;
  design_count: number;
  membership_plan: MembershipPlan | null;
  available_plans: MembershipPlan[];
  pending_membership_plan?: MembershipPlan;
}

// 定义API响应类型
interface ApiResponse {
  success: boolean;
  message?: string;
  username?: string;
  email?: string;
  is_premium?: boolean;
  is_premium_active?: boolean;
  premium_expire_date?: string | null;
  design_storage_limit?: number;
  design_count?: number;
  membership_plan?: MembershipPlan | null;
  available_plans?: MembershipPlan[];
  pending_membership_plan?: MembershipPlan;
}

// 定义密码修改响应类型
interface PasswordResponse {
  success: boolean;
  message?: string;
  refresh?: string;
  access?: string;
}

// 定义邮箱修改响应类型
interface EmailResponse {
  success: boolean;
  message?: string;
  email?: string;
}

// 用户资料数据
const userProfile = ref<UserProfile>({
  username: '',
  email: '',
  is_premium: false,
  is_premium_active: false,
  premium_expire_date: null,
  design_storage_limit: 5,
  design_count: 0,
  membership_plan: null,
  available_plans: []
})

const loading = ref(true)
const upgradeDialogVisible = ref(false)
const selectedPlan = ref<MembershipPlan | null>(null)
const billingCycle = ref<'month' | 'year'>('month')
const availablePlans = ref<MembershipPlan[]>([])

// 修改密码相关
const changePasswordDialogVisible = ref(false)
const passwordFormRef = ref<FormInstance>()
const passwordSubmitting = ref(false)
const passwordForm = ref({
  old_password: '',
  new_password: '',
  confirm_password: ''
})

// 修改邮箱相关
const changeEmailDialogVisible = ref(false)
const emailFormRef = ref<FormInstance>()
const emailSubmitting = ref(false)
const emailForm = ref({
  new_email: '',
  password: ''
})

// 其他状态
const upgradeLoading = ref(false)

// 表单验证规则
const passwordRules = {
  old_password: [
    { required: true, message: '请输入当前密码', trigger: 'blur' }
  ],
  new_password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6个字符', trigger: 'blur' }
  ],
  confirm_password: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (rule: unknown, value: string, callback: (error?: Error) => void) => {
        if (value !== passwordForm.value.new_password) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

const emailRules = {
  new_email: [
    { required: true, message: '请输入新邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入有效的邮箱地址', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' }
  ]
}

// 用户存储
const userStore = useUserStore()

// 计算存储状态
const storageStatus = computed(() => {
  const percentage = (userProfile.value.design_count / userProfile.value.design_storage_limit) * 100
  if (percentage >= 90) return 'exception'
  if (percentage >= 70) return 'warning'
  return 'success'
})

// 格式化日期
const formatDate = (dateString: string | null) => {
  if (!dateString) return '无'
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 获取用户资料
const fetchUserProfile = async () => {
  loading.value = true
  try {
    const response = await getUserProfile() as ApiResponse
    console.log('获取用户资料响应:', response)
    // 由于axios拦截器已经处理了响应，所以response就是响应数据
    if (response && response.success) {
      userProfile.value = response as unknown as UserProfile
      if (response.available_plans && Array.isArray(response.available_plans)) {
        availablePlans.value = response.available_plans.filter((plan: MembershipPlan) => plan.code !== 'free')

        // 如果没有获取到计划数据，显示提示
        if (availablePlans.value.length === 0) {
          ElMessage.warning('未能获取会员计划信息，请刷新页面重试')
        }
      }

      // 更新用户存储中的会员状态
      if (userStore.currentUser) {
        userStore.currentUser.is_premium_active = response.is_premium_active
        // 更新本地存储
        localStorage.setItem('user', JSON.stringify(userStore.currentUser))
        console.log('已更新用户存储中的会员状态:', response.is_premium_active)
      }
    } else {
      ElMessage.error(response?.message || '获取用户资料失败')
    }
  } catch (error) {
    console.error('获取用户资料出错:', error)
    ElMessage.error('获取用户资料出错')
  } finally {
    loading.value = false
  }
}

// 显示升级对话框
const showUpgradeDialog = () => {
  selectedPlan.value = null; // 确保初始没有选中任何计划
  billingCycle.value = 'month';
  upgradeDialogVisible.value = true;
}

// 获取标准会员计划
const getStandardPlan = () => {
  return availablePlans.value.find(plan => plan.code === 'standard')
}

// 获取高级会员计划
const getPremiumPlan = () => {
  return availablePlans.value.find(plan => plan.code === 'premium')
}

// 选择标准会员计划
const selectStandardPlan = (cycle?: 'month' | 'year') => {
  // 获取标准会员计划
  const plan = getStandardPlan();
  if (plan) {
    selectedPlan.value = plan;
    if (cycle) {
      billingCycle.value = cycle;
    }
  } else {
    // 如果没有获取到标准会员计划数据，创建一个默认计划
    const defaultStandardPlan: MembershipPlan = {
      id: 1,
      name: '标准会员',
      code: 'standard',
      monthly_price: 39,
      yearly_price: 399,
      storage_limit: 30,
      description: '适合个人用户的标准会员计划'
    };
    selectedPlan.value = defaultStandardPlan;
    if (cycle) {
      billingCycle.value = cycle;
    }
  }
}

// 选择高级会员计划
const selectPremiumPlan = (cycle?: 'month' | 'year') => {
  // 获取高级会员计划
  const plan = getPremiumPlan();
  if (plan) {
    selectedPlan.value = plan;
    if (cycle) {
      billingCycle.value = cycle;
    }
  } else {
    // 如果没有获取到高级会员计划数据，创建一个默认计划
    const defaultPremiumPlan: MembershipPlan = {
      id: 2,
      name: '高级会员',
      code: 'premium',
      monthly_price: 69,
      yearly_price: 699,
      storage_limit: 100,
      description: '适合专业用户的高级会员计划'
    };
    selectedPlan.value = defaultPremiumPlan;
    if (cycle) {
      billingCycle.value = cycle;
    }
  }
}

// 升级会员
const upgradeMembership = async () => {
  if (!selectedPlan.value) {
    ElMessage.warning('请选择会员计划')
    return
  }

  // 获取价格信息
  const price = billingCycle.value === 'month'
    ? selectedPlan.value.monthly_price
    : selectedPlan.value.yearly_price

  upgradeLoading.value = true

  try {
    // 创建订单
    const response = await createMembershipOrder({
      plan_id: selectedPlan.value.id,
      billing_cycle: billingCycle.value
    })

    if (response.success) {
      // 关闭对话框
      upgradeDialogVisible.value = false

      // 使用支付宝支付链接
      ElMessage.success('订单创建成功，即将跳转到支付页面')

      // 创建一个轮询任务，用于检查支付状态
      const orderId = response.order.order_id

      // 使用定时器每5秒查询一次订单状态
      const checkPaymentStatus = async () => {
        try {
          const statusResponse = await getOrderStatus(orderId)
          if (statusResponse.success && statusResponse.order.status === 'paid') {
            // 支付成功，刷新用户资料
            await fetchUserProfile()
            clearInterval(pollingInterval)
            ElMessage.success('支付成功！您现在已经是我们的会员了')
          }
        } catch (error) {
          console.error('检查支付状态时出错:', error)
        }
      }

      // 设置定时器，在用户离开页面后会自动停止
      const pollingInterval = setInterval(checkPaymentStatus, 5000)

      // 打开新窗口进行支付
      window.open(response.payment_url, '_blank')
    } else {
      ElMessage.error(response.message || '创建订单失败')
    }
  } catch (error) {
    console.error('升级会员时出错:', error)
    ElMessage.error('创建订单失败，请稍后再试')
  } finally {
    upgradeLoading.value = false
  }
}

// 获取操作按钮文本
const getActionButtonText = () => {
  if (!selectedPlan.value) return '请选择会员计划'

  const planText = (billingCycle.value === 'month' ? '月度' : '年度') + selectedPlan.value.name

  // 如果用户已经是会员
  if (userProfile.value.is_premium_active) {
    // 如果选择的计划与当前计划相同，则为续费
    if (userProfile.value.membership_plan && userProfile.value.membership_plan.id === selectedPlan.value.id) {
      return `续费${planText}`
    }
    // 否则为升级/变更
    return `升级到${planText}`
  }

  // 非会员状态
  return `立即开通${planText}`
}

// 显示修改密码对话框
const showChangePasswordDialog = () => {
  passwordForm.value = {
    old_password: '',
    new_password: '',
    confirm_password: ''
  }
  changePasswordDialogVisible.value = true
}

// 提交修改密码
const submitChangePassword = async () => {
  if (!passwordFormRef.value) return

  await passwordFormRef.value.validate(async (valid) => {
    if (valid) {
      passwordSubmitting.value = true
      try {
        const response = await changePassword(passwordForm.value) as PasswordResponse
        if (response.success) {
          ElMessage.success(response.message || '密码修改成功')
          changePasswordDialogVisible.value = false

          // 更新token
          if (response.access && response.refresh) {
            localStorage.setItem('access_token', response.access)
            localStorage.setItem('refresh_token', response.refresh)
          }
        } else {
          ElMessage.error(response.message || '密码修改失败')
        }
      } catch (error: unknown) {
        const err = error as { response?: { data?: { message?: string } } }
        ElMessage.error(err.response?.data?.message || '密码修改失败，请稍后重试')
      } finally {
        passwordSubmitting.value = false
      }
    }
  })
}

// 显示修改邮箱对话框
const showChangeEmailDialog = () => {
  emailForm.value = {
    new_email: '',
    password: ''
  }
  changeEmailDialogVisible.value = true
}

// 提交修改邮箱
const submitChangeEmail = async () => {
  if (!emailFormRef.value) return

  await emailFormRef.value.validate(async (valid) => {
    if (valid) {
      emailSubmitting.value = true
      try {
        const response = await changeEmail(emailForm.value) as EmailResponse
        if (response.success) {
          ElMessage.success(response.message || '邮箱修改成功')
          changeEmailDialogVisible.value = false

          // 更新用户资料
          userProfile.value.email = response.email || userProfile.value.email
        } else {
          ElMessage.error(response.message || '邮箱修改失败')
        }
      } catch (error: unknown) {
        const err = error as { response?: { data?: { message?: string } } }
        ElMessage.error(err.response?.data?.message || '邮箱修改失败，请稍后重试')
      } finally {
        emailSubmitting.value = false
      }
    }
  })
}

// 监听会员计划列表变化
watch(availablePlans, (newPlans) => {
  // 如果已选择了计划，但该计划不在新的计划列表中，则重置选择
  if (selectedPlan.value && !newPlans.some(plan => plan.id === selectedPlan.value?.id)) {
    selectedPlan.value = null
  }
}, { deep: true })

onMounted(() => {
  fetchUserProfile()
})
</script>

<style scoped lang="scss">
.user-profile-container {
  max-width: 100%;
  margin: 0 auto;
  padding: 40px 24px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
  background-color: var(--bg-color, #f5f7fa);
  min-height: 100vh;
  /* 确保容器至少有视口高度 */
  height: auto;
  /* 允许容器高度自适应内容 */
  overflow-y: auto;
  /* 允许垂直滚动 */

  @media (min-width: 992px) {
    grid-template-columns: 1fr;
    max-width: 1200px;
  }
}

.profile-card {
  border-radius: var(--radius, 12px);
  box-shadow: var(--shadow, 0 4px 12px rgba(0, 0, 0, 0.05));
  border: none;
  overflow: visible;
  /* 改为visible，确保内容不被截断 */
  transition: var(--transition, all 0.3s ease);
  width: 100%;
  background-color: var(--card-bg, #fff);
  height: auto;
  /* 确保卡片高度自适应内容 */
  max-height: none;
  /* 移除最大高度限制 */

  &:hover {
    box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.08));
    transform: translateY(-2px);
  }
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;

  h2 {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    color: var(--text-color, #333);
    letter-spacing: -0.5px;
    background: linear-gradient(90deg, var(--primary-color, #3a6af8) 0%, var(--primary-dark, #2a4db7) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
}

.loading-container {
  padding: 32px 0;
  display: flex;
  justify-content: center;
}

.profile-content {
  padding: 16px 0;
  overflow-y: visible;
  /* 确保内容可见且可滚动 */
  height: auto;
  /* 高度自适应内容 */
}

.info-item {
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  padding: 16px;
  border-radius: var(--radius, 12px);
  transition: var(--transition, all 0.3s ease);
  background-color: var(--card-bg, #fff);
  border: 1px solid transparent;

  &:hover {
    background-color: var(--primary-light, #f0f4ff);
    border-color: var(--primary-color, #3a6af8);
    transform: translateX(4px);
  }
}

.label {
  width: 140px;
  color: var(--text-light, #666);
  font-weight: 600;
  font-size: 14px;
  position: relative;
  padding-left: 16px;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 16px;
    background-color: var(--primary-color, #3a6af8);
    border-radius: 2px;
  }
}

.value {
  flex: 1;
  color: var(--text-color, #333);
  font-weight: 500;
  font-size: 15px;
}

.pending-plan {
  background-color: rgba(250, 236, 216, 0.5);
  border-left: 3px solid #e6a23c;
}

.pending-plan-details {
  margin-top: 8px;
  font-size: 13px;
  color: #8c6c3e;
}

.pending-dates {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #a78052;
}

.edit-button {
  margin-left: 16px;
}

.storage-progress {
  margin-top: 12px;
  width: 100%;

  :deep(.el-progress-bar__inner) {
    background: linear-gradient(90deg, var(--primary-color, #3a6af8) 0%, var(--primary-dark, #2a4db7) 100%);
    transition: all 0.3s ease;
  }

  :deep(.el-progress-bar__outer) {
    background-color: var(--primary-light, #f0f4ff);
    border-radius: 8px;
  }
}

.storage-info {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 14px;
  color: var(--text-light, #666);
}

.upgrade-section {
  margin-top: 30px;
  padding: 24px;
  border-top: 1px solid var(--border-color, #eaeaea);
  background-color: var(--primary-light, #f0f4ff);
  border-radius: var(--radius, 12px);
  text-align: center;

  h3 {
    font-size: 20px;
    font-weight: 700;
    color: var(--primary-color, #3a6af8);
    margin-bottom: 12px;
  }

  p {
    color: var(--text-light, #666);
    margin-bottom: 20px;
    font-size: 15px;
  }

  .el-button {
    padding: 12px 24px;
    font-weight: 600;
  }
}

.upgrade-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;

  .el-icon {
    color: var(--primary-color);
  }
}

.premium-benefits {
  margin: 20px 0;
}

.benefits-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.benefit-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  background-color: var(--primary-light);
  border-radius: var(--radius);

  .el-icon {
    font-size: 18px;
    color: var(--primary-color);
    margin-top: 3px;
    flex-shrink: 0;
  }

  .benefit-content {
    flex: 1;
    min-width: 0;
    /* 防止文本溢出 */
  }

  .benefit-title {
    font-weight: 600;
    color: var(--text-color);
    margin-bottom: 4px;
    font-size: 14px;
  }

  .benefit-desc {
    font-size: 12px;
    color: var(--text-light);
    line-height: 1.4;
  }
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 12px;
  position: relative;
}

.plans-title {
  margin-top: 20px;
  margin-bottom: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.loading-placeholder,
.empty-plans {
  margin-bottom: 30px;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.pricing-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 30px;
  width: 100%;
}

.pricing-card {
  border-radius: var(--radius, 12px);
  box-shadow: var(--shadow, 0 4px 12px rgba(0, 0, 0, 0.05));
  overflow: hidden;
  transition: var(--transition, all 0.3s ease);
  position: relative;
  padding: 24px;
  background-color: var(--card-bg, #fff);
  width: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 2px solid transparent;

  &:hover {
    box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.08));
    transform: translateY(-5px);
  }

  &.is-selected {
    border-color: var(--primary-color, #3a6af8);
    box-shadow: 0 0 0 2px rgba(58, 106, 248, 0.2);
  }

  &.is-active {
    background-color: var(--primary-light, #f0f4ff);
    border-color: var(--primary-color, #3a6af8);
  }

  &.premium {
    box-shadow: var(--shadow, 0 4px 12px rgba(0, 0, 0, 0.05));

    &:hover {
      box-shadow: var(--shadow-lg, 0 8px 24px rgba(58, 106, 248, 0.2));
    }

    &.is-selected {
      border-color: var(--primary-color, #3a6af8);
      box-shadow: 0 0 0 2px rgba(58, 106, 248, 0.2);
    }
  }
}

.pricing-badge {
  position: absolute;
  top: 0;
  right: 24px;
  background: linear-gradient(90deg, rgba(255, 126, 95, 0.85), rgba(254, 180, 123, 0.85));
  color: white;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 0 0 12px 12px;
  box-shadow: 0 4px 8px rgba(255, 126, 95, 0.25);
  z-index: 1;
}

.pricing-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;

  h4 {
    font-size: 18px;
    font-weight: 700;
    color: var(--text-color, #333);
    margin: 0;
    background: linear-gradient(90deg, var(--primary-color, #3a6af8) 0%, var(--primary-dark, #2a4db7) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
}

.active-badge {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 20px;
  background: linear-gradient(90deg, rgba(54, 209, 220, 0.85) 0%, rgba(91, 134, 229, 0.85) 100%);
  color: white;
  font-weight: 600;
  box-shadow: 0 2px 4px rgba(54, 209, 220, 0.25);
}

.pricing-price {
  margin-bottom: 20px;
  background-color: var(--primary-light, #f0f4ff);
  border-radius: var(--radius, 12px);
  padding: 16px;

  .price-value,
  .price-period {
    padding: 10px;
    border-radius: var(--radius-sm, 8px);
    cursor: pointer;
    transition: var(--transition, all 0.3s ease);
    border: 1px solid transparent;
    margin-bottom: 8px;
    text-align: center;

    &:hover {
      background-color: rgba(255, 255, 255, 0.8);
    }

    &.selected {
      background-color: white;
      border-color: var(--primary-color, #3a6af8);
      font-weight: 600;
      box-shadow: 0 2px 8px rgba(58, 106, 248, 0.15);
    }
  }

  .price-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--primary-color, #3a6af8);
  }

  .price-period {
    font-size: 15px;
    color: var(--text-color, #333);

    .price-savings {
      font-size: 12px;
      color: var(--accent-color, #f56c6c);
      margin-top: 4px;
      font-weight: 600;
    }
  }
}

.pricing-features {
  margin-bottom: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color, #eaeaea);

  .feature-item {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    font-size: 14px;

    .el-icon {
      font-size: 16px;
      color: var(--success-color, #67c23a);
      background-color: rgba(103, 194, 58, 0.1);
      padding: 4px;
      border-radius: 50%;
    }

    &.muted {
      opacity: 0.6;

      .el-icon {
        color: var(--text-light, #909399);
        background-color: rgba(144, 147, 153, 0.1);
      }
    }
  }
}

.pricing-cta {
  margin-top: auto;

  .select-plan-btn {
    width: 100%;
    padding: 12px;
    border: none;
    background: linear-gradient(90deg, rgba(58, 106, 248, 0.85) 0%, rgba(42, 77, 183, 0.85) 100%);
    color: white;
    border-radius: var(--radius, 12px);
    font-weight: 600;
    font-size: 15px;
    cursor: pointer;
    transition: var(--transition, all 0.3s ease);
    box-shadow: 0 4px 12px rgba(58, 106, 248, 0.15);

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(58, 106, 248, 0.2);
      background: linear-gradient(90deg, rgba(58, 106, 248, 0.95) 0%, rgba(42, 77, 183, 0.95) 100%);
    }

    &.selected {
      background: linear-gradient(90deg, rgba(42, 77, 183, 0.85) 0%, rgba(58, 106, 248, 0.85) 100%);
    }

    &.premium {
      background: linear-gradient(90deg, rgba(54, 209, 220, 0.85) 0%, rgba(91, 134, 229, 0.85) 100%);

      &:hover {
        background: linear-gradient(90deg, rgba(91, 134, 229, 0.95) 0%, rgba(54, 209, 220, 0.95) 100%);
      }
    }
  }

  .current-plan-label {
    display: block;
    text-align: center;
    color: var(--primary-color, #3a6af8);
    font-weight: 600;
    margin-top: 8px;
    font-size: 14px;
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--border-color);
}

@media (max-width: 992px) {
  .membership-dialog {
    width: 90% !important;
  }

  .benefits-list {
    grid-template-columns: 1fr 1fr;
  }

  .pricing-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 768px) {
  .benefits-list {
    grid-template-columns: 1fr;
  }

  .pricing-grid {
    grid-template-columns: 1fr;
  }

  .pricing-card {
    padding: 16px;
  }

  .membership-dialog {
    width: 95% !important;
  }

  .info-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .label {
    width: 100%;
    margin-bottom: 8px;
    padding-left: 12px;

    &::before {
      height: 12px;
    }
  }

  .value {
    width: 100%;
    padding-left: 12px;
  }
}

@media (max-width: 576px) {
  .membership-dialog-content {
    padding: 16px;
  }

  .benefit-item {
    padding: 10px;
  }

  .pricing-card {
    padding: 12px;
  }
}

/* 会员对话框样式 */
.membership-dialog {
  :deep(.el-dialog__body) {
    padding: 0;
  }

  :deep(.el-dialog__header) {
    padding: 20px 24px;
    margin: 0;
    border-bottom: 1px solid var(--border-color, #eaeaea);
    background: linear-gradient(90deg, var(--primary-light, #f0f4ff) 0%, #ffffff 100%);
  }

  :deep(.el-dialog__title) {
    font-weight: 700;
    font-size: 20px;
    color: var(--primary-color, #3a6af8);
  }
}

.membership-dialog-content {
  padding: 20px;
  max-width: 100%;
  overflow-x: hidden;
}

/* 链接按钮样式 */
:deep(.el-button--primary.is-link) {
  color: rgba(58, 106, 248, 0.85);

  &:hover {
    color: rgba(42, 77, 183, 0.95);
    transform: none;
    box-shadow: none;
  }
}

/* 确保页面的根元素允许滚动 */
:deep(html),
:deep(body) {
  height: 100%;
  overflow-y: auto !important;
}

:deep(.el-card__body) {
  padding: 20px;
  overflow: visible;
  height: auto;
}
</style>
