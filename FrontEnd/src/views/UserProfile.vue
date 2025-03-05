<template>
  <div class="user-profile-container">
    <el-card class="profile-card">
      <template #header>
        <div class="card-header">
          <h2>用户资料</h2>
          <el-tag v-if="userProfile.is_premium_active" type="success">会员</el-tag>
          <el-tag v-else type="info">免费用户</el-tag>
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
          <span class="value">{{ formatDate(userProfile.premium_expiry) }}</span>
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
        <p>您当前的会员计划: {{ userProfile.membership_plan?.name }} (到期时间: {{ formatDate(userProfile.premium_expiry) }})</p>
        <el-button type="primary" @click="showUpgradeDialog">续费/升级</el-button>
      </div>
    </el-card>

    <!-- 升级对话框 -->
    <el-dialog v-model="upgradeDialogVisible" :title="userProfile.is_premium_active ? '续费/升级会员' : '升级到会员'"
      width="600px">
      <div class="upgrade-dialog-content">
        <h3>会员特权</h3>
        <ul>
          <li>更大的设计存储空间</li>
          <li>支持更多高级功能</li>
          <li><strong>独家协作功能</strong> - 与团队成员实时协作设计</li>
          <li>优先获取新功能</li>
        </ul>

        <div class="plans-section">
          <div v-for="plan in availablePlans" :key="plan.id" class="plan-item"
            :class="{ 'selected-plan': selectedPlan && selectedPlan.id === plan.id }">
            <div class="plan-header">
              <h4>{{ plan.name }}</h4>
              <p v-if="plan.description">{{ plan.description }}</p>
            </div>

            <div class="plan-details">
              <div class="storage-info">
                <i class="el-icon-folder"></i>
                <span>{{ plan.storage_limit }}个设计</span>
              </div>

              <div class="price-options">
                <div class="price-option" @click="selectPlan(plan, 'month')"
                  :class="{ 'selected': selectedPlan && selectedPlan.id === plan.id && billingCycle === 'month' }">
                  <div class="price">¥{{ plan.monthly_price }}/月</div>
                </div>

                <div class="price-option" @click="selectPlan(plan, 'year')"
                  :class="{ 'selected': selectedPlan && selectedPlan.id === plan.id && billingCycle === 'year' }">
                  <div class="price">¥{{ plan.yearly_price }}/年</div>
                  <div class="discount">相当于¥{{ (plan.yearly_price / 12).toFixed(2) }}/月</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="action-buttons">
          <el-button @click="upgradeDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="upgradeMembership" :disabled="!selectedPlan">
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
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getUserProfile, changePassword, changeEmail } from '@/api/user'
import { useUserStore } from '@/stores/user'
import type { FormInstance } from 'element-plus'

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
  premium_expiry: string | null;
  design_storage_limit: number;
  design_count: number;
  membership_plan: MembershipPlan | null;
  available_plans: MembershipPlan[];
}

// 定义API响应类型
interface ApiResponse {
  success: boolean;
  message?: string;
  username?: string;
  email?: string;
  is_premium?: boolean;
  is_premium_active?: boolean;
  premium_expiry?: string | null;
  design_storage_limit?: number;
  design_count?: number;
  membership_plan?: MembershipPlan | null;
  available_plans?: MembershipPlan[];
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
  premium_expiry: null,
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
  selectedPlan.value = null
  billingCycle.value = 'month'
  upgradeDialogVisible.value = true
}

// 选择会员计划
const selectPlan = (plan: MembershipPlan, cycle: 'month' | 'year') => {
  selectedPlan.value = plan
  billingCycle.value = cycle
}

// 升级会员
const upgradeMembership = () => {
  if (!selectedPlan.value) {
    ElMessage.warning('请选择会员计划')
    return
  }

  // 获取价格信息
  const price = billingCycle.value === 'month'
    ? selectedPlan.value.monthly_price
    : selectedPlan.value.yearly_price

  // 这里应该跳转到支付页面或调用支付API
  const actionText = userProfile.value.is_premium_active ? '续费/升级' : '开通'
  ElMessage.info(`正在开发${billingCycle.value === 'month' ? '月度' : '年度'}${selectedPlan.value.name}${actionText}支付功能，价格：¥${price}，敬请期待！`)
  upgradeDialogVisible.value = false
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

onMounted(() => {
  fetchUserProfile()
})
</script>

<style scoped>
.user-profile-container {
  max-width: 800px;
  margin: 20px auto;
  padding: 0 20px;
}

.profile-card {
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h2 {
  margin: 0;
  font-size: 20px;
  color: #333;
}

.loading-container {
  padding: 20px 0;
}

.profile-content {
  padding: 10px 0;
}

.info-item {
  margin-bottom: 16px;
  display: flex;
  align-items: flex-start;
}

.label {
  width: 120px;
  color: #606266;
  font-weight: 500;
}

.value {
  flex: 1;
  color: #333;
}

.storage-progress {
  margin-top: 8px;
  width: 100%;
}

.upgrade-section {
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid #eee;
  text-align: center;
}

.upgrade-section h3 {
  margin-bottom: 10px;
  color: #333;
}

.upgrade-section p {
  margin-bottom: 20px;
  color: #606266;
}

.upgrade-dialog-content h3 {
  margin-bottom: 16px;
  color: #333;
}

.upgrade-dialog-content ul {
  margin-bottom: 24px;
  padding-left: 20px;
}

.upgrade-dialog-content li {
  margin-bottom: 8px;
  color: #606266;
}

.plans-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 20px;
}

.plan-item {
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 20px;
  transition: all 0.3s;
}

.plan-item:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.selected-plan {
  border-color: #409EFF;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.2);
}

.plan-header h4 {
  margin: 0 0 10px 0;
  color: #333;
  font-size: 18px;
}

.plan-header p {
  margin: 0 0 15px 0;
  color: #606266;
  font-size: 14px;
}

.plan-details {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.storage-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #606266;
}

.price-options {
  display: flex;
  gap: 15px;
}

.price-option {
  padding: 10px 15px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
}

.price-option:hover,
.price-option.selected {
  border-color: #409EFF;
  background-color: #ecf5ff;
}

.price {
  font-size: 16px;
  font-weight: bold;
  color: #409EFF;
}

.discount {
  font-size: 12px;
  color: #67C23A;
  margin-top: 5px;
}

.action-buttons {
  margin-top: 30px;
  display: flex;
  justify-content: flex-end;
}
</style>
