import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { CourseDesign, Obstacle, PathPoint, CoursePath } from '@/types/obstacle'
import { ObstacleType } from '@/types/obstacle'
import { v4 as uuidv4 } from 'uuid'

export const useCourseStore = defineStore('course', () => {
  const currentCourse = ref<CourseDesign>({
    id: uuidv4(),
    name: '马术路线设计',
    obstacles: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fieldWidth: 80,
    fieldHeight: 60,
  })

  const selectedObstacle = ref<Obstacle | null>(null)
  const coursePath = ref<CoursePath>({
    visible: false,
    points: [] as PathPoint[],
  })

  // 添加起终点状态
  const startPoint = ref({ x: 0, y: 0, rotation: 270 })
  const endPoint = ref({ x: 0, y: 0, rotation: 270 })

  // 更新起点旋转角度
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

  // 更新终点旋转角度
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

        // 更新路径点
        coursePath.value.points = points
      }
    }

    updateCourse()
  }

  // 更新起点位置
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
            // 如果控制点已被移动过，保持相对位置
            const dx = startPathPoint.x - oldStartX
            const dy = startPathPoint.y - oldStartY
            startPathPoint.controlPoint2.x += dx
            startPathPoint.controlPoint2.y += dy
          } else {
            // 如果控制点未被移动过，重新计算位置
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

  // 更新终点位置
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
            // 如果控制点已被移动过，保持相对位置
            const dx = endPathPoint.x - oldEndX
            const dy = endPathPoint.y - oldEndY
            endPathPoint.controlPoint1.x += dx
            endPathPoint.controlPoint1.y += dy
          } else {
            // 如果控制点未被移动过，重新计算位置
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

  // 自动生成路线
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
      // 起点应位于障碍物前方，与障碍物保持一定距离
      const startAngle = (firstObstacle.rotation - 270) * (Math.PI / 180)
      const startDistance = 100 // 起点距离第一个障碍物的距离（像素）
      startPoint.value = {
        x: firstCenter.x - Math.cos(startAngle) * startDistance,
        y: firstCenter.y - Math.sin(startAngle) * startDistance,
        rotation: firstObstacle.rotation,
      }

      // 根据最后一个障碍物设置终点，确保终点标记中心线与路径对齐
      // 终点应位于障碍物后方，与障碍物保持一定距离
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

    // 添加起点 - 直接使用起点的位置和旋转
    // 由于在UI中，标记是围绕自身中心点旋转的，直接使用起点坐标即可
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

    // 添加终点 - 直接使用终点的位置和旋转
    // 由于在UI中，标记是围绕自身中心点旋转的，直接使用终点坐标即可
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

      // 如果是起点或终点，可以生成控制点
      if (isStartPoint || isEndPoint) {
        // 生成相应的控制点
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
      // 障碍物点索引说明：
      // 每个障碍物产生5个点：
      // 连接点(0)、直线起点(1)、中心点(2)、直线终点(3)、连接点(4)
      // 对于多个障碍物，索引形式为：
      // 0: 起点
      // 1,2,3,4,5: 第一个障碍物的五个点
      // 6,7,8,9,10: 第二个障碍物的五个点...

      // 计算当前点在障碍物序列中的位置
      // 减去起点后，每5个点为一组
      const pointInObstacle = (i - 1) % 5

      // 如果是直线部分的点或直线起点和终点，跳过控制点生成
      // 直线部分是：直线起点(1)、中心点(2)、直线终点(3)
      if (pointInObstacle === 1 || pointInObstacle === 2 || pointInObstacle === 3) {
        // 显式清除任何可能的控制点
        current.controlPoint1 = undefined
        current.controlPoint2 = undefined
        continue
      }

      // 只为连接点(0和4)生成控制点
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

  // 计算每米对应的像素数
  const meterScale = computed(() => {
    const canvas = document.querySelector('.course-canvas')
    if (!canvas) return 20 // 默认值
    const rect = (canvas as HTMLElement).getBoundingClientRect()
    return rect.width / currentCourse.value.fieldWidth
  })

  /**
   * 计算障碍物的中心点
   * @param obstacle 障碍物对象，包含位置、杆子信息、类型及特定属性
   * @returns 返回障碍物的中心点坐标
   */
  const getObstacleCenter = (obstacle: Obstacle) => {
    // 障碍物在UI中是以它的左上角为position定位，然后通过transform: rotate进行旋转
    // 旋转中心是障碍物的中心（由transform-origin: center center控制）

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

      // 计算障碍物高度（所有杆子加上间距）
      height = obstacle.poles.reduce(
        (sum, pole) => sum + (pole.height ?? 0) + (pole.spacing ?? 0),
        0,
      )
    }

    // 考虑到padding: 20px的影响
    const padding = 20

    // 计算障碍物的中心点（相对于障碍物position，未旋转前）
    // 此处要考虑CSS中的padding为20px
    const centerX = width / 2 + padding
    const centerY = height / 2 + padding

    // 障碍物的旋转是围绕自身中心的，所以在获取最终中心点时不需要再次应用旋转变换
    // 因为position + 中心偏移量已经是旋转后的实际中心点

    return {
      x: obstacle.position.x + centerX,
      y: obstacle.position.y + centerY,
    }
  }

  // 更新控制点位置
  const updateControlPoint = (
    pointIndex: number,
    controlPointNumber: 1 | 2,
    position: { x: number; y: number },
  ) => {
    if (pointIndex >= 0 && pointIndex < coursePath.value.points.length) {
      // 创建新的点数组以触发响应式更新
      const newPoints = [...coursePath.value.points]
      const point = newPoints[pointIndex]

      if (controlPointNumber === 1) {
        point.controlPoint1 = position
        point.isControlPoint1Moved = true // 标记控制点1已被手动移动
      } else {
        point.controlPoint2 = position
        point.isControlPoint2Moved = true // 标记控制点2已被手动移动
      }

      // 更新整个点数组以确保视图更新
      coursePath.value = {
        ...coursePath.value,
        points: newPoints,
      }
    }
  }

  // 切换路线可见性
  const togglePathVisibility = (visible?: boolean) => {
    const newVisible = visible ?? !coursePath.value.visible
    // 直接修改可见性，不要触发自动生成
    coursePath.value.visible = newVisible
  }

  function addObstacle(obstacle: Omit<Obstacle, 'id'>) {
    const newObstacle = {
      ...obstacle,
      id: uuidv4(),
    }

    // 添加新障碍物到数组
    currentCourse.value.obstacles.push(newObstacle)

    // 如果路径可见，则更新路径
    if (coursePath.value.visible) {
      if (coursePath.value.points.length <= 2) {
        // 如果路径点不足（只有起点和终点或更少），重新生成整个路径
        generatePath()
      } else {
        // 否则，只为新障碍物添加路径点，保留现有控制点
        appendObstacleToPath(newObstacle)
      }
    }

    updateCourse()

    // 返回新创建的障碍物对象
    return newObstacle
  }

  // 为新添加的障碍物追加路径点
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

    // 1. 障碍物前的连接点（可调节点）
    const point1: PathPoint = {
      x: center.x - Math.cos(angle) * (approachDistance + 50),
      y: center.y - Math.sin(angle) * (approachDistance + 50),
    }

    // 2. 接近直线的起点
    const point2: PathPoint = {
      x: center.x - Math.cos(angle) * approachDistance,
      y: center.y - Math.sin(angle) * approachDistance,
    }

    // 3. 障碍物中心点
    const point3: PathPoint = {
      x: center.x,
      y: center.y,
    }

    // 4. 离开直线的终点
    const point4: PathPoint = {
      x: center.x + Math.cos(angle) * departDistance,
      y: center.y + Math.sin(angle) * departDistance,
    }

    // 5. 障碍物后的连接点（可调节点）
    const point5: PathPoint = {
      x: center.x + Math.cos(angle) * (departDistance + 50),
      y: center.y + Math.sin(angle) * (departDistance + 50),
    }

    // 为连接点添加控制点
    // 获取前一个点（上一个障碍物的最后一个点）
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

  function updateObstacle(obstacleId: string, updates: Partial<Obstacle>) {
    // 找到要更新的障碍物索引
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
        // 如果变更为装饰物类型，需要从路径中移除这个障碍物
        if (isChangingToDecoration) {
          // 重新生成整个路径
          generatePath()
        }
        // 如果从装饰物类型变为其他类型，需要将其添加到路径中
        else if (isChangingFromDecoration) {
          // 重新生成整个路径
          generatePath()
        }
        // 只有当位置或旋转发生变化且不是装饰物类型时才更新路径
        else if (
          (updates.position || updates.rotation !== undefined) &&
          currentCourse.value.obstacles[index].type !== ObstacleType.DECORATION
        ) {
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

  function removeObstacle(obstacleId: string) {
    // 找到要删除的障碍物索引
    const obstacleIndex = currentCourse.value.obstacles.findIndex((o) => o.id === obstacleId)

    // 如果找不到障碍物，直接返回
    if (obstacleIndex === -1) {
      return
    }

    // 获取被删除的障碍物
    const obstacle = currentCourse.value.obstacles[obstacleIndex]

    // 如果路径可见，且不是装饰物类型，则需要更新路径点
    if (
      coursePath.value.visible &&
      coursePath.value.points.length > 0 &&
      obstacle.type !== ObstacleType.DECORATION
    ) {
      // 计算障碍物在路径点数组中的起始索引
      // 起点(1) + 非装饰物障碍物索引 * 每个障碍物的点数(5)
      // 首先要计算这个障碍物前面有多少个非装饰物
      const nonDecorationObstaclesBefore = currentCourse.value.obstacles
        .slice(0, obstacleIndex)
        .filter((o) => o.type !== ObstacleType.DECORATION).length

      const startIndex = 1 + nonDecorationObstaclesBefore * 5

      // 确保索引有效
      if (startIndex < coursePath.value.points.length - 1) {
        // 创建新的点数组，移除该障碍物的5个点
        const newPoints = [...coursePath.value.points]
        newPoints.splice(startIndex, 5)

        // 更新路径点数组
        coursePath.value.points = newPoints
      }
    }

    // 从障碍物数组中移除该障碍物
    currentCourse.value.obstacles = currentCourse.value.obstacles.filter((o) => o.id !== obstacleId)

    // 如果路径可见但点数组为空或只有起点和终点，重新生成路径
    if (coursePath.value.visible && coursePath.value.points.length <= 2) {
      // 检查是否有非装饰物障碍物
      const hasNonDecorationObstacles = currentCourse.value.obstacles.some(
        (o) => o.type !== ObstacleType.DECORATION,
      )

      if (hasNonDecorationObstacles) {
        // 如果有非装饰物障碍物，重新生成路径
        generatePath()
      } else {
        // 如果只有装饰物或没有障碍物，清除路径
        clearPath()
      }
    }

    updateCourse()
  }

  function updateCourse() {
    currentCourse.value.updatedAt = new Date().toISOString()
  }

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
    const date = new Date()
    const year = date.getFullYear() // 年
    const month = String(date.getMonth() + 1).padStart(2, '0') // 月
    const day = String(date.getDate()).padStart(2, '0') // 日
    const hours = String(date.getHours()).padStart(2, '0') // 时
    const minutes = String(date.getMinutes()).padStart(2, '0') // 分
    const seconds = String(date.getSeconds()).padStart(2, '0') // 秒

    const formattedDateTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    link.href = url
    link.download = `${currentCourse.value.name}-${formattedDateTime}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  async function loadCourse(file: File) {
    try {
      const text = await file.text()
      const courseData = JSON.parse(text)

      // 加载基本课程数据
      currentCourse.value = {
        id: courseData.id,
        name: courseData.name,
        obstacles: courseData.obstacles,
        createdAt: courseData.createdAt,
        updatedAt: courseData.updatedAt,
        fieldWidth: courseData.fieldWidth,
        fieldHeight: courseData.fieldHeight,
      }

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
    } catch {
      throw new Error('文件格式错误')
    }
  }

  function updateFieldSize(width: number, height: number) {
    currentCourse.value.fieldWidth = width
    currentCourse.value.fieldHeight = height
    updateCourse()
  }

  function generateCourse() {
    currentCourse.value.obstacles = []

    const { fieldWidth, fieldHeight } = currentCourse.value
    const meterScale = document.querySelector('.course-canvas')?.clientWidth ?? 1000 / fieldWidth

    const obstacleCount = Math.min(12, Math.max(8, Math.floor((fieldWidth * fieldHeight) / 400)))

    const startArea = { x: fieldWidth * 0.2, y: fieldHeight * 0.2 }
    const endArea = { x: fieldWidth * 0.8, y: fieldHeight * 0.8 }

    const pathPoints = generatePathPoints(
      obstacleCount,
      startArea,
      endArea,
      fieldWidth,
      fieldHeight,
    )

    pathPoints.forEach((point, index) => {
      const nextPoint = pathPoints[index + 1]
      let rotation = 0
      if (nextPoint) {
        rotation = Math.atan2(nextPoint.y - point.y, nextPoint.x - point.x) * (180 / Math.PI)
      }

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
        // 初始化砖墙属性
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

  function generatePathPoints(
    count: number,
    start: { x: number; y: number },
    end: { x: number; y: number },
    maxWidth: number,
    maxHeight: number,
  ) {
    const points: { x: number; y: number }[] = []
    const minDistance = 10

    points.push({ x: start.x, y: start.y })

    for (let i = 1; i < count - 1; i++) {
      let attempts = 0
      let point

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

    points.push({ x: end.x, y: end.y })

    optimizePath(points)

    return points
  }

  function isValidPoint(
    point: { x: number; y: number },
    points: { x: number; y: number }[],
    minDistance: number,
  ) {
    return points.every(
      (p) => Math.sqrt(Math.pow(p.x - point.x, 2) + Math.pow(p.y - point.y, 2)) >= minDistance,
    )
  }

  function optimizePath(points: { x: number; y: number }[]) {
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      const next = points[i + 1]

      const angle1 = Math.atan2(curr.y - prev.y, curr.x - prev.x)
      const angle2 = Math.atan2(next.y - curr.y, next.x - curr.x)
      const angleDiff = Math.abs(angle2 - angle1) * (180 / Math.PI)

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

  function getRandomObstacleType(): ObstacleType {
    const types = [
      ObstacleType.SINGLE,
      ObstacleType.SINGLE,
      ObstacleType.DOUBLE,
      ObstacleType.LIVERPOOL,
    ]
    return types[Math.floor(Math.random() * types.length)]
  }

  // 修改清除路径的方法
  function clearPath() {
    // 先设置不可见
    coursePath.value.visible = false
    // 清空路径点
    coursePath.value.points = []
    // 重置起终点
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

  // 添加重置起终点的方法
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

  // 添加更新课程名称的方法
  function updateCourseName(name: string) {
    currentCourse.value.name = name
    updateCourse()
  }

  // 导出当前课程设计
  const exportCourse = (): CourseDesign => {
    // 创建一个新的对象，避免直接修改原对象
    const exportData: CourseDesign = {
      id: currentCourse.value.id,
      name: currentCourse.value.name,
      obstacles: [...currentCourse.value.obstacles],
      createdAt: currentCourse.value.createdAt,
      updatedAt: new Date().toISOString(),
      fieldWidth: currentCourse.value.fieldWidth,
      fieldHeight: currentCourse.value.fieldHeight,
    }

    // 如果有路径数据，添加到导出数据中
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

  // 从协作会话中导入课程数据
  function importCourse(course: CourseDesign) {
    // 保留当前的ID，避免覆盖本地ID
    const currentId = currentCourse.value.id

    // 更新课程数据
    currentCourse.value = {
      ...course,
      id: currentId, // 保留原始ID
      updatedAt: new Date().toISOString(),
    }

    // 清除选中的障碍物
    selectedObstacle.value = null

    // 更新路径
    if (course.path) {
      coursePath.value = course.path
    }
  }

  // 设置当前课程ID
  const setCurrentCourseId = (id: string) => {
    if (id) {
      console.log('设置当前设计ID:', id)
      // 如果ID为空或未定义，生成新的UUID
      currentCourse.value.id = id || uuidv4()
      console.log('当前设计ID已更新为:', currentCourse.value.id)
    }
  }

  // 重置课程状态到初始值
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
  }
})
