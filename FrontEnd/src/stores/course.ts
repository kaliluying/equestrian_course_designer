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
    obstacles: [], // 障碍物列表
    createdAt: new Date().toISOString(), // 创建时间
    updatedAt: new Date().toISOString(), // 更新时间
    fieldWidth: 90, // 场地宽度（米）
    fieldHeight: 60, // 场地高度（米）
  })

  /**
   * 当前选中的障碍物
   * @description 用于UI交互，标识当前正在编辑的障碍物
   */
  const selectedObstacle = ref<Obstacle | null>(null)

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
    // 计算旋转差值，确保在-180到180度之间
    let currentRotation = startPoint.value.rotation % 360
    if (currentRotation < 0) currentRotation += 360

    let newRotation = rotation % 360
    if (newRotation < 0) newRotation += 360

    // 计算最短路径的角度差
    let diff = newRotation - currentRotation
    if (diff > 180) diff -= 360
    if (diff < -180) diff += 360

    // 更新旋转角度，保持连续性
    startPoint.value.rotation = currentRotation + diff

    // 如果路径存在且可见，更新起点附近的控制点
    if (coursePath.value.visible && coursePath.value.points.length > 1) {
      const points = [...coursePath.value.points]
      const startPoint = points[0]
      const nextPoint = points[1]

      // 计算新的控制点位置，基于旋转角度
      if (startPoint && nextPoint && startPoint.controlPoint2) {
        // 使用实际旋转角度计算控制点位置
        const angle = ((currentRotation + diff - 270) % 360) * (Math.PI / 180)
        const distance =
          Math.sqrt(
            Math.pow(nextPoint.x - startPoint.x, 2) + Math.pow(nextPoint.y - startPoint.y, 2),
          ) / 3

        // 更新起点的后控制点
        startPoint.controlPoint2 = {
          x: startPoint.x + Math.cos(angle) * distance,
          y: startPoint.y + Math.sin(angle) * distance,
        }
        // 标记控制点为已手动移动
        startPoint.isControlPoint2Moved = true

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
    // 计算旋转差值，确保在-180到180度之间
    let currentRotation = endPoint.value.rotation % 360
    if (currentRotation < 0) currentRotation += 360

    let newRotation = rotation % 360
    if (newRotation < 0) newRotation += 360

    // 计算最短路径的角度差
    let diff = newRotation - currentRotation
    if (diff > 180) diff -= 360
    if (diff < -180) diff += 360

    // 更新旋转角度，保持连续性
    endPoint.value.rotation = currentRotation + diff

    // 如果路径存在且可见，更新终点附近的控制点
    if (coursePath.value.visible && coursePath.value.points.length > 1) {
      const points = [...coursePath.value.points]
      const lastIndex = points.length - 1
      const endPoint = points[lastIndex]
      const prevPoint = points[lastIndex - 1]

      // 计算新的控制点位置，基于旋转角度
      if (endPoint && prevPoint && endPoint.controlPoint1) {
        // 使用实际旋转角度计算控制点位置
        const angle = ((currentRotation + diff - 90) % 360) * (Math.PI / 180)
        const distance =
          Math.sqrt(Math.pow(prevPoint.x - endPoint.x, 2) + Math.pow(prevPoint.y - endPoint.y, 2)) /
          3

        // 更新终点的前控制点
        endPoint.controlPoint1 = {
          x: endPoint.x + Math.cos(angle) * distance,
          y: endPoint.y + Math.sin(angle) * distance,
        }
        // 标记控制点为已手动移动
        endPoint.isControlPoint1Moved = true

        coursePath.value.points = points
      }
    }

    updateCourse()
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
      // 计算障碍物的角度（弧度），减去270度是为了调整角度方向
      // 马术比赛中，障碍物的方向通常是垂直于障碍物的方向
      const angle = (obstacle.rotation - 270) * (Math.PI / 180)
      // 定义障碍物前方的直线距离为3米，并转换为像素单位
      // 这个距离用于确保马匹有足够的空间接近障碍物
      const approachDistance = 3 * scale // 3米的接近距离
      // 定义障碍物后方的直线距离为3米，并转换为像素单位
      // 这个距离用于确保马匹有足够的空间离开障碍物
      const departDistance = 3 * scale // 3米的离开距离
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
      // 添加障碍物前的连接点（可调节点）
      points.push({
        x: center.x - Math.cos(angle) * (approachDistance + totalLength / 2),
        y: center.y - Math.sin(angle) * (approachDistance + totalLength / 2),
      })

      // 添加接近直线的起点（3米直线的起点）
      points.push({
        x: center.x - Math.cos(angle) * (approachDistance + totalLength / 2),
        y: center.y - Math.sin(angle) * (approachDistance + totalLength / 2),
      })

      // 添加障碍物中心点
      points.push({
        x: center.x,
        y: center.y,
      })

      // 添加离开直线的终点（3米直线的终点）
      points.push({
        x: center.x + Math.cos(angle) * (departDistance + totalLength / 2),
        y: center.y + Math.sin(angle) * (departDistance + totalLength / 2),
      })

      // 添加障碍物后的连接点（可调节点）
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
      if (prev && pointInObstacle != 4) {
        // 生成前控制点
        const angle = Math.atan2(prev.y - current.y, prev.x - current.x)
        const distance =
          Math.sqrt(Math.pow(prev.x - current.x, 2) + Math.pow(prev.y - current.y, 2)) / 3
        current.controlPoint1 = {
          x: current.x + Math.cos(angle) * distance,
          y: current.y + Math.sin(angle) * distance,
        }
        continue
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
    updateCourse()
  }

  /**
   * 计算每米对应的像素数
   * @description 根据当前画布尺寸计算比例
   * @returns {number} 每米对应的像素数
   */
  const meterScale = computed(() => {
    const canvas = document.querySelector('.course-canvas')
    if (!canvas) return 20 // 默认值
    const rect = (canvas as HTMLElement).getBoundingClientRect()
    return rect.width / currentCourse.value.fieldWidth
  })

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

    // 计算米到像素的比例
    const scale = meterScale.value
    // 定义障碍物前方的直线距离为3米，并转换为像素单位
    // 这个距离用于确保马匹有足够的空间接近障碍物
    const approachDistance = 3 * scale // 3米的接近距离
    // 定义障碍物后方的直线距离为3米，并转换为像素单位
    // 这个距离用于确保马匹有足够的空间离开障碍物
    const departDistance = 3 * scale // 3米的离开距离

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
    // 第1个点：障碍物前的连接点，位于障碍物前方3米
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

    // 确保索引有效
    if (startIndex >= points.length - 1) {
      return
    }

    // 获取障碍物中心点和角度
    const center = getObstacleCenter(obstacle)
    const angle = (obstacle.rotation - 270) * (Math.PI / 180)

    // 计算米到像素的比例
    const scale = meterScale.value
    // 定义障碍物前方的直线距离为3米，并转换为像素单位
    // 这个距离用于确保马匹有足够的空间接近障碍物
    const approachDistance = 3 * scale // 3米的接近距离
    // 定义障碍物后方的直线距离为3米，并转换为像素单位
    // 这个距离用于确保马匹有足够的空间离开障碍物
    const departDistance = 3 * scale // 3米的离开距离

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
   * 更新课程信息
   * @description 更新最后修改时间并触发自动保存
   */
  function updateCourse() {
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
    // 更新最后修改时间
    currentCourse.value.updatedAt = new Date().toISOString()
    // 调用自动保存，现在会包含最新的视口信息
    saveToLocalStorage()
  }

  /**
   * 自动保存到localStorage
   * @description 保存当前课程设计的完整状态，包括路径信息和视口信息
   */
  function saveToLocalStorage() {
    try {
      // 检查是否有实际内容需要保存（避免保存空设计）
      if (
        currentCourse.value.obstacles.length === 0 &&
        (!coursePath.value.visible || coursePath.value.points.length === 0)
      ) {
        // 可以选择在此处清除自动保存或直接返回
        // localStorage.removeItem('autosaved_course');
        // localStorage.removeItem('autosaved_timestamp');
        return // 如果没有内容，不保存
      }

      // 创建包含路线和视口信息的完整数据对象
      const courseDataToSave = {
        ...currentCourse.value, // 包含更新后的 viewportInfo
        path: {
          visible: coursePath.value.visible,
          points: coursePath.value.points,
          startPoint: startPoint.value,
          endPoint: endPoint.value,
        },
      }

      // 保存数据到localStorage
      localStorage.setItem('autosaved_course', JSON.stringify(courseDataToSave))
      localStorage.setItem('autosaved_timestamp', new Date().toISOString())
    } catch (error) {
      console.error('自动保存到localStorage失败:', error)
    }
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

      // 先检查自动保存的数据
      const savedCourse = localStorage.getItem('autosaved_course')
      const savedTimestamp = localStorage.getItem('autosaved_timestamp')

      if (!savedCourse || !savedTimestamp) {
        return false
      }

      try {
        // 解析保存的数据
        const parsedData = JSON.parse(savedCourse)

        // 验证数据完整性
        if (!parsedData || !parsedData.id || !Array.isArray(parsedData.obstacles)) {
          console.error('自动保存的数据格式无效')
          return false
        }

        // 获取当前画布尺寸
        const canvas = document.querySelector('.course-canvas')
        const currentCanvasWidth = canvas ? canvas.clientWidth : 800
        const currentCanvasHeight = canvas ? canvas.clientHeight : 600

        // 获取当前视口信息
        const currentViewport = {
          width: window.innerWidth,
          height: window.innerHeight,
          canvasWidth: currentCanvasWidth,
          canvasHeight: currentCanvasHeight,
          aspectRatio: (parsedData.fieldWidth || 80) / (parsedData.fieldHeight || 60),
        }

        // 计算缩放系数
        let scaleFactor = 1
        if (parsedData.viewportInfo) {
          const originalViewport = parsedData.viewportInfo
          const scaleFactorWidth =
            currentViewport.canvasWidth / (originalViewport.canvasWidth || 800)
          const scaleFactorHeight =
            currentViewport.canvasHeight / (originalViewport.canvasHeight || 600)
          scaleFactor = Math.min(scaleFactorWidth, scaleFactorHeight)
        }

        // 缩放障碍物位置和尺寸
        const scaledObstacles = parsedData.obstacles.map((obstacle: Obstacle) => {
          const scaledObstacle = { ...obstacle }

          // 缩放位置
          if (scaledObstacle.position) {
            scaledObstacle.position = {
              x: scaledObstacle.position.x * scaleFactor,
              y: scaledObstacle.position.y * scaleFactor,
            }
          }

          // 缩放编号位置
          if (scaledObstacle.numberPosition) {
            scaledObstacle.numberPosition = {
              x: scaledObstacle.numberPosition.x * scaleFactor,
              y: scaledObstacle.numberPosition.y * scaleFactor,
            }
          }

          // 缩放障碍物属性
          if (scaledObstacle.poles) {
            scaledObstacle.poles = scaledObstacle.poles.map((pole) => ({
              ...pole,
              width: pole.width * scaleFactor,
              height: pole.height * scaleFactor,
              spacing: pole.spacing ? pole.spacing * scaleFactor : undefined,
            }))
          }

          // 缩放特定类型的属性
          if (scaledObstacle.wallProperties) {
            scaledObstacle.wallProperties = {
              ...scaledObstacle.wallProperties,
              width: scaledObstacle.wallProperties.width * scaleFactor,
              height: scaledObstacle.wallProperties.height * scaleFactor,
            }
          }

          if (scaledObstacle.liverpoolProperties) {
            scaledObstacle.liverpoolProperties = {
              ...scaledObstacle.liverpoolProperties,
              width: scaledObstacle.liverpoolProperties.width * scaleFactor,
              height: scaledObstacle.liverpoolProperties.height * scaleFactor,
              waterDepth: scaledObstacle.liverpoolProperties.waterDepth * scaleFactor,
            }
          }

          if (scaledObstacle.waterProperties) {
            scaledObstacle.waterProperties = {
              ...scaledObstacle.waterProperties,
              width: scaledObstacle.waterProperties.width * scaleFactor,
              depth: scaledObstacle.waterProperties.depth * scaleFactor,
              borderWidth: scaledObstacle.waterProperties.borderWidth
                ? scaledObstacle.waterProperties.borderWidth * scaleFactor
                : undefined,
            }
          }

          if (scaledObstacle.decorationProperties) {
            scaledObstacle.decorationProperties = {
              ...scaledObstacle.decorationProperties,
              width: scaledObstacle.decorationProperties.width * scaleFactor,
              height: scaledObstacle.decorationProperties.height * scaleFactor,
              borderWidth: scaledObstacle.decorationProperties.borderWidth
                ? scaledObstacle.decorationProperties.borderWidth * scaleFactor
                : undefined,
            }
          }

          return scaledObstacle
        })

        // 缩放路径数据
        let scaledPath = null
        if (parsedData.path) {
          scaledPath = {
            visible: parsedData.path.visible,
            points: parsedData.path.points.map((point: PathPoint) => {
              const scaledPoint = {
                ...point,
                x: point.x * scaleFactor,
                y: point.y * scaleFactor,
              }

              if (point.controlPoint1) {
                scaledPoint.controlPoint1 = {
                  x: point.controlPoint1.x * scaleFactor,
                  y: point.controlPoint1.y * scaleFactor,
                }
              }

              if (point.controlPoint2) {
                scaledPoint.controlPoint2 = {
                  x: point.controlPoint2.x * scaleFactor,
                  y: point.controlPoint2.y * scaleFactor,
                }
              }

              return scaledPoint
            }),
          }
        }

        // 更新当前课程数据
        currentCourse.value = {
          ...parsedData,
          obstacles: scaledObstacles,
          viewportInfo: currentViewport,
          updatedAt: new Date().toISOString(),
        }

        // 更新路径数据
        if (scaledPath) {
          coursePath.value = scaledPath

          // 更新起点和终点
          if (parsedData.path.startPoint) {
            startPoint.value = {
              x: parsedData.path.startPoint.x * scaleFactor,
              y: parsedData.path.startPoint.y * scaleFactor,
              rotation: parsedData.path.startPoint.rotation,
            }
          }

          if (parsedData.path.endPoint) {
            endPoint.value = {
              x: parsedData.path.endPoint.x * scaleFactor,
              y: parsedData.path.endPoint.y * scaleFactor,
              rotation: parsedData.path.endPoint.rotation,
            }
          }
        }

        return true
      } catch (error) {
        console.error('解析本地存储的JSON数据失败:', error)
        // 清除无效的自动保存数据
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
      const courseData = JSON.parse(text)

      // 处理视口信息
      const originalViewport = courseData.viewportInfo || {
        width: window.innerWidth,
        height: window.innerHeight,
        canvasWidth: 800,
        canvasHeight: 600,
        aspectRatio: (courseData.fieldWidth || 80) / (courseData.fieldHeight || 60),
      }

      // 确保canvas已经渲染，才能获取准确的尺寸
      // 需要等待一会，确保DOM已经更新
      await new Promise((resolve) => setTimeout(resolve, 100))

      // 获取当前画布元素
      const canvasElement = document.querySelector('.course-canvas')
      let currentCanvasWidth = 800
      let currentCanvasHeight = 600

      if (canvasElement) {
        const rect = canvasElement.getBoundingClientRect()
        currentCanvasWidth = rect.width
        currentCanvasHeight = rect.height
      } else {
        console.warn('未找到画布元素，使用默认尺寸')
      }

      // 当前设备的视口信息
      const currentViewport = {
        width: window.innerWidth,
        height: window.innerHeight,
        canvasWidth: currentCanvasWidth,
        canvasHeight: currentCanvasHeight,
        aspectRatio: (courseData.fieldWidth || 80) / (courseData.fieldHeight || 60),
      }

      // 计算缩放系数 - 使用画布大小比例
      const scaleFactorWidth = currentViewport.canvasWidth / (originalViewport.canvasWidth || 800)
      const scaleFactorHeight =
        currentViewport.canvasHeight / (originalViewport.canvasHeight || 600)
      // 使用一个统一的缩放因子，防止宽高比例不同导致的变形
      const scaleFactor = Math.min(scaleFactorWidth, scaleFactorHeight)

      // 检查是否需要进行缩放调整
      const needsScaling = Math.abs(scaleFactor - 1) > 0.1

      // 调整障碍物位置和尺寸来适应当前屏幕
      const scaledObstacles = courseData.obstacles.map((obstacle: Obstacle, index: number) => {
        const scaledObstacle = JSON.parse(JSON.stringify(obstacle)) // 深拷贝确保所有嵌套属性都能被修改

        // 确保对象有position属性
        if (!scaledObstacle.position) {
          console.warn(`障碍物 #${index} 缺少position属性，设置默认值`, obstacle)
          scaledObstacle.position = { x: 10, y: 10 }
        }

        if (needsScaling) {
          // 记录原始位置用于调试
          // const originalPosition = { ...scaledObstacle.position }

          // 缩放位置 - 使用统一的缩放因子确保等比例缩放
          scaledObstacle.position = {
            x: scaledObstacle.position.x * scaleFactor,
            y: scaledObstacle.position.y * scaleFactor,
          }

          // 如果有编号位置，也要缩放
          if (scaledObstacle.numberPosition) {
            scaledObstacle.numberPosition = {
              x: scaledObstacle.numberPosition.x * scaleFactor,
              y: scaledObstacle.numberPosition.y * scaleFactor,
            }
          }

          // 缩放障碍物的大小 - 根据障碍物类型处理不同属性
          // 1. 缩放横杆（poles）
          if (scaledObstacle.poles && Array.isArray(scaledObstacle.poles)) {
            scaledObstacle.poles = scaledObstacle.poles.map((pole: Pole) => ({
              ...pole,
              width: pole.width * scaleFactor,
              height: pole.height * scaleFactor,
              spacing: pole.spacing ? pole.spacing * scaleFactor : undefined,
            }))
          }

          // 2. 缩放墙属性
          if (scaledObstacle.wallProperties) {
            scaledObstacle.wallProperties = {
              ...scaledObstacle.wallProperties,
              width: scaledObstacle.wallProperties.width * scaleFactor,
              height: scaledObstacle.wallProperties.height * scaleFactor,
            }
          }

          // 3. 缩放利物浦属性
          if (scaledObstacle.liverpoolProperties) {
            scaledObstacle.liverpoolProperties = {
              ...scaledObstacle.liverpoolProperties,
              width: scaledObstacle.liverpoolProperties.width * scaleFactor,
              height: scaledObstacle.liverpoolProperties.height * scaleFactor,
              railHeight: scaledObstacle.liverpoolProperties.railHeight
                ? scaledObstacle.liverpoolProperties.railHeight * scaleFactor
                : undefined,
            }
          }

          // 4. 缩放水障属性
          if (scaledObstacle.waterProperties) {
            scaledObstacle.waterProperties = {
              ...scaledObstacle.waterProperties,
              width: scaledObstacle.waterProperties.width * scaleFactor,
              depth: scaledObstacle.waterProperties.depth * scaleFactor,
              borderWidth: scaledObstacle.waterProperties.borderWidth
                ? scaledObstacle.waterProperties.borderWidth * scaleFactor
                : undefined,
            }
          }

          // 5. 缩放装饰物属性
          if (scaledObstacle.decorationProperties) {
            scaledObstacle.decorationProperties = {
              ...scaledObstacle.decorationProperties,
              width: scaledObstacle.decorationProperties.width * scaleFactor,
              height: scaledObstacle.decorationProperties.height * scaleFactor,
              trunkHeight: scaledObstacle.decorationProperties.trunkHeight
                ? scaledObstacle.decorationProperties.trunkHeight * scaleFactor
                : undefined,
              trunkWidth: scaledObstacle.decorationProperties.trunkWidth
                ? scaledObstacle.decorationProperties.trunkWidth * scaleFactor
                : undefined,
              foliageRadius: scaledObstacle.decorationProperties.foliageRadius
                ? scaledObstacle.decorationProperties.foliageRadius * scaleFactor
                : undefined,
              borderWidth: scaledObstacle.decorationProperties.borderWidth
                ? scaledObstacle.decorationProperties.borderWidth * scaleFactor
                : undefined,
              scale: scaledObstacle.decorationProperties.scale
                ? scaledObstacle.decorationProperties.scale * scaleFactor
                : undefined,
            }
          }

          // 确保障碍物在场地范围内
          const fieldWidth = courseData.fieldWidth || 80
          const fieldHeight = courseData.fieldHeight || 60

          // 设置边界限制
          const minX = 0
          const maxX = fieldWidth
          const minY = 0
          const maxY = fieldHeight

          if (scaledObstacle.position.x < minX) scaledObstacle.position.x = minX
          if (scaledObstacle.position.x > maxX) scaledObstacle.position.x = maxX
          if (scaledObstacle.position.y < minY) scaledObstacle.position.y = minY
          if (scaledObstacle.position.y > maxY) scaledObstacle.position.y = maxY
        }

        return scaledObstacle
      })

      // 同样以等比例缩放调整路径点
      let scaledPath = null
      if (courseData.path) {
        scaledPath = { ...courseData.path }

        if (needsScaling && courseData.path.points) {
          // 缩放路径点 - 使用统一缩放因子
          scaledPath.points = courseData.path.points.map((point: PathPoint) => {
            const scaledPoint = {
              ...point,
              x: point.x * scaleFactor,
              y: point.y * scaleFactor,
            }

            // 处理控制点
            if (point.controlPoint1) {
              scaledPoint.controlPoint1 = {
                x: point.controlPoint1.x * scaleFactor,
                y: point.controlPoint1.y * scaleFactor,
              }
            }

            if (point.controlPoint2) {
              scaledPoint.controlPoint2 = {
                x: point.controlPoint2.x * scaleFactor,
                y: point.controlPoint2.y * scaleFactor,
              }
            }

            return scaledPoint
          })
        }
      }

      // 加载基本课程数据
      currentCourse.value = {
        id: courseData.id,
        name: courseData.name,
        obstacles: scaledObstacles || courseData.obstacles,
        createdAt: courseData.createdAt,
        updatedAt: courseData.updatedAt,
        fieldWidth: courseData.fieldWidth,
        fieldHeight: courseData.fieldHeight,
        viewportInfo: currentViewport, // 更新为当前设备的视口信息
      }

      // 如果存在路线数据，则加载路线
      if (scaledPath) {
        coursePath.value = {
          visible: scaledPath.visible,
          points: scaledPath.points,
        }

        if (scaledPath.startPoint) {
          startPoint.value = scaledPath.startPoint
        }

        if (scaledPath.endPoint) {
          endPoint.value = scaledPath.endPoint
        }
      }

      // 更新课程
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

    // 清除选中的障碍物
    selectedObstacle.value = null

    // 更新路径
    if (course.path) {
      console.log('导入路径数据:', course.path)
      // 更新路径数据
      coursePath.value = {
        visible: course.path.visible ?? false,
        points: course.path.points ? [...course.path.points] : [],
      }

      // 更新起点和终点
      if (course.path.startPoint) {
        startPoint.value = {
          x: course.path.startPoint.x,
          y: course.path.startPoint.y,
          rotation: course.path.startPoint.rotation || 270,
        }
      }
      if (course.path.endPoint) {
        endPoint.value = {
          x: course.path.endPoint.x,
          y: course.path.endPoint.y,
          rotation: course.path.endPoint.rotation || 270,
        }
      }

      console.log('路径数据导入完成:', {
        coursePath: coursePath.value,
        startPoint: startPoint.value,
        endPoint: endPoint.value,
      })
    } else {
      console.log('没有路径数据需要导入')
      // 如果没有路径数据，重置路径状态
      coursePath.value = {
        visible: false,
        points: [],
      }
      startPoint.value = { x: 0, y: 0, rotation: 270 }
      endPoint.value = { x: 0, y: 0, rotation: 270 }
    }
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
    selectedPoint: ref<'start' | 'end' | null>(null), // 添加选中点状态
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
    removeObstacle,
    updateCourse,
    saveToLocalStorage,
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
  }
})
