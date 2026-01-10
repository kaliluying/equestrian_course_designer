import { defineStore } from 'pinia'
import { ref, computed, watch} from 'vue'
import { ObstacleType, DecorationCategory } from '@/types/obstacle'
import type {
  CustomObstacleTemplate,
  WallProperties,
  LiverpoolProperties,
  WaterProperties,
} from '@/types/obstacle'
import { useUserStore } from '@/stores/user'
import {
  fetchUserObstacles,
  createObstacle,
  updateObstacle,
  deleteObstacle,
  getObstacleCountInfo,
  getSharedObstacles,
  toggleObstacleSharing,
} from '@/api/obstacle'
import type {
  ObstacleData,
  ObstacleCountInfo,
  ObstacleDataDetails,
  ApiWallProperties,
  ApiLiverpoolProperties,
  ApiWaterProperties,
  ApiDecorationProperties,
} from '@/api/obstacle'
import { ElMessage } from 'element-plus'
import {
  ErrorCode,
  ErrorSeverity,
  type ErrorResponse,
  createErrorResponse,
} from '@/types/error'

// 将API返回的ObstacleData转换为CustomObstacleTemplate
const convertApiObstacleToTemplate = (apiObstacle: ObstacleData): CustomObstacleTemplate => {
  const obstacleData = apiObstacle.obstacle_data

  // 创建基本模板
  const template: CustomObstacleTemplate = {
    id: apiObstacle.id?.toString() || '',
    name: apiObstacle.name,
    baseType: obstacleData.type as ObstacleType,
    poles: [],
    createdAt: apiObstacle.created_at || new Date().toISOString(),
    updatedAt: apiObstacle.updated_at || new Date().toISOString(),
    isShared: apiObstacle.is_shared || false,
    user_username: apiObstacle.user_username || '',
  }

  // 转换杆子数据
  if (Array.isArray(obstacleData.poles)) {
    template.poles = obstacleData.poles.map((p) => ({
      height: p.height || 100,
      width: p.width || 300,
      color: p.color || '#ff0000',
      spacing: p.spacing,
      number: p.number,
      numberPosition: p.numberPosition,
    }))
  }

  // 转换墙属性
  if (obstacleData.wallProperties) {
    template.wallProperties = obstacleData.wallProperties as unknown as WallProperties
  }

  // 转换利物浦属性
  if (obstacleData.liverpoolProperties) {
    template.liverpoolProperties =
      obstacleData.liverpoolProperties as unknown as LiverpoolProperties
  }

  // 转换水障属性
  if (obstacleData.waterProperties) {
    template.waterProperties = obstacleData.waterProperties as unknown as WaterProperties
  }

  // 转换装饰物属性
  if (obstacleData.decorationProperties) {
    const apiDecoration = obstacleData.decorationProperties
    template.decorationProperties = {
      category: (apiDecoration.category as DecorationCategory) || DecorationCategory.CUSTOM,
      width: apiDecoration.width || 100,
      height: apiDecoration.height || 100,
      color: apiDecoration.color || '#000000',
      secondaryColor: apiDecoration.secondaryColor,
      svgData: apiDecoration.svgData,
      imageUrl: apiDecoration.imageUrl,
      text: apiDecoration.text,
      textColor: apiDecoration.textColor,
      trunkHeight: apiDecoration.trunkHeight,
      trunkWidth: apiDecoration.trunkWidth,
      foliageRadius: apiDecoration.foliageRadius,
      borderColor: apiDecoration.borderColor,
      borderWidth: apiDecoration.borderWidth,
      rotation: apiDecoration.rotation,
      scale: apiDecoration.scale,
      showDirectionArrow: (apiDecoration.showDirectionArrow as boolean) || false,
    }
  }

  return template
}

