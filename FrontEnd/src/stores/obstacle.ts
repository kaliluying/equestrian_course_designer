import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
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
  const error = ref<string | null>(null)
  // 共享障碍物错误信息
  const sharedError = ref<string | null>(null)
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
      console.log('用户未登录，不加载自定义障碍物')
      return
    }

    loading.value = true

    try {
      // 从服务器加载障碍物
      const obstacles = await fetchUserObstacles()
      customObstacles.value = obstacles.map(convertApiObstacleToTemplate)
      console.log(
        '已从服务器加载用户ID',
        userStore.currentUser?.id,
        '的自定义障碍物:',
        customObstacles.value.length,
        '个',
      )

      // 同时保存一份到本地存储（作为备份）
      const storageKey = getStorageKey()
      if (storageKey) {
        localStorage.setItem(storageKey, JSON.stringify(customObstacles.value))
      }

      // 获取障碍物数量限制信息
      try {
        obstacleCountInfo.value = await getObstacleCountInfo()
      } catch (countError) {
        console.error('获取障碍物数量限制信息失败:', countError)
      }
    } catch (e) {
      console.error('从服务器加载自定义障碍物失败:', e)
      error.value = '加载障碍物失败，请重试'

      // 尝试从本地存储加载（作为备份方案）
      const storageKey = getStorageKey()
      if (storageKey) {
        const savedObstacles = localStorage.getItem(storageKey)
        if (savedObstacles) {
          try {
            customObstacles.value = JSON.parse(savedObstacles)
            console.log('已从本地存储加载自定义障碍物作为备份')
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
  const saveCustomObstacle = async (obstacle: CustomObstacleTemplate) => {
    // 如果用户未登录，则不保存
    if (!userStore.isAuthenticated) {
      console.error('用户未登录，无法保存自定义障碍物')
      ElMessage.warning('请先登录后再创建或编辑自定义障碍物')
      return obstacle
    }

    loading.value = true
    error.value = null

    try {
      console.log('开始保存自定义障碍物, 原始ID:', obstacle.id)

      // 转换为API格式
      const apiObstacle = convertTemplateToApiObstacle(obstacle)
      console.log('转换后的API障碍物数据:', apiObstacle)

      let savedObstacle: ObstacleData

      // 通过API保存到服务器
      if (obstacle.id && obstacle.id !== 'new') {
        // 更新现有障碍物 - 直接传递ID，让API处理ID转换
        console.log('更新现有障碍物, ID:', obstacle.id)
        savedObstacle = await updateObstacle(obstacle.id, apiObstacle)
      } else {
        // 创建新障碍物
        console.log('创建新障碍物')
        savedObstacle = await createObstacle(apiObstacle)
      }

      console.log('服务器返回的障碍物数据:', savedObstacle)

      // 转换回模板格式
      const savedTemplate = convertApiObstacleToTemplate(savedObstacle)
      console.log('转换回模板格式后的障碍物:', savedTemplate)

      // 更新本地障碍物列表
      const index = customObstacles.value.findIndex((o) => o.id === savedTemplate.id)
      if (index >= 0) {
        // 更新现有障碍物
        customObstacles.value[index] = savedTemplate
        console.log('更新了列表中的障碍物, 索引:', index)
      } else {
        // 添加新障碍物
        customObstacles.value.push(savedTemplate)
        console.log('添加了新障碍物到列表')
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

      ElMessage.success(index >= 0 ? '障碍物已更新' : '障碍物已创建')
      return savedTemplate
    } catch (e) {
      console.error('保存自定义障碍物到服务器失败:', e)
      error.value = '保存障碍物失败，请重试'
      ElMessage.error('保存障碍物失败，请重试')
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
      error.value = '删除障碍物失败，请重试'
      ElMessage.error('删除障碍物失败，请重试')
      return false
    } finally {
      loading.value = false
    }
  }

  // 获取特定ID的障碍物
  const getObstacleById = (id: string) => {
    return customObstacles.value.find((o) => o.id === id)
  }

  // 按创建时间排序的障碍物（最新的在前面）
  const sortedObstacles = computed(() => {
    return [...customObstacles.value].sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
  })

  // 正在加载中的计算属性
  const isLoading = computed(() => loading.value)

  // 是否有错误的计算属性
  const hasError = computed(() => error.value !== null)

  // 初始化加载共享障碍物
  const initSharedObstacles = async () => {
    // 如果用户未登录，则不加载共享障碍物
    if (!userStore.isAuthenticated) {
      console.log('用户未登录，不加载共享障碍物')
      return
    }

    loadingShared.value = true
    sharedError.value = null

    try {
      // 从服务器加载共享障碍物
      const obstacles = await getSharedObstacles()
      sharedObstacles.value = obstacles.map(convertApiObstacleToTemplate)
      console.log('已从服务器加载共享障碍物:', sharedObstacles.value.length, '个')
    } catch (e) {
      console.error('从服务器加载共享障碍物失败:', e)
      sharedError.value = '加载共享障碍物失败，请重试'
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
      error.value = '操作失败，请重试'
      ElMessage.error('修改共享状态失败，请重试')
      return false
    } finally {
      loading.value = false
    }
  }

  // 按创建时间排序的共享障碍物（最新的在前面）
  const sortedSharedObstacles = computed(() => {
    return [...sharedObstacles.value].sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
  })

  // 共享障碍物加载状态
  const isLoadingShared = computed(() => loadingShared.value)

  // 共享障碍物是否有错误
  const hasSharedError = computed(() => sharedError.value !== null)

  // 监听用户登录状态变化
  if (import.meta.env.SSR === false) {
    // 在组件挂载时加载共享障碍物
    initSharedObstacles()
  }

  return {
    customObstacles,
    sortedObstacles,
    sharedObstacles,
    sortedSharedObstacles,
    saveCustomObstacle,
    removeCustomObstacle,
    getObstacleById,
    initObstacles,
    initSharedObstacles,
    toggleSharing,
    isLoading,
    isLoadingShared,
    hasError,
    hasSharedError,
    error,
    sharedError,
    obstacleCountInfo,
  }
})
