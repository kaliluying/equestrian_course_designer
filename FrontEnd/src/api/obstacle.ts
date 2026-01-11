import { request } from '@/utils/request'
import { cachedRequest, invalidateCache } from '@/utils/apiCache'
import { CUSTOM_OBSTACLE_API } from '@/config/api'

// 障碍物杆子数据接口定义
export interface ObstaclePole {
  x: number
  y: number
  length: number
  angle: number
  height?: number
  width?: number
  color?: string
  spacing?: number
  number?: string
  numberPosition?: {
    x: number
    y: number
  }
}

// 墙属性接口
export interface ApiWallProperties {
  height: number
  width: number
  color: string
  texture?: string
  [key: string]: unknown
}

// 利物浦属性接口
export interface ApiLiverpoolProperties {
  height: number
  width: number
  waterDepth: number
  waterColor: string
  hasRail?: boolean
  railHeight?: number
  [key: string]: unknown
}

// 水障属性接口
export interface ApiWaterProperties {
  width: number
  depth: number
  color: string
  borderColor?: string
  borderWidth?: number
  [key: string]: unknown
}

// 装饰物属性接口
export interface ApiDecorationProperties {
  category: string
  width: number
  height: number
  color: string
  secondaryColor?: string
  svgData?: string
  imageUrl?: string
  text?: string
  textColor?: string
  trunkHeight?: number
  trunkWidth?: number
  foliageRadius?: number
  borderColor?: string
  borderWidth?: number
  rotation?: number
  scale?: number
  showDirectionArrow?: boolean
  [key: string]: unknown
}

// 障碍物数据详情接口
export interface ObstacleDataDetails {
  type: string
  poles: ObstaclePole[]
  width: number
  height: number
  wallProperties?: ApiWallProperties
  liverpoolProperties?: ApiLiverpoolProperties
  waterProperties?: ApiWaterProperties
  decorationProperties?: ApiDecorationProperties
  [key: string]: unknown
}

// 障碍物数据结构
export interface ObstacleData {
  id?: number
  name: string
  obstacle_data: ObstacleDataDetails
  user?: number
  user_username?: string
  created_at?: string
  updated_at?: string
  is_shared?: boolean
}

// 障碍物数量和限制信息
export interface ObstacleCountInfo {
  count: number
  max_count: number
  is_premium: boolean
}

// 分页响应接口
export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

/**
 * 获取用户的自定义障碍物
 * @param params 查询参数，支持 search（搜索）、page（页码）、page_size（每页数量）、ordering（排序）
 * @returns Promise<PaginatedResponse<ObstacleData> | ObstacleData[]> 用户的自定义障碍物列表
 */
export const fetchUserObstacles = async (params?: {
  search?: string
  page?: number
  page_size?: number
  ordering?: string
}): Promise<PaginatedResponse<ObstacleData> | ObstacleData[]> => {
  const queryParams = new URLSearchParams()
  if (params?.search) {
    queryParams.append('search', params.search)
  }
  if (params?.page) {
    queryParams.append('page', params.page.toString())
  }
  if (params?.page_size) {
    queryParams.append('page_size', params.page_size.toString())
  }
  if (params?.ordering) {
    queryParams.append('ordering', params.ordering)
  }
  
  const url = queryParams.toString()
    ? `${CUSTOM_OBSTACLE_API.FETCH_USER_OBSTACLES}?${queryParams.toString()}`
    : CUSTOM_OBSTACLE_API.FETCH_USER_OBSTACLES
    
  return cachedRequest<PaginatedResponse<ObstacleData> | ObstacleData[]>(
    url,
    undefined,
    300000
  )
}

/**
 * 创建新的自定义障碍物
 * @param data 障碍物数据
 * @returns Promise<ObstacleData> 创建的障碍物数据
 */
