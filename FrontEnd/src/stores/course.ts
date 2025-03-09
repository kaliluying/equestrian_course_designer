import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { CourseDesign, Obstacle, PathPoint, CoursePath } from '@/types/obstacle'
import { ObstacleType } from '@/types/obstacle'
import { v4 as uuidv4 } from 'uuid'

/**
 * 马术路线设计状态管理
 * 使用 Pinia 管理整个应用的状态
 * 包含：课程设计、障碍物、路径等相关状态和操作
 */
export const useCourseStore = defineStore('course', () => {
  /**
   * 当前课程设计的状态
   * 包含：课程ID、名称、障碍物列表、创建/更新时间、场地尺寸等
   */
  const currentCourse = ref<CourseDesign>({
    id: uuidv4(),
    name: '马术路线设计',
    obstacles: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fieldWidth: 80, // 场地宽度（米）
    fieldHeight: 60, // 场地高度（米）
  })

  /**
   * 当前选中的障碍物
   * 用于UI交互，标识当前正在编辑的障碍物
   */
  const selectedObstacle = ref<Obstacle | null>(null)

  /**
   * 课程路径状态
   * 包含：路径可见性和路径点列表
   */
  const coursePath = ref<CoursePath>({
    visible: false,
    points: [] as PathPoint[],
  })

  /**
   * 路线的起点和终点状态
   * 包含：位置坐标(x,y)和旋转角度
   */
  const startPoint = ref({ x: 0, y: 0, rotation: 270 })
  const endPoint = ref({ x: 0, y: 0, rotation: 270 })

  /**
   * 初始化存储
   * 检查localStorage中是否存在自动保存的数据
   * @returns {boolean} 是否存在有效的自动保存数据
   */
  const initializeStore = () => {
    console.log('初始化课程设计存储，检查是否有自动保存的数据')
    const savedCourse = localStorage.getItem('autosaved_course')
    const savedTimestamp = localStorage.getItem('autosaved_timestamp')

    if (savedCourse && savedTimestamp) {
      try {
        const courseData = JSON.parse(savedCourse)
        if (courseData && courseData.id) {
          console.log('找到有效的自动保存数据，等待用户确认是否恢复')
          return true
        }
      } catch (error) {
        console.error('自动保存数据无效:', error)
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
   * @param rotation 新的旋转角度（度）
   */
  const updateStartRotation = (rotation: number) => {
    startPoint.value.rotation = rotation

    // 如果路径存在且可见，更新起点附近的控制点
    if (coursePath.value.visible && coursePath.value.points.length > 1) {
      const points = [...coursePath.value.points]
      const startPoint = points[0]
      const nextPoint = points[1]

      // 计算新的控制点位置，基于旋转角度
      if (startPoint && nextPoint && startPoint.controlPoint2) {
        const angle = (rotation - 270) * (Math.PI / 180)
        const distance =
          Math.sqrt(
            Math.pow(nextPoint.x - startPoint.x, 2) + Math.pow(nextPoint.y - startPoint.y, 2),
          ) / 3

        // 更新起点的后控制点
        startPoint.controlPoint2 = {
          x: startPoint.x + Math.cos(angle) * distance,
          y: startPoint.y + Math.sin(angle) * distance,
        }

        coursePath.value.points = points
      }
    }

    updateCourse()
  }

  /**
   * 更新终点旋转角度
   * @param rotation 新的旋转角度（度）
   */
  const updateEndRotation = (rotation: number) => {
    endPoint.value.rotation = rotation

    // 如果路径存在且可见，更新终点附近的控制点
    if (coursePath.value.visible && coursePath.value.points.length > 1) {
      const points = [...coursePath.value.points]
      const lastIndex = points.length - 1
      const endPoint = points[lastIndex]
      const prevPoint = points[lastIndex - 1]

      // 计算新的控制点位置，基于旋转角度
      if (endPoint && prevPoint && endPoint.controlPoint1) {
        const angle = (rotation - 90) * (Math.PI / 180)
        const distance =
          Math.sqrt(Math.pow(prevPoint.x - endPoint.x, 2) + Math.pow(prevPoint.y - endPoint.y, 2)) /
          3

        // 更新终点的前控制点
        endPoint.controlPoint1 = {
          x: endPoint.x + Math.cos(angle) * distance,
          y: endPoint.y + Math.sin(angle) * distance,
        }

        coursePath.value.points = points
      }
    }

    updateCourse()
  }

  /**
   * 更新起点位置
   * @param position 新的位置坐标 {x, y}
   * 更新起点位置并相应更新路径的起点及其控制点
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
   * 根据当前场地中的障碍物自动生成一条合理的路线
   * 包括设置起点、终点位置和生成贝塞尔曲线控制点
   */
  const generatePath = () => {
    // 获取当前课程中的障碍物列表
    const obstacles = currentCourse.value.obstacles
    // 如果没有障碍物，则不生成路径
    if (obstacles.length === 0) return

    // 过滤出非装饰物类型的障碍物
    const nonDecorationObstacles = obstacles.filter(
      (obstacle) => obstacle.type !== ObstacleType.DECORATION,
    )

    // 如果没有非装饰物类型的障碍物，则不生成路径
    if (nonDecorationObstacles.length === 0) return

    // 获取当前的米到像素的比例
    const scale = meterScale.value

    // 只在第一次生成路径时设置起终点位置
    if (!coursePath.value.points.length) {
      // 获取第一个和最后一个非装饰物障碍物
      const firstObstacle = nonDecorationObstacles[0]
      const lastObstacle = nonDecorationObstacles[nonDecorationObstacles.length - 1]

      // 计算第一个障碍物的中心点
      const firstCenter = getObstacleCenter(firstObstacle)

      // 计算最后一个障碍物的中心点
      const lastCenter = getObstacleCenter(lastObstacle)

      // 根据第一个障碍物设置起点，确保起点标记中心线与路径对齐
      const startAngle = (firstObstacle.rotation - 270) * (Math.PI / 180)
      const startDistance = 100 // 起点距离第一个障碍物的距离（像素）
      startPoint.value = {
        x: firstCenter.x - Math.cos(startAngle) * startDistance,
        y: firstCenter.y - Math.sin(startAngle) * startDistance,
        rotation: firstObstacle.rotation,
      }

      // 根据最后一个障碍物设置终点，确保终点标记中心线与路径对齐
      const endAngle = (lastObstacle.rotation - 270) * (Math.PI / 180)
      const endDistance = 100 // 终点距离最后一个障碍物的距离（像素）
      endPoint.value = {
        x: lastCenter.x + Math.cos(endAngle) * endDistance,
        y: lastCenter.y + Math.sin(endAngle) * endDistance,
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
      const angle = (obstacle.rotation - 270) * (Math.PI / 180)
      const approachDistance = 3 * scale // 3米的接近距离
      const departDistance = 3 * scale // 3米的离开距离

      // 添加障碍物前的连接点（可调节点）
      points.push({
        x: center.x - Math.cos(angle) * (approachDistance + 50),
        y: center.y - Math.sin(angle) * (approachDistance + 50),
      })

      // 添加接近直线的起点（3米直线的起点）
      points.push({
        x: center.x - Math.cos(angle) * approachDistance,
        y: center.y - Math.sin(angle) * approachDistance,
      })

      // 添加障碍物中心点
      points.push({
        x: center.x,
        y: center.y,
      })

      // 添加离开直线的终点（3米直线的终点）
      points.push({
        x: center.x + Math.cos(angle) * departDistance,
        y: center.y + Math.sin(angle) * departDistance,
      })

      // 添加障碍物后的连接点（可调节点）
      points.push({
        x: center.x + Math.cos(angle) * (departDistance + 50),
        y: center.y + Math.sin(angle) * (departDistance + 50),
      })
    })

    // 添加终点
    points.push({
      x: endPoint.value.x,
      y: endPoint.value.y,
    })

    // 为每个点生成控制点
    for (let i = 0; i < points.length; i++) {
      const current = points[i]
      const prev = points[i - 1]
      const next = points[i + 1]

      // 计算当前点在序列中的位置
      const isStartPoint = i === 0
      const isEndPoint = i === points.length - 1

      // 如果是起点或终点，生成相应的控制点
      if (isStartPoint || isEndPoint) {
        if (prev && !isStartPoint) {
          // 生成前控制点
          const angle = Math.atan2(prev.y - current.y, prev.x - current.x)
          const distance =
            Math.sqrt(Math.pow(prev.x - current.x, 2) + Math.pow(prev.y - current.y, 2)) / 3
          current.controlPoint1 = {
            x: current.x + Math.cos(angle) * distance,
            y: current.y + Math.sin(angle) * distance,
          }
        }

        if (next && !isEndPoint) {
          // 生成后控制点
          const angle = Math.atan2(next.y - current.y, next.x - current.x)
          const distance =
            Math.sqrt(Math.pow(next.x - current.x, 2) + Math.pow(next.y - current.y, 2)) / 3
          current.controlPoint2 = {
            x: current.x + Math.cos(angle) * distance,
            y: current.y + Math.sin(angle) * distance,
          }
        }
        continue
      }

      // 对于障碍物部分的点，检查是否是直线部分
      const pointInObstacle = (i - 1) % 5

      // 如果是直线部分的点，跳过控制点生成
      if (pointInObstacle === 1 || pointInObstacle === 2 || pointInObstacle === 3) {
        current.controlPoint1 = undefined
        current.controlPoint2 = undefined
        continue
      }

      // 只为连接点生成控制点
      if (prev) {
        // 生成前控制点
        const angle = Math.atan2(prev.y - current.y, prev.x - current.x)
        const distance =
          Math.sqrt(Math.pow(prev.x - current.x, 2) + Math.pow(prev.y - current.y, 2)) / 3
        current.controlPoint1 = {
          x: current.x + Math.cos(angle) * distance,
          y: current.y + Math.sin(angle) * distance,
        }
      }

      if (next) {
        // 生成后控制点
        const angle = Math.atan2(next.y - current.y, next.x - current.x)
        const distance =
          Math.sqrt(Math.pow(next.x - current.x, 2) + Math.pow(next.y - current.y, 2)) / 3
        current.controlPoint2 = {
          x: current.x + Math.cos(angle) * distance,
          y: current.y + Math.sin(angle) * distance,
        }
      }
    }

    // 更新课程路径的点数组
    coursePath.value.points = points
  }

  /**
   * 计算每米对应的像素数
   * 根据当前画布尺寸计算比例
   */
  const meterScale = computed(() => {
    const canvas = document.querySelector('.course-canvas')
    if (!canvas) return 20 // 默认值
    const rect = (canvas as HTMLElement).getBoundingClientRect()
    return rect.width / currentCourse.value.fieldWidth
  })

  /**
   * 计算障碍物的中心点坐标
   * @param obstacle 障碍物对象
   * @returns {x: number, y: number} 障碍物的中心点坐标
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

    // 考虑到padding: 20px的影响
    const padding = 20

    // 计算障碍物的中心点（相对于障碍物position，未旋转前）
    const centerX = width / 2 + padding
    const centerY = height / 2 + padding

    return {
      x: obstacle.position.x + centerX,
      y: obstacle.position.y + centerY,
    }
  }

  /**
   * 更新控制点位置
   * @param pointIndex 路径点索引
   * @param controlPointNumber 控制点编号（1或2）
   * @param position 新的位置坐标
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
   * @param visible 可选参数，指定是否可见。如果不提供，则切换当前状态
   */
  const togglePathVisibility = (visible?: boolean) => {
    const newVisible = visible ?? !coursePath.value.visible
    coursePath.value.visible = newVisible
  }

  /**
   * 添加新的障碍物
   * @param obstacle 障碍物对象（不包含id）
   * @returns 添加后的完整障碍物对象
   */
  function addObstacle(obstacle: Omit<Obstacle, 'id'>) {
    const newObstacle = {
      ...obstacle,
      id: uuidv4(),
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
   * 为新添加的障碍物追加路径点
   * @param obstacle 新添加的障碍物对象
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

    // 计算米到像素的比例
    const scale = meterScale.value
    const approachDistance = 3 * scale // 3米的接近距离
    const departDistance = 3 * scale // 3米的离开距离

    // 创建障碍物的5个点
    const point1: PathPoint = {
      x: center.x - Math.cos(angle) * (approachDistance + 50),
      y: center.y - Math.sin(angle) * (approachDistance + 50),
    }

    const point2: PathPoint = {
      x: center.x - Math.cos(angle) * approachDistance,
      y: center.y - Math.sin(angle) * approachDistance,
    }

    const point3: PathPoint = {
      x: center.x,
      y: center.y,
    }

    const point4: PathPoint = {
      x: center.x + Math.cos(angle) * departDistance,
      y: center.y + Math.sin(angle) * departDistance,
    }

    const point5: PathPoint = {
      x: center.x + Math.cos(angle) * (departDistance + 50),
      y: center.y + Math.sin(angle) * (departDistance + 50),
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

      // 为新障碍物的第一个连接点添加前控制点
      const angleToPrev = Math.atan2(prevPoint.y - point1.y, prevPoint.x - point1.x)
      const distanceToPrev =
        Math.sqrt(Math.pow(prevPoint.x - point1.x, 2) + Math.pow(prevPoint.y - point1.y, 2)) / 3
      point1.controlPoint1 = {
        x: point1.x + Math.cos(angleToPrev) * distanceToPrev,
        y: point1.y + Math.sin(angleToPrev) * distanceToPrev,
      }
    }

    // 为新障碍物的最后一个连接点添加后控制点
    const angleToEnd = Math.atan2(point5.y - endPoint.y, point5.x - endPoint.x)
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
   * @param obstacleId 要更新的障碍物ID
   * @param updates 要更新的属性对象
   */
  function updateObstacle(obstacleId: string, updates: Partial<Obstacle>) {
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
    }
  }

  // 为单个障碍物更新路径点，保留控制点
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

    // 确保索引有效
    if (startIndex >= points.length - 1) {
      return
    }

    // 获取障碍物中心点和角度
    const center = getObstacleCenter(obstacle)
    const angle = (obstacle.rotation - 270) * (Math.PI / 180)

    // 计算米到像素的比例
    const scale = meterScale.value
    const approachDistance = 3 * scale // 3米的接近距离
    const departDistance = 3 * scale // 3米的离开距离

    // 更新障碍物的5个点，但保留控制点

    // 1. 障碍物前的连接点（可调节点）
    const point1 = points[startIndex]
    const oldX1 = point1.x
    const oldY1 = point1.y
    point1.x = center.x - Math.cos(angle) * (approachDistance + 50)
    point1.y = center.y - Math.sin(angle) * (approachDistance + 50)

    // 2. 接近直线的起点
    const point2 = points[startIndex + 1]
    point2.x = center.x - Math.cos(angle) * approachDistance
    point2.y = center.y - Math.sin(angle) * approachDistance

    // 3. 障碍物中心点
    const point3 = points[startIndex + 2]
    point3.x = center.x
    point3.y = center.y

    // 4. 离开直线的终点
    const point4 = points[startIndex + 3]
    point4.x = center.x + Math.cos(angle) * departDistance
    point4.y = center.y + Math.sin(angle) * departDistance

    // 5. 障碍物后的连接点（可调节点）
    const point5 = points[startIndex + 4]
    const oldX5 = point5.x
    const oldY5 = point5.y
    point5.x = center.x + Math.cos(angle) * (departDistance + 50)
    point5.y = center.y + Math.sin(angle) * (departDistance + 50)

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
   * @param obstacleId 要删除的障碍物ID
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
   * 更新课程信息
   * 更新最后修改时间并触发自动保存
   */
  function updateCourse() {
    currentCourse.value.updatedAt = new Date().toISOString()
    saveToLocalStorage()
  }

  /**
   * 自动保存到localStorage
   * 保存当前课程设计的完整状态，包括路径信息
   */
  function saveToLocalStorage() {
    try {
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

      // 检查是否有实际内容需要保存
      if (
        currentCourse.value.obstacles.length === 0 &&
        (!coursePath.value.visible || coursePath.value.points.length === 0)
      ) {
        console.log('没有内容需要自动保存')
        return
      }

      // 保存到localStorage
      try {
        const courseJson = JSON.stringify(courseDataWithPath)
        localStorage.setItem('autosaved_course', courseJson)
        localStorage.setItem('autosaved_timestamp', new Date().toISOString())

        // 验证保存是否成功
        const savedData = localStorage.getItem('autosaved_course')
        if (!savedData) {
          throw new Error('保存后无法读取数据')
        }

        // 触发自动保存成功事件
        const autoSaveEvent = new CustomEvent('course-autosaved', {
          detail: { timestamp: new Date().toISOString() },
        })
        document.dispatchEvent(autoSaveEvent)

        console.log('路线设计已自动保存到localStorage', {
          obstacles: currentCourse.value.obstacles.length,
          pathPoints: coursePath.value.points.length,
          dataSize: courseJson.length,
        })
      } catch (storageError) {
        console.error('localStorage存储失败，可能是存储空间不足:', storageError)
        // 尝试保存简化版数据
        try {
          const simplifiedData = {
            ...courseDataWithPath,
            obstacles: courseDataWithPath.obstacles.map((o) => ({
              id: o.id,
              type: o.type,
              position: o.position,
              rotation: o.rotation,
            })),
          }
          const simplifiedJson = JSON.stringify(simplifiedData)
          localStorage.setItem('autosaved_course', simplifiedJson)
          localStorage.setItem('autosaved_timestamp', new Date().toISOString())
          console.log('已保存简化版路线设计')
        } catch (fallbackError) {
          console.error('即使简化数据后仍然无法保存:', fallbackError)
        }
      }
    } catch (error) {
      console.error('自动保存到localStorage失败:', error)
    }
  }

  /**
   * 从localStorage恢复数据
   * @returns {boolean} 是否成功恢复数据
   */
  function restoreFromLocalStorage(): boolean {
    try {
      console.log('尝试从localStorage恢复路线设计')
      const savedCourse = localStorage.getItem('autosaved_course')
      const savedTimestamp = localStorage.getItem('autosaved_timestamp')

      if (!savedCourse || !savedTimestamp) {
        console.log('没有找到自动保存的数据')
        return false
      }

      console.log('找到自动保存的数据', {
        timestamp: savedTimestamp,
        dataSize: savedCourse.length,
      })

      // 检查自动保存的时间是否在24小时内
      const timestamp = new Date(savedTimestamp)
      const now = new Date()
      const hoursDiff = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60)

      if (hoursDiff > 24) {
        localStorage.removeItem('autosaved_course')
        localStorage.removeItem('autosaved_timestamp')
        console.log('自动保存数据已过期（超过24小时）')
        return false
      }

      // 解析并验证数据
      const courseData = JSON.parse(savedCourse)
      if (!courseData || !courseData.id || !Array.isArray(courseData.obstacles)) {
        console.error('自动保存的数据格式不正确')
        return false
      }

      console.log('解析自动保存数据成功', {
        id: courseData.id,
        name: courseData.name,
        obstacles: courseData.obstacles.length,
        hasPath: !!courseData.path,
      })

      // 恢复课程基本数据
      currentCourse.value = {
        id: courseData.id || uuidv4(),
        name: courseData.name || '马术路线设计',
        obstacles: Array.isArray(courseData.obstacles) ? courseData.obstacles : [],
        createdAt: courseData.createdAt || new Date().toISOString(),
        updatedAt: courseData.updatedAt || new Date().toISOString(),
        fieldWidth: courseData.fieldWidth || 80,
        fieldHeight: courseData.fieldHeight || 60,
      }

      // 恢复路径数据
      if (courseData.path) {
        coursePath.value = {
          visible: Boolean(courseData.path.visible),
          points: Array.isArray(courseData.path.points) ? courseData.path.points : [],
        }

        if (courseData.path.startPoint) {
          startPoint.value = {
            x: Number(courseData.path.startPoint.x) || 0,
            y: Number(courseData.path.startPoint.y) || 0,
            rotation: Number(courseData.path.startPoint.rotation) || 270,
          }
        }

        if (courseData.path.endPoint) {
          endPoint.value = {
            x: Number(courseData.path.endPoint.x) || 0,
            y: Number(courseData.path.endPoint.y) || 0,
            rotation: Number(courseData.path.endPoint.rotation) || 270,
          }
        }
      }

      console.log('已从localStorage恢复路线设计', {
        obstacles: currentCourse.value.obstacles.length,
        pathPoints: coursePath.value.points.length,
      })
      return true
    } catch (error) {
      console.error('从localStorage恢复失败:', error)
      return false
    }
  }

  /**
   * 清除localStorage中的自动保存数据
   */
  function clearAutosave() {
    localStorage.removeItem('autosaved_course')
    localStorage.removeItem('autosaved_timestamp')
    console.log('已清除自动保存的路线设计')
  }

  /**
   * 保存课程设计到文件
   * 将当前课程设计导出为JSON文件，包含完整的路径信息
   */
  function saveCourse() {
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
   * @param file 要加载的JSON文件
   * @throws {Error} 如果文件格式错误
   */
  async function loadCourse(file: File) {
    try {
      const text = await file.text()
      const courseData = JSON.parse(text)

      // 处理视口信息
      const viewportInfo = courseData.viewportInfo || {
        width: window.innerWidth,
        height: window.innerHeight,
        canvasWidth: 800,
        canvasHeight: 600,
        aspectRatio: (courseData.fieldWidth || 80) / (courseData.fieldHeight || 60),
      }

      // 加载基本课程数据
      currentCourse.value = {
        id: courseData.id,
        name: courseData.name,
        obstacles: courseData.obstacles,
        createdAt: courseData.createdAt,
        updatedAt: courseData.updatedAt,
        fieldWidth: courseData.fieldWidth,
        fieldHeight: courseData.fieldHeight,
        viewportInfo, // 确保保留视口信息用于屏幕适配
      }

      console.log('加载课程数据，包含视口信息:', viewportInfo)

      // 如果存在路线数据，则加载路线
      if (courseData.path) {
        coursePath.value = {
          visible: courseData.path.visible,
          points: courseData.path.points,
        }

        if (courseData.path.startPoint) {
          startPoint.value = courseData.path.startPoint
        }

        if (courseData.path.endPoint) {
          endPoint.value = courseData.path.endPoint
        }
      }

      updateCourse()
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
   * 自动生成课程设计
   * 根据场地尺寸自动生成一定数量的障碍物
   */
  function generateCourse() {
    currentCourse.value.obstacles = []

    const { fieldWidth, fieldHeight } = currentCourse.value
    const meterScale = document.querySelector('.course-canvas')?.clientWidth ?? 1000 / fieldWidth

    // 根据场地面积计算合适的障碍物数量（8-12个）
    const obstacleCount = Math.min(12, Math.max(8, Math.floor((fieldWidth * fieldHeight) / 400)))

    // 定义起点和终点区域
    const startArea = { x: fieldWidth * 0.2, y: fieldHeight * 0.2 }
    const endArea = { x: fieldWidth * 0.8, y: fieldHeight * 0.8 }

    // 生成路径点
    const pathPoints = generatePathPoints(
      obstacleCount,
      startArea,
      endArea,
      fieldWidth,
      fieldHeight,
    )

    // 根据路径点生成障碍物
    pathPoints.forEach((point, index) => {
      const nextPoint = pathPoints[index + 1]
      let rotation = 0
      if (nextPoint) {
        rotation = Math.atan2(nextPoint.y - point.y, nextPoint.x - point.x) * (180 / Math.PI)
      }

      // 创建新的障碍物
      const obstacle: Omit<Obstacle, 'id'> = {
        type: getRandomObstacleType(),
        position: {
          x: point.x * meterScale,
          y: point.y * meterScale,
        },
        rotation: (rotation + 270) % 360,
        poles: [
          {
            width: 4 * meterScale,
            height: 0.2 * meterScale,
            color: '#8B4513',
            numberPosition: { x: 0, y: 50 },
          },
        ],
        number: String(index + 1),
      }

      // 根据障碍物类型添加特定属性
      if (obstacle.type === ObstacleType.DOUBLE) {
        obstacle.poles.push({
          width: 4 * meterScale,
          height: 0.2 * meterScale,
          color: '#8B4513',
          numberPosition: { x: 0, y: 50 },
        })
        obstacle.poles[0].spacing = 2.5 * meterScale
      } else if (obstacle.type === ObstacleType.LIVERPOOL) {
        obstacle.liverpoolProperties = {
          height: 0.3 * meterScale,
          width: 4 * meterScale,
          waterDepth: 0.2 * meterScale,
          waterColor: 'rgba(0, 100, 255, 0.3)',
          hasRail: true,
          railHeight: 1.3 * meterScale,
        }
      } else if (obstacle.type === ObstacleType.WALL) {
        obstacle.wallProperties = {
          width: 4 * meterScale,
          height: 3 * meterScale,
          color: '#8B4513',
        }
      }

      addObstacle(obstacle)
    })

    updateCourse()
  }

  /**
   * 生成路径点
   * @param count 需要生成的点数量
   * @param start 起点区域
   * @param end 终点区域
   * @param maxWidth 场地最大宽度
   * @param maxHeight 场地最大高度
   * @returns 生成的路径点数组
   */
  function generatePathPoints(
    count: number,
    start: { x: number; y: number },
    end: { x: number; y: number },
    maxWidth: number,
    maxHeight: number,
  ) {
    const points: { x: number; y: number }[] = []
    const minDistance = 10 // 点之间的最小距离

    // 添加起点
    points.push({ x: start.x, y: start.y })

    // 生成中间点
    for (let i = 1; i < count - 1; i++) {
      let attempts = 0
      let point

      // 尝试生成有效的点，最多100次
      do {
        point = {
          x: maxWidth * 0.2 + Math.random() * maxWidth * 0.6,
          y: maxHeight * 0.2 + Math.random() * maxHeight * 0.6,
        }
        attempts++
      } while (!isValidPoint(point, points, minDistance) && attempts < 100)

      if (attempts < 100) {
        points.push(point)
      }
    }

    // 添加终点
    points.push({ x: end.x, y: end.y })

    // 优化路径
    optimizePath(points)

    return points
  }

  /**
   * 检查点是否有效
   * @param point 要检查的点
   * @param points 已存在的点数组
   * @param minDistance 最小距离要求
   * @returns 如果点与所有已存在的点的距离都大于最小距离，则返回true
   */
  function isValidPoint(
    point: { x: number; y: number },
    points: { x: number; y: number }[],
    minDistance: number,
  ) {
    return points.every(
      (p) => Math.sqrt(Math.pow(p.x - point.x, 2) + Math.pow(p.y - point.y, 2)) >= minDistance,
    )
  }

  /**
   * 优化路径点
   * 调整路径点以避免急转弯
   * @param points 要优化的路径点数组
   */
  function optimizePath(points: { x: number; y: number }[]) {
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      const next = points[i + 1]

      // 计算当前点与前后点形成的角度
      const angle1 = Math.atan2(curr.y - prev.y, curr.x - prev.x)
      const angle2 = Math.atan2(next.y - curr.y, next.x - curr.x)
      const angleDiff = Math.abs(angle2 - angle1) * (180 / Math.PI)

      // 如果角度大于90度，说明是急转弯，需要调整当前点的位置
      if (angleDiff > 90) {
        const midX = (prev.x + next.x) / 2
        const midY = (prev.y + next.y) / 2
        points[i] = {
          x: curr.x * 0.3 + midX * 0.7,
          y: curr.y * 0.3 + midY * 0.7,
        }
      }
    }
  }

  /**
   * 随机获取障碍物类型
   * @returns 随机选择的障碍物类型
   */
  function getRandomObstacleType(): ObstacleType {
    const types = [
      ObstacleType.SINGLE,
      ObstacleType.SINGLE,
      ObstacleType.DOUBLE,
      ObstacleType.LIVERPOOL,
    ]
    return types[Math.floor(Math.random() * types.length)]
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
   * @returns 当前课程设计的完整数据，包括路径信息
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
      obstacles: [...currentCourse.value.obstacles],
      createdAt: currentCourse.value.createdAt,
      updatedAt: new Date().toISOString(),
      fieldWidth: currentCourse.value.fieldWidth,
      fieldHeight: currentCourse.value.fieldHeight,
      // 添加屏幕和画布信息用于自适应
      viewportInfo: {
        width: viewportWidth,
        height: viewportHeight,
        canvasWidth: canvasRect ? canvasRect.width : 0,
        canvasHeight: canvasRect ? canvasRect.height : 0,
        aspectRatio: currentCourse.value.fieldWidth / currentCourse.value.fieldHeight,
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
      console.log('导出路线数据，路线点数量:', coursePath.value.points.length)
    }

    return exportData
  }

  /**
   * 从协作会话中导入课程数据
   * @param course 要导入的课程设计数据
   */
  function importCourse(course: CourseDesign) {
    // 保留当前的ID，避免覆盖本地ID
    const currentId = currentCourse.value.id

    // 记录导入前的视口信息
    const viewportInfo = course.viewportInfo || {
      width: window.innerWidth,
      height: window.innerHeight,
      canvasWidth: 800,
      canvasHeight: 600,
      aspectRatio: course.fieldWidth / course.fieldHeight,
    }

    // 更新课程数据
    currentCourse.value = {
      ...course,
      id: currentId,
      updatedAt: new Date().toISOString(),
      // 保留原始设计的视口信息
      viewportInfo,
    }

    console.log('导入课程数据，包含视口信息:', viewportInfo)

    // 清除选中的障碍物
    selectedObstacle.value = null

    // 更新路径
    if (course.path) {
      coursePath.value = course.path
    }
  }

  /**
   * 设置当前课程ID
   * @param id 新的课程ID
   */
  const setCurrentCourseId = (id: string) => {
    if (id) {
      console.log('设置当前设计ID:', id)
      currentCourse.value.id = id || uuidv4()
      console.log('当前设计ID已更新为:', currentCourse.value.id)
    }
  }

  /**
   * 重置课程状态
   * 将所有状态恢复到初始值
   */
  function resetCourse() {
    // 重置课程状态为初始状态
    currentCourse.value = {
      id: uuidv4(),
      name: '马术路线设计',
      obstacles: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fieldWidth: 80,
      fieldHeight: 60,
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

  return {
    currentCourse,
    selectedObstacle,
    coursePath,
    startPoint,
    endPoint,
    updateCourseName,
    generatePath,
    updateControlPoint,
    togglePathVisibility,
    updateStartRotation,
    updateEndRotation,
    updateStartPoint,
    updateEndPoint,
    addObstacle,
    updateObstacle,
    removeObstacle,
    saveCourse,
    loadCourse,
    updateFieldSize,
    generateCourse,
    clearPath,
    resetStartEndPoints,
    exportCourse,
    importCourse,
    setCurrentCourseId,
    resetCourse,
    restoreFromLocalStorage,
    clearAutosave,
  }
})