// 将CustomObstacleTemplate转换为API所需的ObstacleData
const convertTemplateToApiObstacle = (template: CustomObstacleTemplate): ObstacleData => {
  // 创建基本的障碍物数据
  const obstacleData: ObstacleDataDetails = {
    type: template.baseType,
    poles: template.poles.map((p) => ({
      x: 0, // 默认值，API需要但前端模型没有
      y: 0, // 默认值，API需要但前端模型没有
      length: p.width, // 使用宽度作为长度
      angle: 0, // 默认值，API需要但前端模型没有
      height: p.height,
      width: p.width,
      color: p.color,
      spacing: p.spacing,
      number: p.number,
      numberPosition: p.numberPosition,
    })),
    width:
      template.wallProperties?.width ||
      template.decorationProperties?.width ||
      template.poles[0]?.width ||
      300,
    height:
      template.wallProperties?.height ||
      template.decorationProperties?.height ||
      template.poles[0]?.height ||
      100,
  }

  // 添加特定属性
  if (template.wallProperties) {
    obstacleData.wallProperties = template.wallProperties as unknown as ApiWallProperties
  }

  if (template.liverpoolProperties) {
    obstacleData.liverpoolProperties =
      template.liverpoolProperties as unknown as ApiLiverpoolProperties
  }

  if (template.waterProperties) {
    obstacleData.waterProperties = template.waterProperties as unknown as ApiWaterProperties
  }

  if (template.decorationProperties) {
    obstacleData.decorationProperties =
      template.decorationProperties as unknown as ApiDecorationProperties
  }

  // 处理ID - 对于更新操作，我们需要有效的数字ID
  // 对于创建操作，我们不提供ID，让后端自动生成
  let id: number | undefined = undefined

  // 只有当ID存在且不是'new'时才尝试提取数字ID
  if (template.id && template.id !== 'new') {
    // 如果是纯数字，直接转换
    if (/^\d+$/.test(template.id)) {
      id = parseInt(template.id)
    } else {
      // 尝试从字符串中提取数字部分
      const match = template.id.match(/\d+/)
      id = match ? parseInt(match[0]) : undefined
    }
  }

  return {
    id: id, // 可能是undefined (创建) 或有效的数字ID (更新)
    name: template.name,
    obstacle_data: obstacleData,
    is_shared: template.isShared,
  }
}