export const createObstacle = async (data: ObstacleData): Promise<ObstacleData> => {
  const result = await request.post<ObstacleData>(CUSTOM_OBSTACLE_API.CREATE_OBSTACLE, data)
  invalidateCache()
  return result
}

/**
 * 更新指定ID的自定义障碍物
 * @param id 障碍物ID
 * @param data 障碍物数据
 * @returns Promise<ObstacleData> 更新后的障碍物数据
 */
export const updateObstacle = async (
  id: number | string,
  data: ObstacleData,
): Promise<ObstacleData> => {
  // 确保ID是有效的数字
  let numericId: number
  if (typeof id === 'string') {
    // 如果是纯数字字符串，直接转换
    if (/^\d+$/.test(id)) {
      numericId = parseInt(id)
    } else {
      // 尝试从字符串中提取数字部分
      const match = id.match(/\d+/)
      numericId = match ? parseInt(match[0]) : 0

    }
  } else {
    numericId = id
  }

  if (isNaN(numericId) || numericId <= 0) {
    throw new Error(`无效的障碍物ID: ${id}`)
  }

  
  return request.put<ObstacleData>(CUSTOM_OBSTACLE_API.UPDATE_OBSTACLE(numericId), data)
}

/**
 * 删除指定ID的自定义障碍物
 * @param id 障碍物ID
 * @returns Promise<void>
 */
export const deleteObstacle = async (id: number | string): Promise<void> => {
  let numericId: number
  if (typeof id === 'string') {
    if (/^\d+$/.test(id)) {
      numericId = parseInt(id)
    } else {
      const match = id.match(/\d+/)
      numericId = match ? parseInt(match[0]) : 0
    }
  } else {
    numericId = id
  }

  const result = await request.delete<void>(CUSTOM_OBSTACLE_API.DELETE_OBSTACLE(numericId))
  invalidateCache()
  return result
}

/**
 * 获取用户自定义障碍物数量和限制信息
 * @returns Promise<ObstacleCountInfo> 数量和限制信息
 */
export const getObstacleCountInfo = async (): Promise<ObstacleCountInfo> => {
  return cachedRequest<ObstacleCountInfo>(
    CUSTOM_OBSTACLE_API.GET_OBSTACLE_COUNT,
    undefined,
    300000
  )
}

/**
 * 获取共享的障碍物
 * @param params 查询参数，支持 search（搜索）、page（页码）、page_size（每页数量）、ordering（排序）
 * @returns Promise<PaginatedResponse<ObstacleData> | ObstacleData[]> 共享的障碍物列表
 */
export const getSharedObstacles = async (params?: {
  search?: string
  page?: number
  page_size?: number
  ordering?: string
}): Promise<PaginatedResponse<ObstacleData> | ObstacleData[]> => {
  const queryParams = new URLSearchParams()
  if (params?.search) {
    queryParams.append('search', params.search)
  }
  if (params?.page) {
    queryParams.append('page', params.page.toString())
  }
  if (params?.page_size) {
    queryParams.append('page_size', params.page_size.toString())
  }
  if (params?.ordering) {
    queryParams.append('ordering', params.ordering)
  }
  
  const url = queryParams.toString()
    ? `${CUSTOM_OBSTACLE_API.GET_SHARED_OBSTACLES}?${queryParams.toString()}`
    : CUSTOM_OBSTACLE_API.GET_SHARED_OBSTACLES
    
  return cachedRequest<PaginatedResponse<ObstacleData> | ObstacleData[]>(
    url,
    undefined,
    300000
  )
}

/**
 * 切换障碍物的共享状态
 * @param id 障碍物ID
 * @returns Promise<{id: number, name: string, is_shared: boolean}> 操作结果
 */
export const toggleObstacleSharing = async (
  id: number | string,
): Promise<{ id: number; name: string; is_shared: boolean }> => {
  return request.post<{ id: number; name: string; is_shared: boolean }>(
    CUSTOM_OBSTACLE_API.TOGGLE_SHARE(id),
  )
}
