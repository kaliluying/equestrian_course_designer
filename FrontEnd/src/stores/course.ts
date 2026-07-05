/**
 * @file course.ts
 * @description 马术路线设计的状态管理模块
 * 使用 Pinia 管理整个应用的状态，包含课程设计、障碍物、路径等相关状态和操作
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { CourseDesign, Obstacle, PathPoint, CoursePath, Pole } from '@/types/obstacle'
import { ObstacleType } from '@/types/obstacle'
import { v4 as uuidv4 } from 'uuid'
import { useHistoryStore } from './history'
import type { RouteValidationIssue, RouteValidationResult } from '@/api/design'

/**
 * 马术路线设计状态管理
 * @description 使用 Pinia 管理整个应用的状态，包含课程设计、障碍物、路径等相关状态和操作
 */
export const useCourseStore = defineStore('course', () => {
  /**
   * 当前课程设计的状态
   * @description 包含课程ID、名称、障碍物列表、创建/更新时间、场地尺寸等
   */
  const currentCourse = ref<CourseDesign>({
    id: uuidv4(), // 生成唯一ID
    name: '马术路线设计', // 默认课程名称
    renderVersion: 'v2', // 新建设计默认使用SVG V2渲染
    obstacles: [], // 障碍物列表
    createdAt: new Date().toISOString(), // 创建时间
    updatedAt: new Date().toISOString(), // 更新时间
    fieldWidth: 90, // 场地宽度（米）
    fieldHeight: 60, // 场地高度（米）
    field: {
      widthMeters: 90,
      heightMeters: 60
    }
  })

  /**
   * 当前选中的障碍物
   * @description 用于UI交互，标识当前正在编辑的障碍物
   */
  const selectedObstacle = ref<Obstacle | null>(null)

  const routeValidationResult = ref<RouteValidationResult | null>(null)
  const highlightedValidationIssue = ref<RouteValidationIssue | null>(null)

  /**
   * 课程路径状态
   * @description 包含路径可见性和路径点列表
   */
  const coursePath = ref<CoursePath>({
    visible: false, // 路径是否可见
    points: [] as PathPoint[], // 路径点列表
  })

  /**
   * 路线的起点和终点状态
   * @description 包含位置坐标(x,y)和旋转角度
   */
  const startPoint = ref({ x: 0, y: 0, rotation: 270 }) // 起点状态
  const endPoint = ref({ x: 0, y: 0, rotation: 270 }) // 终点状态

  // 只读渲染版本标记：v2 使用 SVG 世界坐标渲染
  const isV2Design = computed(() => currentCourse.value.renderVersion === 'v2')


  function setValidationResult(result: RouteValidationResult | null) {
    routeValidationResult.value = result
    if (!result) {
      highlightedValidationIssue.value = null
    }
  }

  function highlightValidationIssue(issue: RouteValidationIssue) {
    highlightedValidationIssue.value = issue
    const firstId = issue.obstacle_ids[0]
    if (firstId) {
      selectedObstacle.value = currentCourse.value.obstacles.find((obstacle) => obstacle.id === firstId) || null
    }
  }

  function clearValidationHighlight() {
    highlightedValidationIssue.value = null
  }


  function applyRouteFix(updatedObstacles: unknown[], updatedPath?: Record<string, unknown> | null) {
    commitHistory()
    currentCourse.value.obstacles = JSON.parse(JSON.stringify(updatedObstacles)) as Obstacle[]

    if (updatedPath && typeof updatedPath === 'object') {
      const pathValue = updatedPath as {
        visible?: boolean
        points?: PathPoint[]
        startPoint?: { x: number; y: number; rotation: number }
        endPoint?: { x: number; y: number; rotation: number }
      }
      coursePath.value = {
        visible: pathValue.visible ?? coursePath.value.visible,
        points: pathValue.points ?? coursePath.value.points,
      }
      if (pathValue.startPoint) {
        startPoint.value = pathValue.startPoint
      }
      if (pathValue.endPoint) {
        endPoint.value = pathValue.endPoint
      }
    }

    selectedObstacle.value = null
    highlightedValidationIssue.value = null
    updateCourse()
    commitHistory()
  }

  /**
   * 初始化存储
   * @description 检查localStorage中是否存在自动保存的数据
   * @returns {boolean} 是否存在有效的自动保存数据
   */
  const initializeStore = () => {
    const savedCourse = localStorage.getItem('autosaved_course')
    const savedTimestamp = localStorage.getItem('autosaved_timestamp')

    if (savedCourse && savedTimestamp) {
      try {
        const parsedData = JSON.parse(savedCourse)
        if (parsedData && parsedData.id) {
          return true
        }
      } catch (error) {
        console.error('自动保存数据无效:', error)
        const keys = getAutosaveKeys()
        localStorage.removeItem(keys.courseKey)
        localStorage.removeItem(keys.timestampKey)
        localStorage.removeItem(keys.metaKey)
        localStorage.removeItem('autosaved_course')
        localStorage.removeItem('autosaved_timestamp')
      }
    }

    return false
  }

  // 在store创建时执行初始化
  initializeStore()

  /**
   * 更新起点旋转角度
   * @description 更新起点的旋转角度，并相应更新路径的控制点
   * @param {number} rotation - 新的旋转角度（度）
   */
  const updateStartRotation = (rotation: number) => {
    // 标准化当前角度到0-360度范围
    let currentRotation = startPoint.value.rotation % 360
    if (currentRotation < 0) currentRotation += 360

    // 标准化新角度到0-360度范围
    let newRotation = rotation % 360
    if (newRotation < 0) newRotation += 360

    // 处理特殊情况：如果新角度和当前角度在数学上相同（0度和360度），则不进行旋转
    if (
      (newRotation === 0 && currentRotation === 360) ||
      (newRotation === 360 && currentRotation === 0)
    ) {
      // 直接设置为新角度，不计算差值
      startPoint.value.rotation = newRotation
    } else {
      // 特殊处理0度和360度的情况
      if (newRotation === 0 && currentRotation > 180) {
        // 如果新角度是0度，而当前角度接近360度，则应该向下旋转到0度
        newRotation = 0
      } else if (newRotation === 360 && currentRotation < 180) {
        // 如果新角度是360度，而当前角度接近0度，则应该向上旋转到360度
        newRotation = 360
      }

      // 计算最短路径的角度差
      let diff = newRotation - currentRotation
      if (diff > 180) diff -= 360
      if (diff < -180) diff += 360

      // 更新旋转角度，保持连续性
      startPoint.value.rotation = currentRotation + diff
    }

    // 如果路径存在且可见，更新起点附近的控制点
    if (coursePath.value.visible && coursePath.value.points.length > 1) {
      const points = [...coursePath.value.points]
      const pathStartPoint = points[0]
      const nextPoint = points[1]

      // 计算新的控制点位置，基于旋转角度
      if (pathStartPoint && nextPoint && pathStartPoint.controlPoint2) {
        // 使用当前旋转角度计算控制点位置
        const angle = ((startPoint.value.rotation - 270) % 360) * (Math.PI / 180)
        const distance =
          Math.sqrt(
            Math.pow(nextPoint.x - pathStartPoint.x, 2) +
              Math.pow(nextPoint.y - pathStartPoint.y, 2),
          ) / 3

        // 更新起点的后控制点
        pathStartPoint.controlPoint2 = {
          x: pathStartPoint.x + Math.cos(angle) * distance,
          y: pathStartPoint.y + Math.sin(angle) * distance,
        }
        // 标记控制点为已手动移动
        pathStartPoint.isControlPoint2Moved = true

        coursePath.value.points = points
      }
    }

    updateCourse()
  }

  /**
   * 更新终点旋转角度
   * @description 更新终点的旋转角度，并相应更新路径的控制点
   * @param {number} rotation - 新的旋转角度（度）
   */
  const updateEndRotation = (rotation: number) => {
    // 标准化当前角度到0-360度范围
    let currentRotation = endPoint.value.rotation % 360
    if (currentRotation < 0) currentRotation += 360

    // 标准化新角度到0-360度范围
    let newRotation = rotation % 360
    if (newRotation < 0) newRotation += 360

    // 处理特殊情况：如果新角度和当前角度在数学上相同（0度和360度），则不进行旋转
    if (
      (newRotation === 0 && currentRotation === 360) ||
      (newRotation === 360 && currentRotation === 0)
    ) {
      // 直接设置为新角度，不计算差值
      endPoint.value.rotation = newRotation
    } else {
      // 特殊处理0度和360度的情况
      if (newRotation === 0 && currentRotation > 180) {
        // 如果新角度是0度，而当前角度接近360度，则应该向下旋转到0度
        newRotation = 0
      } else if (newRotation === 360 && currentRotation < 180) {
        // 如果新角度是360度，而当前角度接近0度，则应该向上旋转到360度
        newRotation = 360
      }

      // 计算最短路径的角度差
      let diff = newRotation - currentRotation
      if (diff > 180) diff -= 360
      if (diff < -180) diff += 360

      // 更新旋转角度，保持连续性
      endPoint.value.rotation = currentRotation + diff
    }

    // 如果路径存在且可见，更新终点附近的控制点
    if (coursePath.value.visible && coursePath.value.points.length > 1) {
      const points = [...coursePath.value.points]
      const lastIndex = points.length - 1
      const pathEndPoint = points[lastIndex]
      const prevPoint = points[lastIndex - 1]

      // 计算新的控制点位置，基于旋转角度
      if (pathEndPoint && prevPoint && pathEndPoint.controlPoint1) {
        // 使用当前旋转角度计算控制点位置
        const angle = ((endPoint.value.rotation - 90) % 360) * (Math.PI / 180)
        const distance =
          Math.sqrt(
            Math.pow(prevPoint.x - pathEndPoint.x, 2) + Math.pow(prevPoint.y - pathEndPoint.y, 2),
          ) / 3

        // 更新终点的前控制点
        pathEndPoint.controlPoint1 = {
          x: pathEndPoint.x + Math.cos(angle) * distance,
          y: pathEndPoint.y + Math.sin(angle) * distance,
        }
        // 标记控制点为已手动移动
        pathEndPoint.isControlPoint1Moved = true

        coursePath.value.points = points
      }
    }

    updateCourse()
  }

  /**
   * 提交快照至历史记录
   */
  function commitHistory() {
    const historyStore = useHistoryStore()
    const snapshot = JSON.stringify({
      obstacles: currentCourse.value.obstacles,
      path: coursePath.value,
      startPoint: startPoint.value,
      endPoint: endPoint.value
    })
    historyStore.commit(snapshot)
  }

  /**
   * 从历史记录中恢复快照
   */
  function hydrateFromSnapshot(snapshot: string | null) {
    if (!snapshot) return
    try {
      const state = JSON.parse(snapshot)
      // 使用普通对象赋值触发 Vue 深层响应式更新
      currentCourse.value.obstacles = state.obstacles
      coursePath.value = state.path
      startPoint.value = state.startPoint
      endPoint.value = state.endPoint
      selectedObstacle.value = null
      updateCourse()
    } catch (e) {
      console.error('Failed to restore history snapshot:', e)
    }
  }

  /**
   * 更新起点位置
   * @description 更新起点位置并相应更新路径的起点及其控制点
   * @param {Object} position - 新的位置坐标 {x, y}
   */
  const updateStartPoint = (position: { x: number; y: number }) => {
    // 更新起点位置
    startPoint.value.x = position.x
    startPoint.value.y = position.y

    // 如果路径存在且可见，更新路径的起点位置
    if (coursePath.value.visible && coursePath.value.points.length > 0) {
      // 创建新的点数组以触发响应式更新
      const newPoints = [...coursePath.value.points]

      // 更新起点位置（第一个点）
      if (newPoints.length > 0) {
        const startPathPoint = newPoints[0]
        const oldStartX = startPathPoint.x
        const oldStartY = startPathPoint.y

        // 更新起点坐标
        startPathPoint.x = position.x
        startPathPoint.y = position.y

        // 处理控制点2（起点只有后控制点）
        if (startPathPoint.controlPoint2) {
          if (startPathPoint.isControlPoint2Moved) {
            // 如果控制点已被手动移动过，保持相对位置
            const dx = startPathPoint.x - oldStartX
            const dy = startPathPoint.y - oldStartY
            startPathPoint.controlPoint2.x += dx
            startPathPoint.controlPoint2.y += dy
          } else {
            // 如果控制点未被移动过，根据旋转角度重新计算位置
            const nextPoint = newPoints[1]
            if (nextPoint) {
              const angle = (startPoint.value.rotation - 270) * (Math.PI / 180)
              const distance =
                Math.sqrt(
                  Math.pow(nextPoint.x - startPathPoint.x, 2) +
                    Math.pow(nextPoint.y - startPathPoint.y, 2),
                ) / 3
              startPathPoint.controlPoint2 = {
                x: startPathPoint.x + Math.cos(angle) * distance,
                y: startPathPoint.y + Math.sin(angle) * distance,
              }
            }
          }
        }

        // 更新整个点数组以确保视图更新
        coursePath.value = {
          ...coursePath.value,
          points: newPoints,
        }
      }
    }

    updateCourse()
  }

  /**
   * 更新终点位置
   * @param position 新的位置坐标 {x, y}
   * 更新终点位置并相应更新路径的终点及其控制点
   */
  const updateEndPoint = (position: { x: number; y: number }) => {
    // 更新终点位置
    endPoint.value.x = position.x
    endPoint.value.y = position.y

    // 如果路径存在且可见，更新路径的终点位置
    if (coursePath.value.visible && coursePath.value.points.length > 0) {
      // 创建新的点数组以触发响应式更新
      const newPoints = [...coursePath.value.points]

      // 更新终点位置（最后一个点）
      if (newPoints.length > 0) {
        const lastIndex = newPoints.length - 1
        const endPathPoint = newPoints[lastIndex]
        const oldEndX = endPathPoint.x
        const oldEndY = endPathPoint.y

        // 更新终点坐标
        endPathPoint.x = position.x
        endPathPoint.y = position.y

        // 处理控制点1（终点只有前控制点）
        if (endPathPoint.controlPoint1) {
          if (endPathPoint.isControlPoint1Moved) {
            // 如果控制点已被手动移动过，保持相对位置
            const dx = endPathPoint.x - oldEndX
            const dy = endPathPoint.y - oldEndY
            endPathPoint.controlPoint1.x += dx
            endPathPoint.controlPoint1.y += dy
          } else {
            // 如果控制点未被移动过，根据旋转角度重新计算位置
            const prevPoint = newPoints[lastIndex - 1]
            if (prevPoint) {
              const angle = (endPoint.value.rotation - 90) * (Math.PI / 180)
              const distance =
                Math.sqrt(
                  Math.pow(prevPoint.x - endPathPoint.x, 2) +
                    Math.pow(prevPoint.y - endPathPoint.y, 2),
                ) / 3
              endPathPoint.controlPoint1 = {
                x: endPathPoint.x + Math.cos(angle) * distance,
                y: endPathPoint.y + Math.sin(angle) * distance,
              }
            }
          }
        }

        // 更新整个点数组以确保视图更新
        coursePath.value = {
          ...coursePath.value,
          points: newPoints,
        }
      }
    }

    updateCourse()
  }

  /**
   * 自动生成路线
   * @description 根据当前场地中的障碍物自动生成一条合理的路线
   * 包括设置起点、终点位置和生成贝塞尔曲线控制点
   */
  const generatePath = (resetStartEndPoints = false) => {
    // 获取当前课程中的障碍物列表
    const obstacles = currentCourse.value.obstacles
    // 如果没有障碍物，则不生成路径
    if (obstacles.length === 0) return

    // 过滤出非装饰物类型的障碍物
    let nonDecorationObstacles = obstacles.filter(
      (obstacle) => obstacle.type !== ObstacleType.DECORATION,
    )

    // 根据障碍物编号排序（如果有编号）
    nonDecorationObstacles = nonDecorationObstacles.sort((a, b) => {
      // 如果两个障碍物都有编号，按编号排序
      if (a.number && b.number) {
        const numA = parseInt(a.number)
        const numB = parseInt(b.number)
        // 确保编号是有效的数字
        if (!isNaN(numA) && !isNaN(numB)) {
          return numA - numB
        }
      }
      // 如果只有一个障碍物有编号，将有编号的排在前面
      if (a.number && !b.number) return -1
      if (!a.number && b.number) return 1
      // 如果都没有编号，保持原始顺序
      return 0
    })

    // 如果没有非装饰物类型的障碍物，则不生成路径
    if (nonDecorationObstacles.length === 0) return

    // 仅在首次生成或显式要求重算时重置起终点
    if (resetStartEndPoints || !coursePath.value.points.length) {
      // 获取第一个和最后一个非装饰物障碍物
      const firstObstacle = nonDecorationObstacles[0]
      const lastObstacle = nonDecorationObstacles[nonDecorationObstacles.length - 1]

      // 计算第一个障碍物的中心点
      const firstCenter = getObstacleCenter(firstObstacle)
      const firstObstacleLength = getObstaclePathLength(firstObstacle)

      // 计算最后一个障碍物的中心点
      const lastCenter = getObstacleCenter(lastObstacle)
      const lastObstacleLength = getObstaclePathLength(lastObstacle)

      // 起点位于第一个障碍物进障侧 6 米
      const startAngle = (firstObstacle.rotation - 270) * (Math.PI / 180)
      const startDistanceMeters = firstObstacleLength / 2 + 6
      startPoint.value = {
        x: firstCenter.x - Math.cos(startAngle) * startDistanceMeters,
        y: firstCenter.y - Math.sin(startAngle) * startDistanceMeters,
        rotation: firstObstacle.rotation,
      }

      // 终点位于最后一个障碍物出障侧 6 米
      const endAngle = (lastObstacle.rotation - 270) * (Math.PI / 180)
      const endDistanceMeters = lastObstacleLength / 2 + 6
      endPoint.value = {
        x: lastCenter.x + Math.cos(endAngle) * endDistanceMeters,
        y: lastCenter.y + Math.sin(endAngle) * endDistanceMeters,
        rotation: lastObstacle.rotation,
      }
    }

    // 初始化路径点数组
    const points: PathPoint[] = []

    // 添加起点
    points.push({
      x: startPoint.value.x,
      y: startPoint.value.y,
    })

    // 为每个非装饰物障碍物生成路径点
    nonDecorationObstacles.forEach((obstacle) => {
      const center = getObstacleCenter(obstacle)
      // 计算障碍物的角度（弧度），减去270度是为了调整角度方向
      const angle = (obstacle.rotation - 270) * (Math.PI / 180)
      // 距离使用米为单位
      const approachDistance = 1
      const departDistance = 1
      // 计算障碍物的总长度（包括横杆间距）
      const totalLength = getObstaclePathLength(obstacle)
      // 添加障碍物前的连接点
      points.push({
        x: center.x - Math.cos(angle) * (approachDistance + totalLength / 2),
        y: center.y - Math.sin(angle) * (approachDistance + totalLength / 2),
      })

      // 添加接近直线的起点
      points.push({
        x: center.x - Math.cos(angle) * (approachDistance - 0.5 + totalLength / 2),
        y: center.y - Math.sin(angle) * (approachDistance - 0.5 + totalLength / 2),
      })

      // 添加障碍物中心点
      points.push({
        x: center.x,
        y: center.y,
      })

      // 添加离开直线的终点
      points.push({
        x: center.x + Math.cos(angle) * (departDistance - 0.5 + totalLength / 2),
        y: center.y + Math.sin(angle) * (departDistance - 0.5 + totalLength / 2),
      })

      // 添加障碍物后的连接点
      points.push({
        x: center.x + Math.cos(angle) * (departDistance + totalLength / 2),
        y: center.y + Math.sin(angle) * (departDistance + totalLength / 2),
      })
    })

    // 添加终点
    points.push({
      x: endPoint.value.x,
      y: endPoint.value.y,
    })

    // 为每个点生成控制点
    // 核心原则：障碍物内部是直线，障碍物之间（连接点到连接点）才需要贝塞尔曲线
    for (let i = 0; i < points.length; i++) {
      const current = points[i]
      const prev = points[i - 1]
      const next = points[i + 1]

      // 计算当前点在序列中的位置
      const isStartPoint = i === 0
      const isEndPoint = i === points.length - 1

      // 计算当前点属于哪个障碍物（如果有）
      // 每个障碍物有5个点：0=连接点前, 1=直线起点, 2=中心点, 3=直线终点, 4=连接点后
      const pointIndexInObstacle = (i - 1) % 5

      // 判断是否是障碍物内部的直线段点（点1、2、3）
      const isObstacleInternalPoint = pointIndexInObstacle >= 1 && pointIndexInObstacle <= 3

      // 判断是否是连接点（障碍物前后的连接点，点0和点4）
      const isConnectionPoint = pointIndexInObstacle === 0 || pointIndexInObstacle === 4

      // 如果是起点，生成后控制点
      if (isStartPoint && next) {
        const angle = Math.atan2(next.y - current.y, next.x - current.x)
        const distance =
          Math.sqrt(Math.pow(next.x - current.x, 2) + Math.pow(next.y - current.y, 2)) / 3
        current.controlPoint1 = undefined
        current.controlPoint2 = {
          x: current.x + Math.cos(angle) * distance,
          y: current.y + Math.sin(angle) * distance,
        }
        continue
      }

      // 如果是终点，生成前控制点
      if (isEndPoint && prev) {
        const angle = Math.atan2(prev.y - current.y, prev.x - current.x)
        const distance =
          Math.sqrt(Math.pow(prev.x - current.x, 2) + Math.pow(prev.y - current.y, 2)) / 3
        current.controlPoint1 = {
          x: current.x + Math.cos(angle) * distance,
          y: current.y + Math.sin(angle) * distance,
        }
        current.controlPoint2 = undefined
        continue
      }

      // 障碍物内部的直线段点：不设置任何控制点，使用直线连接
      if (isObstacleInternalPoint) {
        current.controlPoint1 = undefined
        current.controlPoint2 = undefined
        continue
      }

      // 连接点（障碍物前后）的处理
      if (isConnectionPoint) {
        if (pointIndexInObstacle === 0) {
          // 障碍物前的连接点
          // controlPoint1: 从前一个点过来的控制点
          if (prev) {
            const angleToPrev = Math.atan2(prev.y - current.y, prev.x - current.x)
            const distToPrev = Math.sqrt(
              Math.pow(prev.x - current.x, 2) + Math.pow(prev.y - current.y, 2)
            )
            current.controlPoint1 = {
              x: current.x + Math.cos(angleToPrev) * (distToPrev / 3),
              y: current.y + Math.sin(angleToPrev) * (distToPrev / 3),
            }
          }
          current.controlPoint2 = undefined
        } else {
          // pointIndexInObstacle === 4，障碍物后的连接点
          current.controlPoint1 = undefined
          // controlPoint2: 去往下一个点的控制点
          if (next) {
            const angleToNext = Math.atan2(next.y - current.y, next.x - current.x)
            const distToNext = Math.sqrt(
              Math.pow(next.x - current.x, 2) + Math.pow(next.y - current.y, 2)
            )
            current.controlPoint2 = {
              x: current.x + Math.cos(angleToNext) * (distToNext / 3),
              y: current.y + Math.sin(angleToNext) * (distToNext / 3),
            }
          }
        }
        continue
      }
    }
    // 更新课程路径的点数组
    coursePath.value.points = points
    updateCourse()
  }

  /**
   * 计算每米对应的像素数
   * @description 根据当前画布尺寸计算比例，使用宽高中较小的比例保持宽高比
   * @returns {number} 每米对应的像素数
   */
  const meterScale = computed(() => {
    const canvas = document.querySelector('.course-canvas')
    if (!canvas) return 20
    const rect = (canvas as HTMLElement).getBoundingClientRect()
    const scaleByWidth = rect.width / currentCourse.value.fieldWidth
    const scaleByHeight = rect.height / currentCourse.value.fieldHeight
    return Math.min(scaleByWidth, scaleByHeight)
  })

  /**
   * 获取世界坐标与屏幕坐标转换信息
   * @description 为V2渲染提供统一坐标转换能力，避免与设备视口耦合
   */
  const getWorldTransform = (rect?: DOMRect | null) => {
    const fieldWidth = currentCourse.value.fieldWidth
    const fieldHeight = currentCourse.value.fieldHeight

    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return {
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        fieldWidth,
        fieldHeight
      }
    }

    const scale = Math.min(rect.width / fieldWidth, rect.height / fieldHeight)
    const offsetX = (rect.width - fieldWidth * scale) / 2
    const offsetY = (rect.height - fieldHeight * scale) / 2

    return {
      scale,
      offsetX,
      offsetY,
      fieldWidth,
      fieldHeight
    }
  }

  /**
   * 计算障碍物的中心点坐标
   * @description 根据障碍物类型和属性计算其中心点位置
   * @param {Obstacle} obstacle - 障碍物对象
   * @returns {{x: number, y: number}} 障碍物的中心点坐标
   */
  const getObstacleCenter = (obstacle: Obstacle) => {
    let width = 0
    let height = 0

    // 根据障碍物类型获取相应宽度和高度
    if (obstacle.type === ObstacleType.WATER && obstacle.waterProperties) {
      // 水障类型：使用水障的专有属性计算
      width = obstacle.waterProperties.width
      height = obstacle.waterProperties.depth
    } else if (obstacle.type === ObstacleType.LIVERPOOL && obstacle.liverpoolProperties) {
      // 利物浦类型：使用利物浦的专有属性计算
      width = obstacle.liverpoolProperties.width || obstacle.poles[0]?.width || 0
      height =
        obstacle.liverpoolProperties.waterDepth +
        (obstacle.liverpoolProperties.hasRail ? obstacle.poles[0]?.height || 0 : 0)
    } else if (obstacle.type === ObstacleType.WALL && obstacle.wallProperties) {
      // 砖墙类型：使用砖墙的专有属性计算
      width = obstacle.wallProperties.width
      height = obstacle.wallProperties.height
    } else {
      // 其他类型：使用横杆计算
      width = obstacle.poles[0]?.width ?? 0
      height = obstacle.poles.reduce(
        (sum, pole) => sum + (pole.height ?? 0) + (pole.spacing ?? 0),
        0,
      )
    }

    // CSS中障碍物有padding: 20px，需要将像素偏移转换为米
    const paddingPixels = 20
    const scale = meterScale.value
    const paddingMeters = paddingPixels / scale

    // 计算障碍物中心：宽高的一半 + padding偏移（米）
    const centerX = width / 2 + paddingMeters
    const centerY = height / 2 + paddingMeters

    return {
      x: obstacle.position.x + centerX,
      y: obstacle.position.y + centerY,
    }
  }

  /**
   * 更新控制点位置
   * @description 更新路径上指定点的控制点位置
   * @param {number} pointIndex - 路径点索引
   * @param {1 | 2} controlPointNumber - 控制点编号（1或2）
   * @param {{x: number, y: number}} position - 新的位置坐标
   */
  const updateControlPoint = (
    pointIndex: number,
    controlPointNumber: 1 | 2,
    position: { x: number; y: number },
  ) => {
    if (pointIndex >= 0 && pointIndex < coursePath.value.points.length) {
      const newPoints = [...coursePath.value.points]
      const point = newPoints[pointIndex]

      if (controlPointNumber === 1) {
        point.controlPoint1 = position
        point.isControlPoint1Moved = true // 标记控制点1已被手动移动
      } else {
        point.controlPoint2 = position
        point.isControlPoint2Moved = true // 标记控制点2已被手动移动
      }

      coursePath.value = {
        ...coursePath.value,
        points: newPoints,
      }
    }
  }

  /**
   * 切换路线可见性
   * @description 切换路线的显示/隐藏状态
   * @param {boolean} [visible] - 可选参数，指定是否可见。如果不提供，则切换当前状态
   */
  const togglePathVisibility = (visible?: boolean) => {
    const newVisible = visible ?? !coursePath.value.visible
    coursePath.value.visible = newVisible
  }

  /**
   * 添加新的障碍物
   * @description 向课程中添加新的障碍物，并根据需要更新路径
   * @param {Omit<Obstacle, 'id'>} obstacle - 障碍物对象（不包含id）
   * @returns {Obstacle} 添加后的完整障碍物对象
   */
  function addObstacle(obstacle: Omit<Obstacle, 'id'>) {
    const newObstacle = {
      ...obstacle,
      id: uuidv4(),
    }

    // 如果是非装饰物类型且没有编号，自动添加默认编号
    if (obstacle.type !== ObstacleType.DECORATION && !obstacle.number) {
      // 获取当前非装饰物的数量，用于生成新编号
      const nonDecorationObstacles = currentCourse.value.obstacles.filter(
        (obs) => obs.type !== ObstacleType.DECORATION,
      )

      // 查找当前最大编号
      let maxNumber = 0
      nonDecorationObstacles.forEach((obs) => {
        if (obs.number && /^\d+$/.test(obs.number)) {
          const num = parseInt(obs.number)
          if (!isNaN(num) && num > maxNumber) {
            maxNumber = num
          }
        }
      })

      // 新编号为当前最大编号+1
      newObstacle.number = String(maxNumber + 1)
      if (newObstacle.poles && newObstacle.poles.length > 0) {
        newObstacle.poles[0].number = newObstacle.number
        newObstacle.poles[0].numberPosition = { x: 0, y: -3 }
      }
    }

    currentCourse.value.obstacles.push(newObstacle)

    // 如果路径可见，则更新路径
    if (coursePath.value.visible) {
      if (coursePath.value.points.length <= 2) {
        // 如果路径点不足，重新生成整个路径
        generatePath()
      } else {
        // 否则，只为新障碍物添加路径点
        appendObstacleToPath(newObstacle)
      }
    }

    updateCourse()
    return newObstacle
  }

  /**
   * 使用指定ID添加新的障碍物
   * @description 向课程中添加带有指定ID的障碍物，用于协作模式下保持ID一致
   * @param {Obstacle} obstacle - 完整的障碍物对象（包含id）
   * @returns {Obstacle} 添加后的障碍物对象
   */
  function addObstacleWithId(obstacle: Obstacle) {
    // 直接使用提供的障碍物对象（包含ID）
    const newObstacle = { ...obstacle }

    // 如果是非装饰物类型且没有编号，自动添加默认编号
    if (obstacle.type !== ObstacleType.DECORATION && !obstacle.number) {
      // 获取当前非装饰物的数量，用于生成新编号
      const nonDecorationObstacles = currentCourse.value.obstacles.filter(
        (obs) => obs.type !== ObstacleType.DECORATION,
      )

      // 查找当前最大编号
      let maxNumber = 0
      nonDecorationObstacles.forEach((obs) => {
        if (obs.number && /^\d+$/.test(obs.number)) {
          const num = parseInt(obs.number)
          if (!isNaN(num) && num > maxNumber) {
            maxNumber = num
          }
        }
      })

      // 新编号为当前最大编号+1
      newObstacle.number = String(maxNumber + 1)
      if (newObstacle.poles && newObstacle.poles.length > 0) {
        newObstacle.poles[0].number = newObstacle.number
        newObstacle.poles[0].numberPosition = { x: 0, y: -3 }
      }
    }

    // 添加到障碍物列表
    currentCourse.value.obstacles.push(newObstacle)

    // 如果路径可见，则更新路径
    if (coursePath.value.visible) {
      if (coursePath.value.points.length <= 2) {
        // 如果路径点不足，重新生成整个路径
        generatePath()
      } else {
        // 否则，只为新障碍物添加路径点
        appendObstacleToPath(newObstacle)
      }
    }

    updateCourse()
    return newObstacle
  }

  /**
   * 为新添加的障碍物追加路径点
   * @description 在现有路径中为新添加的障碍物生成相应的路径点
   * @param {Obstacle} obstacle - 新添加的障碍物对象
   */
  function appendObstacleToPath(obstacle: Obstacle) {
    // 如果是装饰物类型，不添加到路径中
    if (obstacle.type === ObstacleType.DECORATION) return

    // 确保路径点存在
    if (coursePath.value.points.length === 0) {
      generatePath()
      return
    }

    // 获取当前路径点数组
    const points = [...coursePath.value.points]

    // 获取终点（最后一个点）
    const endPoint = points.pop()
    if (!endPoint) {
      generatePath()
      return
    }

    // 获取障碍物中心点和角度
    const center = getObstacleCenter(obstacle)
    const angle = (obstacle.rotation - 270) * (Math.PI / 180)

    // 距离使用米为单位
    const approachDistance = 1
    const departDistance = 1

    // 计算障碍物的总长度（包括横杆间距）
    let totalLength = 0
    if (obstacle.type === ObstacleType.DOUBLE && obstacle.poles.length > 1) {
      // 双横杆障碍物：计算横杆长度加上间距
      totalLength =
        obstacle.poles[0].height + (obstacle.poles[0].spacing || 0) + obstacle.poles[1].height
    } else if (obstacle.type === ObstacleType.LIVERPOOL && obstacle.liverpoolProperties) {
      // 利物浦障碍物：使用水障宽度
      totalLength = obstacle.liverpoolProperties.height
    } else if (obstacle.type === ObstacleType.WALL && obstacle.wallProperties) {
      // 砖墙障碍物：使用墙的宽度
      totalLength = obstacle.wallProperties.height
    } else if (obstacle.type === ObstacleType.COMBINATION) {
      // 组合障碍物：使用组合障碍物的宽度
      for (const pole of obstacle.poles) {
        totalLength += pole.height + (pole.spacing || 0)
      }
    } else {
      // 单横杆障碍物：使用横杆宽度
      totalLength = obstacle.poles[0]?.height || 0
    }

    // 创建障碍物的5个点
    // 第1个点：障碍物前的连接点
    // 这个点用于连接前一个障碍物，可以通过控制点调整曲线形状
    const point1: PathPoint = {
      x: center.x - Math.cos(angle) * (approachDistance + totalLength / 2),
      y: center.y - Math.sin(angle) * (approachDistance + totalLength / 2),
    }

    // 第2个点：接近直线的起点，位于障碍物前方3米处
    // 从这个点到障碍物中心是一条3米长的直线，确保马匹有直线接近障碍物
    const point2: PathPoint = {
      x: center.x - Math.cos(angle) * (approachDistance + totalLength / 2),
      y: center.y - Math.sin(angle) * (approachDistance + totalLength / 2),
    }

    // 第3个点：障碍物中心点
    // 这是障碍物的中心位置，马匹需要跳过的实际点
    const point3: PathPoint = {
      x: center.x,
      y: center.y,
    }

    // 第4个点：离开直线的终点，位于障碍物后方3米处
    // 从障碍物中心到这个点是一条3米长的直线，确保马匹有直线离开障碍物
    const point4: PathPoint = {
      x: center.x + Math.cos(angle) * (departDistance + totalLength / 2),
      y: center.y + Math.sin(angle) * (departDistance + totalLength / 2),
    }

    // 第5个点：障碍物后的连接点，位于障碍物后方3米
    // 这个点用于连接下一个障碍物，可以通过控制点调整曲线形状
    const point5: PathPoint = {
      x: center.x + Math.cos(angle) * (departDistance + totalLength / 2),
      y: center.y + Math.sin(angle) * (departDistance + totalLength / 2),
    }

    // 为连接点添加控制点
    const prevPoint = points[points.length - 1]
    if (prevPoint) {
      // 为前一个点添加后控制点（如果是连接点）
      const prevPointIndex = points.length - 1
      const isPrevConnectionPoint = prevPointIndex === 0 || (prevPointIndex - 1) % 5 === 4

      if (isPrevConnectionPoint) {
        const angleToNext = Math.atan2(point1.y - prevPoint.y, point1.x - prevPoint.x)
        const distanceToNext =
          Math.sqrt(Math.pow(point1.x - prevPoint.x, 2) + Math.pow(point1.y - prevPoint.y, 2)) / 3
        prevPoint.controlPoint2 = {
          x: prevPoint.x + Math.cos(angleToNext) * distanceToNext,
          y: prevPoint.y + Math.sin(angleToNext) * distanceToNext,
        }
      }

      // 为新障碍物的第一个连接点添加控制点
      const angleToPrev = Math.atan2(prevPoint.y - point1.y, prevPoint.x - point1.x)
      const distanceToPrev =
        Math.sqrt(Math.pow(prevPoint.x - point1.x, 2) + Math.pow(prevPoint.y - point1.y, 2)) / 3
      point1.controlPoint1 = {
        x: point1.x + Math.cos(angleToPrev) * distanceToPrev,
        y: point1.y + Math.sin(angleToPrev) * distanceToPrev,
      }
    }
    // point1 的 controlPoint2 指向直线起点
    const angleToPoint2 = Math.atan2(point2.y - point1.y, point2.x - point1.x)
    const segLen1 = Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2))
    point1.controlPoint2 = {
      x: point1.x + Math.cos(angleToPoint2) * Math.min(segLen1 * 0.05, 1),
      y: point1.y + Math.sin(angleToPoint2) * Math.min(segLen1 * 0.05, 1),
    }

    // point5 的 controlPoint1 指向直线终点
    const angleFromPoint4 = Math.atan2(point4.y - point5.y, point4.x - point5.x)
    const segLen5 = Math.sqrt(Math.pow(point4.x - point5.x, 2) + Math.pow(point4.y - point5.y, 2))
    point5.controlPoint1 = {
      x: point5.x + Math.cos(angleFromPoint4) * Math.min(segLen5 * 0.05, 1),
      y: point5.y + Math.sin(angleFromPoint4) * Math.min(segLen5 * 0.05, 1),
    }

    // 为新障碍物的最后一个连接点添加后控制点
    const angleToEnd = Math.atan2(endPoint.y - point5.y, endPoint.x - point5.x)
    const distanceToEnd =
      Math.sqrt(Math.pow(endPoint.x - point5.x, 2) + Math.pow(endPoint.y - point5.y, 2)) / 3
    point5.controlPoint2 = {
      x: point5.x + Math.cos(angleToEnd) * distanceToEnd,
      y: point5.y + Math.sin(angleToEnd) * distanceToEnd,
    }

    // 为终点添加前控制点
    const endAngle = Math.atan2(point5.y - endPoint.y, point5.x - endPoint.x)
    const endDistance =
      Math.sqrt(Math.pow(point5.x - endPoint.x, 2) + Math.pow(point5.y - endPoint.y, 2)) / 3
    endPoint.controlPoint1 = {
      x: endPoint.x + Math.cos(endAngle) * endDistance,
      y: endPoint.y + Math.sin(endAngle) * endDistance,
    }

    // 将新点添加到路径中
    points.push(point1, point2, point3, point4, point5, endPoint)

    // 更新路径点数组
    coursePath.value.points = points
  }

  /**
   * 更新障碍物属性
   * @description 更新指定障碍物的属性，并根据需要更新相关路径
   * @param {string} obstacleId - 要更新的障碍物ID
   * @param {Partial<Obstacle>} updates - 要更新的属性对象
   * @param {boolean} sendUpdate - 是否发送更新消息到协作者，默认为 true
   */
  function updateObstacle(obstacleId: string, updates: Partial<Obstacle>, sendUpdate = true) {
    const index = currentCourse.value.obstacles.findIndex((o) => o.id === obstacleId)
    if (index !== -1) {
      const obstacle = currentCourse.value.obstacles[index]

      // 检查是否从其他类型变为装饰物类型
      const isChangingToDecoration =
        updates.type === ObstacleType.DECORATION && obstacle.type !== ObstacleType.DECORATION

      // 检查是否从装饰物类型变为其他类型
      const isChangingFromDecoration =
        updates.type !== undefined &&
        updates.type !== ObstacleType.DECORATION &&
        obstacle.type === ObstacleType.DECORATION

      // 更新障碍物
      currentCourse.value.obstacles[index] = {
        ...obstacle,
        ...updates,
      }

      if (selectedObstacle.value?.id === obstacleId) {
        selectedObstacle.value = currentCourse.value.obstacles[index]
      }

      // 更新路径
      if (coursePath.value.visible && coursePath.value.points.length > 0) {
        if (isChangingToDecoration || isChangingFromDecoration) {
          // 如果类型改变涉及装饰物，重新生成整个路径
          generatePath()
        } else if (
          (updates.position || updates.rotation !== undefined) &&
          currentCourse.value.obstacles[index].type !== ObstacleType.DECORATION
        ) {
          // 只有当位置或旋转发生变化且不是装饰物类型时才更新路径
          updatePathForObstacle(index, currentCourse.value.obstacles[index])
        }
      }

      updateCourse()

      // 完全禁用自动触发事件，避免循环更新
      // 注释掉原有代码，不再自动触发事件
      /*
      if (sendUpdate && typeof window !== 'undefined') {
        // 检查是否存在协作功能
        // 从 localStorage 中获取协作状态
        const isCollaborating = localStorage.getItem('isCollaborating') === 'true'
        if (isCollaborating) {
          try {
            // 尝试获取 sendObstacleUpdate 函数
            const event = new CustomEvent('obstacle-updated', {
              detail: {
                obstacleId,
                updates,
              },
            })
            document.dispatchEvent(event)
            console.log('已触发障碍物更新事件:', obstacleId, updates)
          } catch (error) {
            console.error('发送障碍物更新消息失败:', error)
          }
        }
      }
      */
    }
  }

  /**
   * 为单个障碍物更新路径点
   * @description 更新指定障碍物相关的路径点，同时保留控制点信息
   * @param {number} obstacleIndex - 障碍物在数组中的索引
   * @param {Obstacle} obstacle - 障碍物对象
   */
  function updatePathForObstacle(obstacleIndex: number, obstacle: Obstacle) {
    // 如果是装饰物类型，不处理
    if (obstacle.type === ObstacleType.DECORATION) return

    // 确保路径点存在
    if (coursePath.value.points.length === 0) {
      generatePath()
      return
    }

    const points = [...coursePath.value.points]

    // 计算障碍物在路径点数组中的起始索引
    // 首先要计算这个障碍物前面有多少个非装饰物
    const nonDecorationObstaclesBefore = currentCourse.value.obstacles
      .slice(0, obstacleIndex)
      .filter((o) => o.type !== ObstacleType.DECORATION).length

    // 起点(1) + 非装饰物障碍物数量 * 每个障碍物的点数(5)
    const startIndex = 1 + nonDecorationObstaclesBefore * 5

    // 确保索引有效（需要 startIndex 到 startIndex+4 共5个点）
    if (startIndex + 4 >= points.length) {
      console.warn(
        `路径点数组长度(${points.length})不足，无法为障碍物${obstacleIndex}更新路径点（需要索引${startIndex}到${startIndex + 4}）`
      )
      return
    }

    // 获取障碍物中心点和角度
    const center = getObstacleCenter(obstacle)
    const angle = (obstacle.rotation - 270) * (Math.PI / 180)

    // 距离使用米为单位
    const approachDistance = 1
    const departDistance = 1

    // 计算障碍物的总长度（包括横杆间距）
    let totalLength = 0
    if (obstacle.type === ObstacleType.DOUBLE && obstacle.poles.length > 1) {
      // 双横杆障碍物：计算横杆长度加上间距
      totalLength =
        obstacle.poles[0].height + (obstacle.poles[0].spacing || 0) + obstacle.poles[1].height
    } else if (obstacle.type === ObstacleType.LIVERPOOL && obstacle.liverpoolProperties) {
      // 利物浦障碍物：使用水障宽度
      totalLength = obstacle.liverpoolProperties.height
    } else if (obstacle.type === ObstacleType.WALL && obstacle.wallProperties) {
      // 砖墙障碍物：使用墙的宽度
      totalLength = obstacle.wallProperties.height
    } else if (obstacle.type === ObstacleType.COMBINATION) {
      // 组合障碍物：使用组合障碍物的宽度
      for (const pole of obstacle.poles) {
        totalLength += pole.height + (pole.spacing || 0)
      }
    } else {
      // 单横杆障碍物：使用横杆宽度
      totalLength = obstacle.poles[0]?.height || 0
    }

    // 更新障碍物的5个点，但保留控制点

    // 1. 障碍物前的连接点（可调节点）
    const point1 = points[startIndex]
    const oldX1 = point1.x
    const oldY1 = point1.y
    point1.x = center.x - Math.cos(angle) * (approachDistance + totalLength / 2)
    point1.y = center.y - Math.sin(angle) * (approachDistance + totalLength / 2)

    // 2. 接近直线的起点
    const point2 = points[startIndex + 1]
    point2.x = center.x - Math.cos(angle) * (approachDistance + totalLength / 2)
    point2.y = center.y - Math.sin(angle) * (approachDistance + totalLength / 2)

    // 3. 障碍物中心点
    const point3 = points[startIndex + 2]
    point3.x = center.x
    point3.y = center.y

    // 4. 离开直线的终点
    const point4 = points[startIndex + 3]
    point4.x = center.x + Math.cos(angle) * (departDistance + totalLength / 2)
    point4.y = center.y + Math.sin(angle) * (departDistance + totalLength / 2)

    // 5. 障碍物后的连接点（可调节点）
    const point5 = points[startIndex + 4]
    const oldX5 = point5.x
    const oldY5 = point5.y
    point5.x = center.x + Math.cos(angle) * (departDistance + totalLength / 2)
    point5.y = center.y + Math.sin(angle) * (departDistance + totalLength / 2)

    // 处理连接点的控制点
    // 对于连接点1（障碍物前的连接点）
    if (point1.controlPoint1) {
      if (point1.isControlPoint1Moved) {
        // 如果控制点1已被移动过，保持相对位置
        const dx = point1.x - oldX1
        const dy = point1.y - oldY1
        point1.controlPoint1.x += dx
        point1.controlPoint1.y += dy
      } else {
        // 如果控制点1未被移动过，重新计算位置
        const prevPoint = points[startIndex - 1]
        if (prevPoint) {
          const angleToPoint = Math.atan2(prevPoint.y - point1.y, prevPoint.x - point1.x)
          const distance =
            Math.sqrt(Math.pow(prevPoint.x - point1.x, 2) + Math.pow(prevPoint.y - point1.y, 2)) / 3
          point1.controlPoint1 = {
            x: point1.x + Math.cos(angleToPoint) * distance,
            y: point1.y + Math.sin(angleToPoint) * distance,
          }
        }
      }
    }

    if (point1.controlPoint2) {
      if (point1.isControlPoint2Moved) {
        // 如果控制点2已被移动过，保持相对位置
        const dx = point1.x - oldX1
        const dy = point1.y - oldY1
        point1.controlPoint2.x += dx
        point1.controlPoint2.y += dy
      } else {
        // 如果控制点2未被移动过，重新计算位置
        const nextPoint = points[startIndex + 1]
        if (nextPoint) {
          const angleToPoint = Math.atan2(nextPoint.y - point1.y, nextPoint.x - point1.x)
          const distance =
            Math.sqrt(Math.pow(nextPoint.x - point1.x, 2) + Math.pow(nextPoint.y - point1.y, 2)) / 3
          point1.controlPoint2 = {
            x: point1.x + Math.cos(angleToPoint) * distance,
            y: point1.y + Math.sin(angleToPoint) * distance,
          }
        }
      }
    }

    // 对于连接点5（障碍物后的连接点）
    if (point5.controlPoint1) {
      if (point5.isControlPoint1Moved) {
        // 如果控制点1已被移动过，保持相对位置
        const dx = point5.x - oldX5
        const dy = point5.y - oldY5
        point5.controlPoint1.x += dx
        point5.controlPoint1.y += dy
      } else {
        // 如果控制点1未被移动过，重新计算位置
        const prevPoint = points[startIndex + 3]
        if (prevPoint) {
          const angleToPoint = Math.atan2(prevPoint.y - point5.y, prevPoint.x - point5.x)
          const distance =
            Math.sqrt(Math.pow(prevPoint.x - point5.x, 2) + Math.pow(prevPoint.y - point5.y, 2)) / 3
          point5.controlPoint1 = {
            x: point5.x + Math.cos(angleToPoint) * distance,
            y: point5.y + Math.sin(angleToPoint) * distance,
          }
        }
      }
    }

    if (point5.controlPoint2) {
      if (point5.isControlPoint2Moved) {
        // 如果控制点2已被移动过，保持相对位置
        const dx = point5.x - oldX5
        const dy = point5.y - oldY5
        point5.controlPoint2.x += dx
        point5.controlPoint2.y += dy
      } else {
        // 如果控制点2未被移动过，重新计算位置
        const nextPoint = points[startIndex + 5]
        if (nextPoint) {
          const angleToPoint = Math.atan2(nextPoint.y - point5.y, nextPoint.x - point5.x)
          const distance =
            Math.sqrt(Math.pow(nextPoint.x - point5.x, 2) + Math.pow(nextPoint.y - point5.y, 2)) / 3
          point5.controlPoint2 = {
            x: point5.x + Math.cos(angleToPoint) * distance,
            y: point5.y + Math.sin(angleToPoint) * distance,
          }
        }
      }
    }

    // 更新路径点数组
    coursePath.value.points = points
  }

  /**
   * 删除指定的障碍物
   * @description 从课程中删除指定的障碍物，并更新相关路径
   * @param {string} obstacleId - 要删除的障碍物ID
   */
  function removeObstacle(obstacleId: string) {
    const obstacleIndex = currentCourse.value.obstacles.findIndex((o) => o.id === obstacleId)
    if (obstacleIndex === -1) return

    const obstacle = currentCourse.value.obstacles[obstacleIndex]

    // 如果路径可见，且不是装饰物类型，则需要更新路径点
    if (
      coursePath.value.visible &&
      coursePath.value.points.length > 0 &&
      obstacle.type !== ObstacleType.DECORATION
    ) {
      // 计算障碍物在路径点数组中的起始索引
      const nonDecorationObstaclesBefore = currentCourse.value.obstacles
        .slice(0, obstacleIndex)
        .filter((o) => o.type !== ObstacleType.DECORATION).length

      const startIndex = 1 + nonDecorationObstaclesBefore * 5

      // 确保索引有效
      if (startIndex < coursePath.value.points.length - 1) {
        // 创建新的点数组，移除该障碍物的5个点
        const newPoints = [...coursePath.value.points]
        newPoints.splice(startIndex, 5)
        coursePath.value.points = newPoints
      }
    }

    // 从障碍物数组中移除该障碍物
    currentCourse.value.obstacles = currentCourse.value.obstacles.filter((o) => o.id !== obstacleId)

    // 如果路径可见但点数组为空或只有起点和终点，重新生成路径
    if (coursePath.value.visible && coursePath.value.points.length <= 2) {
      const hasNonDecorationObstacles = currentCourse.value.obstacles.some(
        (o) => o.type !== ObstacleType.DECORATION,
      )

      if (hasNonDecorationObstacles) {
        generatePath()
      } else {
        clearPath()
      }
    }

    updateCourse()
  }

  /**
   * 获取包含完整路径信息的课程设计
   * @description 整合coursePath、startPoint和endPoint到CourseDesign对象的path字段
   * @returns {CourseDesign} 包含路径数据的完整课程设计
   */
  function getCompleteDesign(): CourseDesign {
    const design = { ...currentCourse.value }

    // 如果路径可见且有路径点，整合路径数据
    if (coursePath.value.visible && coursePath.value.points.length > 0) {
      design.path = {
        visible: coursePath.value.visible,
        points: coursePath.value.points,
        startPoint: {
          x: startPoint.value.x,
          y: startPoint.value.y,
          rotation: startPoint.value.rotation
        },
        endPoint: {
          x: endPoint.value.x,
          y: endPoint.value.y,
          rotation: endPoint.value.rotation
        }
      }
    } else {
      design.path = undefined
    }

    return design
  }

  /**
   * 更新课程信息
   * @description 更新最后修改时间并触发自动保存，同时同步路径数据到currentCourse
   */
  function updateCourse() {
    if (!currentCourse.value.renderVersion) {
      currentCourse.value.renderVersion = 'v1'
    }

    if (currentCourse.value.renderVersion === 'v2') {
      currentCourse.value.field = {
        widthMeters: currentCourse.value.fieldWidth,
        heightMeters: currentCourse.value.fieldHeight
      }
    }

    // 获取当前画布元素和视口信息
    const canvasElement = document.querySelector('.course-canvas')
    const viewportInfo = {
      width: window.innerWidth, // 当前视口宽度
      height: window.innerHeight, // 当前视口高度
      canvasWidth: canvasElement
        ? canvasElement.getBoundingClientRect().width
        : currentCourse.value.viewportInfo?.canvasWidth || 800, // 当前画布宽度，如果获取不到则使用已有的或默认值
      canvasHeight: canvasElement
        ? canvasElement.getBoundingClientRect().height
        : currentCourse.value.viewportInfo?.canvasHeight || 600, // 当前画布高度，如果获取不到则使用已有的或默认值
      aspectRatio: currentCourse.value.fieldWidth / currentCourse.value.fieldHeight, // 场地宽高比
      devicePixelRatio: window.devicePixelRatio || 1, // 设备像素比
    }

    // 更新课程状态中的视口信息
    currentCourse.value.viewportInfo = viewportInfo

    // 同步路径数据到currentCourse.path
    if (coursePath.value.visible && coursePath.value.points.length > 0) {
      currentCourse.value.path = {
        visible: coursePath.value.visible,
        points: coursePath.value.points,
        startPoint: {
          x: startPoint.value.x,
          y: startPoint.value.y,
          rotation: startPoint.value.rotation
        },
        endPoint: {
          x: endPoint.value.x,
          y: endPoint.value.y,
          rotation: endPoint.value.rotation
        }
      }
    } else {
      currentCourse.value.path = undefined
    }

    // 更新最后修改时间
    currentCourse.value.updatedAt = new Date().toISOString()
    // 调用自动保存，现在会包含最新的视口信息和路径数据
    saveToLocalStorage()
  }

  let autosaveTimeout: ReturnType<typeof setTimeout> | null = null
  const AUTOSAVE_DELAY = 1000
  const AUTOSAVE_SCHEMA_VERSION = 2

  function getCurrentAutosaveIdentity() {
    const rawUser = localStorage.getItem('user')
    let userId = 'anonymous'
    try {
      const parsed = rawUser ? JSON.parse(rawUser) : null
      userId = parsed?.id ? String(parsed.id) : 'anonymous'
    } catch {
      userId = 'anonymous'
    }

    const persistedDesignId = localStorage.getItem('design_id_to_update')
    const designId = persistedDesignId || currentCourse.value.id || 'draft'
    return { userId, designId: String(designId) }
  }

  function getAutosaveKeys() {
    const { userId, designId } = getCurrentAutosaveIdentity()
    const prefix = `autosaved_course:${userId}:${designId}`
    return {
      courseKey: `${prefix}:course`,
      timestampKey: `${prefix}:timestamp`,
      metaKey: `${prefix}:meta`,
    }
  }

  function readAutosaveDraft() {
    const keys = getAutosaveKeys()
    const bucketCourse = localStorage.getItem(keys.courseKey)
    const bucketTimestamp = localStorage.getItem(keys.timestampKey)
    if (bucketCourse && bucketTimestamp) {
      return { savedCourse: bucketCourse, savedTimestamp: bucketTimestamp, keys }
    }

    return {
      savedCourse: localStorage.getItem('autosaved_course'),
      savedTimestamp: localStorage.getItem('autosaved_timestamp'),
      keys,
    }
  }

  function saveToLocalStorage() {
    if (autosaveTimeout) {
      clearTimeout(autosaveTimeout)
    }

    autosaveTimeout = setTimeout(() => {
      try {
        if (
          currentCourse.value.obstacles.length === 0 &&
          (!coursePath.value.visible || coursePath.value.points.length === 0)
        ) {
          return
        }

        const courseDataToSave = {
          ...currentCourse.value,
          path: {
            visible: coursePath.value.visible,
            points: coursePath.value.points,
            startPoint: startPoint.value,
            endPoint: endPoint.value,
          },
        }

        const keys = getAutosaveKeys()
        const savedAt = new Date().toISOString()
        const payload = JSON.stringify(courseDataToSave)
        localStorage.setItem(keys.courseKey, payload)
        localStorage.setItem(keys.timestampKey, savedAt)
        localStorage.setItem(keys.metaKey, JSON.stringify({
          user_id: getCurrentAutosaveIdentity().userId,
          design_id: getCurrentAutosaveIdentity().designId,
          course_id: currentCourse.value.id,
          saved_at: savedAt,
          dirty: true,
          schema_version: AUTOSAVE_SCHEMA_VERSION,
        }))
        // 保留旧 key 兼容已有恢复流程和旧版本用户
        localStorage.setItem('autosaved_course', payload)
        localStorage.setItem('autosaved_timestamp', savedAt)
      } catch (error) {
        console.error('自动保存到localStorage失败:', error)
      }
    }, AUTOSAVE_DELAY)
  }

  /**
   * 从localStorage恢复数据
   * @description 尝试从本地存储中恢复之前保存的课程设计数据
   * @param {boolean} skipIfViaLink - 如果是通过邀请链接打开，是否跳过恢复本地保存的设计
   * @returns {boolean} 是否成功恢复数据
   */
  function restoreFromLocalStorage(skipIfViaLink: boolean = false): boolean {
    try {
      // 检查是否通过邀请链接打开
      if (skipIfViaLink) {
        // 检查是否有待处理的协作
        const pendingCollabStr = localStorage.getItem('pendingCollaboration')
        if (pendingCollabStr) {
          try {
            const pendingCollab = JSON.parse(pendingCollabStr)
            // 检查是否通过链接加入
            if (pendingCollab.viaLink) {
              console.log('通过邀请链接打开，跳过恢复本地保存的设计')
              return false
            }
          } catch (error) {
            console.error('解析待处理的协作数据失败:', error)
          }
        }
      }

      const { savedCourse, savedTimestamp } = readAutosaveDraft()

      if (!savedCourse || !savedTimestamp) {
        return false
      }

      try {
        const parsedData = JSON.parse(savedCourse)

        if (!parsedData || !parsedData.id || !Array.isArray(parsedData.obstacles)) {
          console.error('自动保存的数据格式无效')
          return false
        }

        const canvas = document.querySelector('.course-canvas')
        const canvasElement = canvas instanceof HTMLElement ? canvas : null
        const currentViewport = {
          width: window.innerWidth,
          height: window.innerHeight,
          canvasWidth: canvasElement ? canvasElement.clientWidth : 800,
          canvasHeight: canvasElement ? canvasElement.clientHeight : 600,
          aspectRatio: (parsedData.fieldWidth || 80) / (parsedData.fieldHeight || 60),
          devicePixelRatio: window.devicePixelRatio || 1,
        }

        const restoredObstacles = JSON.parse(JSON.stringify(parsedData.obstacles)) as Obstacle[]
        const restoredPath = parsedData.path
          ? JSON.parse(JSON.stringify(parsedData.path))
          : null

        currentCourse.value = {
          ...parsedData,
          renderVersion: parsedData.renderVersion ?? 'v1',
          field: parsedData.renderVersion === 'v2'
            ? {
                widthMeters: parsedData.fieldWidth || 80,
                heightMeters: parsedData.fieldHeight || 60
              }
            : undefined,
          obstacles: restoredObstacles,
          viewportInfo: currentViewport,
          updatedAt: new Date().toISOString(),
        }

        selectedObstacle.value = null

        if (restoredPath) {
          coursePath.value = {
            visible: restoredPath.visible ?? false,
            points: restoredPath.points ?? [],
          }

          startPoint.value = restoredPath.startPoint
            ? {
                x: restoredPath.startPoint.x,
                y: restoredPath.startPoint.y,
                rotation: restoredPath.startPoint.rotation,
              }
            : { x: 0, y: 0, rotation: 270 }

          endPoint.value = restoredPath.endPoint
            ? {
                x: restoredPath.endPoint.x,
                y: restoredPath.endPoint.y,
                rotation: restoredPath.endPoint.rotation,
              }
            : { x: 0, y: 0, rotation: 270 }
        } else {
          coursePath.value = {
            visible: false,
            points: [],
          }
          startPoint.value = { x: 0, y: 0, rotation: 270 }
          endPoint.value = { x: 0, y: 0, rotation: 270 }
        }

        return true
      } catch (error) {
        console.error('解析本地存储的JSON数据失败:', error)
        const keys = getAutosaveKeys()
        localStorage.removeItem(keys.courseKey)
        localStorage.removeItem(keys.timestampKey)
        localStorage.removeItem(keys.metaKey)
        localStorage.removeItem('autosaved_course')
        localStorage.removeItem('autosaved_timestamp')
        return false
      }
    } catch (error) {
      console.error('从localStorage恢复失败:', error)
      return false
    }
  }

  /**
   * 清除localStorage中的自动保存数据
   * @description 删除本地存储中的自动保存数据
   */
  function clearAutosave() {
    const keys = getAutosaveKeys()
    localStorage.removeItem(keys.courseKey)
    localStorage.removeItem(keys.timestampKey)
    localStorage.removeItem(keys.metaKey)
    localStorage.removeItem('autosaved_course')
    localStorage.removeItem('autosaved_timestamp')
  }

  /**
   * 保存课程设计到文件
   * @description 将当前课程设计导出为JSON文件，包含完整的路径信息
   */
  function saveCourse() {
    // 获取当前画布元素
    const canvasElement = document.querySelector('.course-canvas')
    const viewportInfo = {
      width: window.innerWidth,
      height: window.innerHeight,
      canvasWidth: canvasElement ? canvasElement.getBoundingClientRect().width : 800,
      canvasHeight: canvasElement ? canvasElement.getBoundingClientRect().height : 600,
      aspectRatio: currentCourse.value.fieldWidth / currentCourse.value.fieldHeight,
      devicePixelRatio: window.devicePixelRatio,
    }

    // 更新课程中的视口信息
    currentCourse.value.viewportInfo = viewportInfo

    updateCourse()
    // 创建包含路线信息的完整数据对象
    const courseDataWithPath = {
      ...currentCourse.value,
      path: {
        visible: coursePath.value.visible,
        points: coursePath.value.points,
        startPoint: startPoint.value,
        endPoint: endPoint.value,
      },
    }

    const courseData = JSON.stringify(courseDataWithPath, null, 2)
    const blob = new Blob([courseData], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    // 生成带时间戳的文件名
    const date = new Date()
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')

    const formattedDateTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    link.href = url
    link.download = `${currentCourse.value.name}-${formattedDateTime}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    // 保存成功后清除自动保存数据
    clearAutosave()
  }

  /**
   * 从文件加载课程设计
   * @description 从JSON文件中加载课程设计数据
   * @param {File} file - 要加载的JSON文件
   * @throws {Error} 如果文件格式错误
   */
  async function loadCourse(file: File) {
    try {
      const text = await file.text()
      const parsedData = JSON.parse(text)

      let courseData: CourseDesign

      if (parsedData.courseDesign) {
        console.log('检测到新格式JSON（包含courseDesign字段）')
        courseData = parsedData.courseDesign
      } else if (parsedData.id && parsedData.obstacles) {
        console.log('检测到旧格式JSON（直接CourseDesign对象）')
        courseData = parsedData
      } else {
        throw new Error('无法识别的JSON文件格式。请确保文件是有效的课程设计文件。')
      }

      if (!courseData.id || !Array.isArray(courseData.obstacles)) {
        throw new Error('文件格式错误：缺少必需的字段（id或obstacles）')
      }

      const canvasElement = document.querySelector('.course-canvas')
      const canvasRect = canvasElement instanceof HTMLElement
        ? canvasElement.getBoundingClientRect()
        : null

      const currentViewport = {
        width: window.innerWidth,
        height: window.innerHeight,
        canvasWidth: canvasRect ? canvasRect.width : 800,
        canvasHeight: canvasRect ? canvasRect.height : 600,
        aspectRatio: (courseData.fieldWidth || 80) / (courseData.fieldHeight || 60),
        devicePixelRatio: window.devicePixelRatio || 1,
      }

      const restoredObstacles = JSON.parse(JSON.stringify(courseData.obstacles)) as Obstacle[]
      const restoredPath = courseData.path
        ? JSON.parse(JSON.stringify(courseData.path))
        : null

      currentCourse.value = {
        id: courseData.id,
        name: courseData.name,
        renderVersion: courseData.renderVersion ?? 'v1',
        obstacles: restoredObstacles,
        createdAt: courseData.createdAt,
        updatedAt: courseData.updatedAt,
        fieldWidth: courseData.fieldWidth,
        fieldHeight: courseData.fieldHeight,
        field: courseData.renderVersion === 'v2'
          ? {
              widthMeters: courseData.fieldWidth,
              heightMeters: courseData.fieldHeight
            }
          : undefined,
        viewportInfo: currentViewport,
      }

      selectedObstacle.value = null

      if (restoredPath) {
        coursePath.value = {
          visible: restoredPath.visible ?? false,
          points: restoredPath.points ?? [],
        }

        startPoint.value = restoredPath.startPoint
          ? {
              x: restoredPath.startPoint.x,
              y: restoredPath.startPoint.y,
              rotation: restoredPath.startPoint.rotation,
            }
          : { x: 0, y: 0, rotation: 270 }

        endPoint.value = restoredPath.endPoint
          ? {
              x: restoredPath.endPoint.x,
              y: restoredPath.endPoint.y,
              rotation: restoredPath.endPoint.rotation,
            }
          : { x: 0, y: 0, rotation: 270 }
      } else {
        coursePath.value = {
          visible: false,
          points: [],
        }
        startPoint.value = { x: 0, y: 0, rotation: 270 }
        endPoint.value = { x: 0, y: 0, rotation: 270 }
      }

      updateCourse()
      return true
    } catch (error) {
      console.error('加载课程设计失败:', error)
      throw new Error('文件格式错误')
    }
  }

  /**
   * 更新场地尺寸
   * @param width 场地宽度（米）
   * @param height 场地高度（米）
   */
  function updateFieldSize(width: number, height: number) {
    currentCourse.value.fieldWidth = width
    currentCourse.value.fieldHeight = height
    updateCourse()
  }

  /**
   * 清除路径
   * 重置路径相关的所有状态
   */
  function clearPath() {
    coursePath.value.visible = false
    coursePath.value.points = []
    resetStartEndPoints()
  }

  /**
   * 重置起终点位置
   * 将起终点位置重置为初始状态
   */
  function resetStartEndPoints() {
    startPoint.value = {
      x: 0,
      y: 0,
      rotation: 0,
    }
    endPoint.value = {
      x: 0,
      y: 0,
      rotation: 0,
    }
  }

  /**
   * 更新课程名称
   * @param name 新的课程名称
   */
  function updateCourseName(name: string) {
    currentCourse.value.name = name
    updateCourse()
  }

  /**
   * 导出当前课程设计
   * @description 导出当前课程设计的完整数据，包括路径信息
   * @returns {CourseDesign} 当前课程设计的完整数据
   */
  const exportCourse = (): CourseDesign => {
    // 获取当前视口和画布尺寸信息
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const canvas = document.querySelector('.course-canvas') as HTMLElement
    const canvasRect = canvas ? canvas.getBoundingClientRect() : null

    const exportData: CourseDesign = {
      id: currentCourse.value.id,
      name: currentCourse.value.name,
      renderVersion: currentCourse.value.renderVersion ?? 'v1',
      obstacles: [...currentCourse.value.obstacles],
      createdAt: currentCourse.value.createdAt,
      updatedAt: new Date().toISOString(),
      fieldWidth: currentCourse.value.fieldWidth,
      fieldHeight: currentCourse.value.fieldHeight,
      field: currentCourse.value.renderVersion === 'v2'
        ? {
            widthMeters: currentCourse.value.fieldWidth,
            heightMeters: currentCourse.value.fieldHeight
          }
        : undefined,
      // 添加屏幕和画布信息用于自适应
      viewportInfo: {
        width: viewportWidth,
        height: viewportHeight,
        canvasWidth: canvasRect ? canvasRect.width : 0,
        canvasHeight: canvasRect ? canvasRect.height : 0,
        aspectRatio: currentCourse.value.fieldWidth / currentCourse.value.fieldHeight,
        devicePixelRatio: window.devicePixelRatio || 1, // 添加设备像素比信息
      },
    }

    if (coursePath.value.visible && coursePath.value.points.length > 0) {
      exportData.path = {
        visible: coursePath.value.visible,
        points: [...coursePath.value.points],
        startPoint: {
          x: startPoint.value.x,
          y: startPoint.value.y,
          rotation: startPoint.value.rotation,
        },
        endPoint: {
          x: endPoint.value.x,
          y: endPoint.value.y,
          rotation: endPoint.value.rotation,
        },
      }
    }

    return exportData
  }

  /**
   * 从协作会话中导入课程数据
   * @description 从其他用户的协作会话中导入课程设计数据
   * @param {CourseDesign} course - 要导入的课程设计数据
   */
  function importCourse(course: CourseDesign) {
    console.log('开始导入课程数据:', course)
    const currentId = currentCourse.value.id

    const canvasElement = document.querySelector('.course-canvas')
    const canvasRect = canvasElement instanceof HTMLElement
      ? canvasElement.getBoundingClientRect()
      : null

    const currentViewportInfo = {
      width: window.innerWidth,
      height: window.innerHeight,
      canvasWidth: canvasRect ? canvasRect.width : 800,
      canvasHeight: canvasRect ? canvasRect.height : 600,
      aspectRatio: course.fieldWidth / course.fieldHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
    }

    currentCourse.value = {
      ...course,
      renderVersion: course.renderVersion ?? 'v1',
      field: course.renderVersion === 'v2'
        ? {
            widthMeters: course.fieldWidth,
            heightMeters: course.fieldHeight
          }
        : undefined,
      obstacles: JSON.parse(JSON.stringify(course.obstacles)) as Obstacle[],
      id: currentId,
      updatedAt: new Date().toISOString(),
      viewportInfo: currentViewportInfo,
    }

    selectedObstacle.value = null

    if (course.path) {
      console.log('导入路径数据:', course.path)
      const restoredPath = JSON.parse(JSON.stringify(course.path))

      coursePath.value = {
        visible: restoredPath.visible ?? false,
        points: restoredPath.points ?? [],
      }

      startPoint.value = restoredPath.startPoint
        ? {
            x: restoredPath.startPoint.x,
            y: restoredPath.startPoint.y,
            rotation: restoredPath.startPoint.rotation || 270,
          }
        : { x: 0, y: 0, rotation: 270 }

      endPoint.value = restoredPath.endPoint
        ? {
            x: restoredPath.endPoint.x,
            y: restoredPath.endPoint.y,
            rotation: restoredPath.endPoint.rotation || 270,
          }
        : { x: 0, y: 0, rotation: 270 }

      console.log('路径数据导入完成:', {
        coursePath: coursePath.value,
        startPoint: startPoint.value,
        endPoint: endPoint.value,
      })
    } else {
      console.log('没有路径数据需要导入')
      coursePath.value = {
        visible: false,
        points: [],
      }
      startPoint.value = { x: 0, y: 0, rotation: 270 }
      endPoint.value = { x: 0, y: 0, rotation: 270 }
    }

    updateCourse()
  }

  const getObstaclePathLength = (obstacle: Obstacle) => {
    if (obstacle.type === ObstacleType.DOUBLE && obstacle.poles.length > 1) {
      return obstacle.poles[0].height + (obstacle.poles[0].spacing || 0) + obstacle.poles[1].height
    }

    if (obstacle.type === ObstacleType.LIVERPOOL && obstacle.liverpoolProperties) {
      return obstacle.liverpoolProperties.height
    }

    if (obstacle.type === ObstacleType.WALL && obstacle.wallProperties) {
      return obstacle.wallProperties.height
    }

    if (obstacle.type === ObstacleType.COMBINATION) {
      return obstacle.poles.reduce((sum, pole) => sum + pole.height + (pole.spacing || 0), 0)
    }

    return obstacle.poles[0]?.height || 0
  }

  /**
   * 设置当前课程ID
   * @description 更新当前课程的唯一标识符
   * @param {string} id - 新的课程ID
   */
  const setCurrentCourseId = (id: string) => {
    if (id) {
      currentCourse.value.id = id || uuidv4()
    }
  }

  /**
   * 重置课程状态
   * @description 将所有状态恢复到初始值，清除所有已有的设计数据
   */
  function resetCourse() {
    // 重置课程状态为初始状态
    currentCourse.value = {
      id: uuidv4(),
      name: '马术路线设计',
      renderVersion: 'v2',
      obstacles: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fieldWidth: 80,
      fieldHeight: 60,
      field: {
        widthMeters: 80,
        heightMeters: 60
      },
    }

    // 清除选中的障碍物
    selectedObstacle.value = null

    // 清除路径
    coursePath.value = {
      visible: false,
      points: [] as PathPoint[],
    }

    // 重置起终点
    resetStartEndPoints()
  }

  /**
   * 导入AI生成的路线设计
   * @param aiResult AI生成的设计结果
   */
  function importAIResult(aiResult: {
    obstacles: Array<{
      id: string
      type: string | ObstacleType
      position: { x: number; y: number }
      rotation: number
      number: string
      poles: Array<{ height: number; width: number; color: string }>
      wallProperties?: Obstacle['wallProperties']
      liverpoolProperties?: Obstacle['liverpoolProperties']
      waterProperties?: Obstacle['waterProperties']
    }>
    path: {
      visible: boolean
      points: Array<{
        x: number
        y: number
        controlPoint1?: { x: number; y: number }
        controlPoint2?: { x: number; y: number }
        isControlPoint1Moved?: boolean
        isControlPoint2Moved?: boolean
      }>
      startPoint?: { x: number; y: number; rotation: number }
      endPoint?: { x: number; y: number; rotation: number }
    }
  }) {
    if (!aiResult.obstacles || aiResult.obstacles.length === 0) {
      console.error('AI生成结果无效：没有障碍物数据')
      return false
    }

    // 默认障碍物属性
    const defaultPole = { height: 1.4, width: 3.5, color: '#8B4513' }
    const defaultPosition = { x: 10, y: 10 }
    const normalizeObstacleType = (type: string | ObstacleType): ObstacleType => {
      return Object.values(ObstacleType).includes(type as ObstacleType)
        ? type as ObstacleType
        : ObstacleType.SINGLE
    }

    // 应用障碍物 - 重新生成ID避免冲突
    currentCourse.value.obstacles = aiResult.obstacles.map((obs): Obstacle => ({
      id: uuidv4(),
      type: normalizeObstacleType(obs.type || ObstacleType.SINGLE),
      position: obs.position || defaultPosition,
      rotation: obs.rotation || 0,
      number: obs.number || '1',
      poles: obs.poles || [defaultPole],
      wallProperties: obs.wallProperties,
      liverpoolProperties: obs.liverpoolProperties,
      waterProperties: obs.waterProperties
    }))

    // 应用路径
    if (aiResult.path && aiResult.path.visible) {
      coursePath.value.visible = true

      // 检查路径点数量是否足够
      const nonDecorationCount = aiResult.obstacles.filter(
        (o) => o.type !== 'decoration' && o.type !== 'DECORATION'
      ).length
      const requiredPoints = 1 + nonDecorationCount * 5

      if (aiResult.path.points && aiResult.path.points.length >= requiredPoints) {
        // 仅保留 AI 实际返回的控制点，避免为直线路径凭空创建可拖拽手柄
        coursePath.value.points = aiResult.path.points.map((point) => ({
          x: point.x,
          y: point.y,
          controlPoint1: point.controlPoint1,
          controlPoint2: point.controlPoint2,
          isControlPoint1Moved: point.isControlPoint1Moved ?? false,
          isControlPoint2Moved: point.isControlPoint2Moved ?? false,
        }))
      } else {
        // 路径点不足，重新生成
        console.warn(
          `AI返回的路径点数量(${aiResult.path.points?.length || 0})不足，需要${requiredPoints}个，将重新生成`
        )
        generatePath()
      }

      if (aiResult.path.startPoint) {
        startPoint.value = {
          x: aiResult.path.startPoint.x,
          y: aiResult.path.startPoint.y,
          rotation: aiResult.path.startPoint.rotation || 0
        }
      }

      if (aiResult.path.endPoint) {
        endPoint.value = {
          x: aiResult.path.endPoint.x,
          y: aiResult.path.endPoint.y,
          rotation: aiResult.path.endPoint.rotation || 0
        }
      }
    } else if (currentCourse.value.obstacles.length > 0) {
      generatePath()
    }

    currentCourse.value.updatedAt = new Date().toISOString()
    updateCourse()

    return true
  }

  /**
   * 自动保存状态管理
   */
  const saveStatus = ref<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const lastSavedAt = ref<number | null>(null)
  const saveError = ref<string | null>(null)

  /**
   * 设置保存状态
   */
  function setSaveStatus(status: 'idle' | 'saving' | 'saved' | 'failed', error?: string) {
    saveStatus.value = status
    if (status === 'saved') {
      lastSavedAt.value = Date.now()
      saveError.value = null
    } else if (status === 'failed') {
      saveError.value = error || '保存失败'
    }
  }

  /**
   * 剪贴板状态管理
   */
  const clipboard = ref<Obstacle | null>(null)

  /**
   * 复制障碍物
   */
  function copyObstacle(obstacle: Obstacle | null = null) {
    const obstacleToCopy = obstacle || selectedObstacle.value
    if (!obstacleToCopy) {
      return false
    }
    
    // 深拷贝障碍物数据
    clipboard.value = JSON.parse(JSON.stringify(obstacleToCopy))
    return true
  }

  /**
   * 粘贴障碍物
   */
  function pasteObstacle(offsetX: number = 5, offsetY: number = 5) {
    if (!clipboard.value) {
      return null
    }
    
    // 创建新障碍物（带偏移）
    const newObstacle: Obstacle = {
      ...JSON.parse(JSON.stringify(clipboard.value)),
      id: uuidv4(),
      position: {
        x: clipboard.value.position.x + offsetX,
        y: clipboard.value.position.y + offsetY
      }
    }
    
    // 添加到场地
    addObstacle(newObstacle)
    
    // 选中新障碍物
    selectedObstacle.value = newObstacle
    
    return newObstacle
  }

  /**
   * 剪切障碍物
   */
  function cutObstacle(obstacle: Obstacle | null = null) {
    const obstacleToCut = obstacle || selectedObstacle.value
    if (!obstacleToCut) {
      return false
    }
    
    // 复制到剪贴板
    copyObstacle(obstacleToCut)
    
    // 删除原障碍物
    removeObstacle(obstacleToCut.id)
    
    return true
  }

  return {
    currentCourse,
    routeValidationResult,
    highlightedValidationIssue,
    isV2Design,
    selectedObstacle,
    coursePath,
    startPoint,
    endPoint,
    selectedPoint: ref<'start' | 'end' | null>(null),
    saveStatus,
    lastSavedAt,
    saveError,
    clipboard,
    initializeStore,
    updateStartRotation,
    updateEndRotation,
    updateStartPoint,
    updateEndPoint,
    generatePath,
    updateControlPoint,
    togglePathVisibility,
    addObstacle,
    addObstacleWithId,
    updateObstacle,
    getWorldTransform,
    removeObstacle,
    getCompleteDesign,
    setValidationResult,
    highlightValidationIssue,
    clearValidationHighlight,
    applyRouteFix,
    updateCourse,
    saveToLocalStorage,
    readAutosaveDraft,
    restoreFromLocalStorage,
    clearAutosave,
    saveCourse,
    loadCourse,
    updateFieldSize,
    clearPath,
    resetStartEndPoints,
    updateCourseName,
    exportCourse,
    importCourse,
    setCurrentCourseId,
    resetCourse,
    importAIResult,
    commitHistory,
    hydrateFromSnapshot,
    setSaveStatus,
    copyObstacle,
    pasteObstacle,
    cutObstacle
  }
})