export const useObstacleStore = defineStore('obstacle', () => {
  // 存储所有自定义障碍物
  const customObstacles = ref<CustomObstacleTemplate[]>([])
  // 存储共享的障碍物
  const sharedObstacles = ref<CustomObstacleTemplate[]>([])
  // 加载状态
  const loading = ref(false)
  // 共享障碍物加载状态
  const loadingShared = ref(false)
  // 错误信息
  const error = ref<ErrorResponse | null>(null)
  // 共享障碍物错误信息
  const sharedError = ref<ErrorResponse | null>(null)
  // 障碍物数量限制信息
  const obstacleCountInfo = ref<ObstacleCountInfo | null>(null)

  // 获取用户存储
  const userStore = useUserStore()

  // 获取本地存储键名，与用户ID关联（用于本地存储备份）
  const getStorageKey = () => {
    const userId = userStore.currentUser?.id
    return userId ? `customObstacles_${userId}` : null
  }

  // 初始化加载自定义障碍物
  const initObstacles = async () => {
    // 清空当前障碍物，以防切换用户时显示了其他用户的障碍物
    customObstacles.value = []
    error.value = null

    // 如果用户未登录，则不加载任何障碍物
    if (!userStore.isAuthenticated) {
      return
    }

    loading.value = true

    try {
      // 从服务器加载障碍物
      const response = await fetchUserObstacles()

      // 检查响应格式，处理分页数据
      // 使用类型断言处理可能的分页响应
      const paginatedResponse = response as unknown as { results?: ObstacleData[] }
      const obstacles = paginatedResponse.results || (response as ObstacleData[])

      if (Array.isArray(obstacles)) {
        customObstacles.value = obstacles.map(convertApiObstacleToTemplate)

        // 同时保存一份到本地存储（作为备份）
        const storageKey = getStorageKey()
        if (storageKey) {
          localStorage.setItem(storageKey, JSON.stringify(customObstacles.value))
        }
      } else {
        console.error('服务器返回的障碍物数据格式不正确:', obstacles)
        throw new Error('障碍物数据格式不正确')
      }

      // 获取障碍物数量限制信息
      try {
        obstacleCountInfo.value = await getObstacleCountInfo()
      } catch (countError) {
        console.error('获取障碍物数量限制信息失败:', countError)
      }
    } catch (e) {
      console.error('从服务器加载自定义障碍物失败:', e)
      error.value = createErrorResponse(ErrorCode.LOAD_OBSTACLE_FAILED, '加载障碍物失败，请重试')

      // 尝试从本地存储加载（作为备份方案）
      const storageKey = getStorageKey()
      if (storageKey) {
        const savedObstacles = localStorage.getItem(storageKey)
        if (savedObstacles) {
          try {
            customObstacles.value = JSON.parse(savedObstacles)
          } catch (localError) {
            console.error('加载本地备份障碍物失败:', localError)
            customObstacles.value = []
          }
        }
      }
    } finally {
      loading.value = false
    }
  }

  // 保存自定义障碍物
  const saveCustomObstacle = async (obstacle: CustomObstacleTemplate, showMessage = true) => {
    // 如果用户未登录，则不保存
    if (!userStore.isAuthenticated) {
      console.error('用户未登录，无法保存自定义障碍物')
      error.value = createErrorResponse(
        ErrorCode.USER_NOT_LOGGED_IN,
        '请先登录后再创建或编辑自定义障碍物',
        ErrorSeverity.WARNING,
      )
      if (showMessage) {
        ElMessage.warning(error.value.message)
      }
      return obstacle
    }

    // 检查非会员用户数量限制
    if (
      !userStore.currentUser?.is_premium_active &&
      !obstacle.id &&
      customObstacles.value.length >= 10
    ) {
      error.value = createErrorResponse(
        ErrorCode.USER_LIMIT_EXCEEDED,
        '普通用户最多创建10个自定义障碍，请升级会员享受无限创建特权',
        ErrorSeverity.WARNING,
        {
          solutions: ['删除一些不需要的障碍物以释放空间', '升级为会员，享受无限创建特权'],
        },
      )
      if (showMessage) {
        ElMessage({
          message: error.value.message,
          type: 'warning',
          duration: 5000,
          showClose: true,
          grouping: true,
        })
      }
      return obstacle
    }

    loading.value = true
    error.value = null

    try {
      // 转换为API格式
      const apiObstacle = convertTemplateToApiObstacle(obstacle)

      let savedObstacle: ObstacleData

      // 通过API保存到服务器
      if (obstacle.id && obstacle.id !== 'new') {
        // 更新现有障碍物 - 直接传递ID，让API处理ID转换

        savedObstacle = await updateObstacle(obstacle.id, apiObstacle)
      } else {
        // 创建新障碍物

        savedObstacle = await createObstacle(apiObstacle)
      }

      // 转换回模板格式
      const savedTemplate = convertApiObstacleToTemplate(savedObstacle)

      // 更新本地障碍物列表
      const index = customObstacles.value.findIndex((o) => o.id === savedTemplate.id)
      if (index >= 0) {
        // 更新现有障碍物
        customObstacles.value[index] = savedTemplate
      } else {
        // 添加新障碍物
        customObstacles.value.push(savedTemplate)
      }

      // 同时更新本地存储备份
      const storageKey = getStorageKey()
      if (storageKey) {
        localStorage.setItem(storageKey, JSON.stringify(customObstacles.value))
      }

      // 更新障碍物数量信息
      try {
        obstacleCountInfo.value = await getObstacleCountInfo()
      } catch (countError) {
        console.error('获取障碍物数量限制信息失败:', countError)
      }

      // 明确标记操作成功
      error.value = null
      if (showMessage) {
        ElMessage.success(index >= 0 ? '障碍物已更新' : '障碍物已创建')
      }
      return savedTemplate
    } catch (e) {
      console.error('保存自定义障碍物到服务器失败:', e)

      // 特殊处理常见错误情况
      if (e && typeof e === 'object' && 'response' in e) {
        interface ErrorResponseData {
          data?: {
            code?: string
            detail?: string
            message?: string
            name?: string
            errors?: string[]
          }
          status?: number
        }

        const response = (e as { response?: ErrorResponseData }).response

        // 名称重复错误
        if (
          response?.data?.name &&
          Array.isArray(response.data.errors) &&
          response.data.errors.some((err) => err.includes('already exists'))
        ) {
          error.value = createErrorResponse(
            ErrorCode.DUPLICATE_NAME,
            '障碍物名称已存在，请使用其他名称',
            ErrorSeverity.ERROR,
          )
          return obstacle
        }

        // 超出限制错误
        if (response?.status === 403 && response.data?.detail?.includes('limit')) {
          error.value = createErrorResponse(
            ErrorCode.USER_LIMIT_EXCEEDED,
            response.data.detail || '您已达到障碍物数量上限',
            ErrorSeverity.WARNING,
          )
          return obstacle
        }

        // 其他API错误
        if (response?.data?.message) {
          error.value = createErrorResponse(
            ErrorCode.API_ERROR,
            response.data.message,
            ErrorSeverity.ERROR,
          )
          return obstacle
        }
      }

      // 设置错误
      error.value = createErrorResponse(ErrorCode.SAVE_OBSTACLE_FAILED, '保存障碍物失败，请重试')

      // 显示错误消息
      if (showMessage) {
        ElMessage({
          message: error.value.message,
          type: error.value.severity as 'error' | 'warning' | 'info' | 'success',
          duration: 5000,
          showClose: true,
          grouping: true,
        })
      }

      return obstacle
    } finally {
      loading.value = false
    }
  }

  // 删除自定义障碍物
  const removeCustomObstacle = async (id: string) => {
    // 如果用户未登录，则不操作
    if (!userStore.isAuthenticated) {
      console.error('用户未登录，无法删除自定义障碍物')
      ElMessage.warning('请先登录后再删除自定义障碍物')
      return false
    }

    loading.value = true
    error.value = null

    try {
      // 通过API从服务器删除 - 直接传递ID，让API处理ID转换
      await deleteObstacle(id)

      // 从本地障碍物列表中移除
      const index = customObstacles.value.findIndex((o) => o.id === id)
      if (index >= 0) {
        customObstacles.value.splice(index, 1)

        // 同时更新本地存储备份
        const storageKey = getStorageKey()
        if (storageKey) {
          localStorage.setItem(storageKey, JSON.stringify(customObstacles.value))
        }

        // 更新障碍物数量信息
        try {
          obstacleCountInfo.value = await getObstacleCountInfo()
        } catch (countError) {
          console.error('获取障碍物数量限制信息失败:', countError)
        }

        ElMessage.success('障碍物已删除')
        return true
      }
      return false
    } catch (e) {
      console.error('从服务器删除自定义障碍物失败:', e)
      error.value = createErrorResponse(ErrorCode.DELETE_OBSTACLE_FAILED, '删除障碍物失败，请重试')
      ElMessage.error('删除障碍物失败，请重试')
      return false
    } finally {
      loading.value = false
    }
  }

  // 根据ID获取障碍物
  const getObstacleById = (id: string): CustomObstacleTemplate | null => {
    // 先在自定义障碍物中查找
    const customObstacle = customObstacles.value.find((o) => o.id === id)
    if (customObstacle) {
      return customObstacle
    }

    // 如果没找到，在共享障碍物中查找
    const sharedObstacle = sharedObstacles.value.find((o) => o.id === id)
    if (sharedObstacle) {
      return sharedObstacle
    }

    // 如果都没找到，输出详细日志
    console.error(
      `未找到ID为 ${id} 的自定义障碍物，当前自定义障碍物数量: ${customObstacles.value.length}，共享障碍物数量: ${sharedObstacles.value.length}`,
    )

    // 如果用户已登录但障碍物列表为空，尝试重新加载
    if (
      userStore.isAuthenticated &&
      (customObstacles.value.length === 0 ||
        (sharedObstacles.value.length === 0 && loadingShared.value === false))
    ) {
      // 异步加载，不阻塞当前操作
      setTimeout(() => {
        initObstacles()
        initSharedObstacles()
      }, 0)
    }

    return null
  }

  // 正在加载中的计算属性
  const isLoading = computed(() => loading.value)

  // 是否有错误的计算属性
  const hasError = computed(() => error.value !== null)

  // 初始化加载共享障碍物
  const initSharedObstacles = async () => {
    // 如果用户未登录，则不加载共享障碍物但不抛出错误
    if (!userStore.isAuthenticated) {
      // 清空共享障碍物列表，避免显示旧数据
      sharedObstacles.value = []
      return
    }

    loadingShared.value = true
    sharedError.value = null

    try {
      // 从服务器加载共享障碍物
      const response = await getSharedObstacles()

      // 检查响应格式，处理分页数据
      // 使用类型断言处理可能的分页响应
      if (!response) {
        // 处理空响应情况
        sharedObstacles.value = []
        return
      }

      const paginatedResponse = response as unknown as { results?: ObstacleData[] }
      const obstacles = paginatedResponse.results || (response as ObstacleData[])

      if (Array.isArray(obstacles)) {
        sharedObstacles.value = obstacles.map(convertApiObstacleToTemplate)
      } else {
        console.error('服务器返回的共享障碍物数据格式不正确:', obstacles)
        sharedObstacles.value = [] // 设置为空数组避免引用错误
        sharedError.value = createErrorResponse(
          ErrorCode.LOAD_SHARED_OBSTACLE_FAILED,
          '共享障碍物数据格式不正确',
        )
      }
    } catch (e) {
      console.error('从服务器加载共享障碍物失败:', e)
      sharedError.value = createErrorResponse(
        ErrorCode.LOAD_SHARED_OBSTACLE_FAILED,
        '加载共享障碍物失败，请重试',
      )
    } finally {
      loadingShared.value = false
    }
  }

  // 切换障碍物共享状态
  const toggleSharing = async (id: string) => {
    if (!userStore.isAuthenticated) {
      console.error('用户未登录，无法修改共享状态')
      ElMessage.warning('请先登录后再操作')
      return false
    }

    loading.value = true
    error.value = null

    try {
      const result = await toggleObstacleSharing(id)

      // 更新本地数据
      const index = customObstacles.value.findIndex((o) => o.id === id)
      if (index >= 0) {
        customObstacles.value[index].isShared = result.is_shared

        // 更新本地存储
        const storageKey = getStorageKey()
        if (storageKey) {
          localStorage.setItem(storageKey, JSON.stringify(customObstacles.value))
        }

        ElMessage.success(result.is_shared ? '已共享此障碍物' : '已取消共享此障碍物')
        return true
      }
      return false
    } catch (e) {
      console.error('修改障碍物共享状态失败:', e)
      error.value = createErrorResponse(ErrorCode.TOGGLE_SHARING_FAILED, '操作失败，请重试')
      ElMessage.error('修改共享状态失败，请重试')
      return false
    } finally {
      loading.value = false
    }
  }

  const _sortedSharedObstacles = ref<CustomObstacleTemplate[]>([])
  const _sortedObstacles = ref<CustomObstacleTemplate[]>([])

  const isLoadingShared = computed(() => loadingShared.value)
  const hasSharedError = computed(() => sharedError.value !== null)

  function refreshSortedLists() {
    _sortedSharedObstacles.value = [...sharedObstacles.value].sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
    _sortedObstacles.value = [...customObstacles.value].sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
  }

  watch([customObstacles, sharedObstacles], () => {
    refreshSortedLists()
  }, { deep: true })

  const sortedSharedObstacles = computed(() => _sortedSharedObstacles.value)
  const sortedObstacles = computed(() => _sortedObstacles.value)

  // 监听用户登录状态变化
  if (import.meta.env.SSR === false) {
    // 在组件挂载时加载共享障碍物
    initSharedObstacles()
  }

  return {
    customObstacles,
    sharedObstacles,
    loading,
    loadingShared,
    error,
    sharedError,
    obstacleCountInfo,
    initObstacles,
    initSharedObstacles,
    saveCustomObstacle,
    removeCustomObstacle,
    getObstacleById,
    toggleSharing,
    clearError: () => {
      error.value = null
    },
    isLoading,
    hasError,
    isLoadingShared,
    hasSharedError,
    sortedObstacles,
    sortedSharedObstacles,
  }
})
