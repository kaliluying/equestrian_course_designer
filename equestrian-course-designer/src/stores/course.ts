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
    updateCourse()
  }

  // 更新终点旋转角度
  const updateEndRotation = (rotation: number) => {
    endPoint.value.rotation = rotation
    updateCourse()
  }

  // 更新起点位置
  const updateStartPoint = (position: { x: number; y: number }) => {
    startPoint.value.x = position.x
    startPoint.value.y = position.y
    updateCourse()
  }

  // 更新终点位置
  const updateEndPoint = (position: { x: number; y: number }) => {
    endPoint.value.x = position.x
    endPoint.value.y = position.y
    updateCourse()
  }

  // 自动生成路线
  const generatePath = () => {
    // 获取当前课程中的障碍物列表
    const obstacles = currentCourse.value.obstacles
    // 如果没有障碍物，则不生成路径
    if (obstacles.length === 0) return

    // 获取当前的米到像素的比例
    const scale = meterScale.value

    // 只在第一次生成路径时设置起终点位置
    if (!coursePath.value.points.length) {
      // 获取第一个和最后一个障碍物
      const firstObstacle = obstacles[0]
      const lastObstacle = obstacles[obstacles.length - 1]

      // 计算第一个障碍物的中心点
      const firstCenter = getObstacleCenter(firstObstacle)

      // 计算最后一个障碍物的中心点
      const lastCenter = getObstacleCenter(lastObstacle)

      // 根据第一个障碍物设置起点
      const startAngle = (firstObstacle.rotation - 270) * (Math.PI / 180)
      const startDistance = 100 // 起点距离第一个障碍物的距离（像素）
      startPoint.value = {
        x: firstCenter.x - Math.cos(startAngle) * startDistance,
        y: firstCenter.y - Math.sin(startAngle) * startDistance,
        rotation: firstObstacle.rotation,
      }

      // 根据最后一个障碍物设置终点
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

    // 为每个障碍物生成路径点
    obstacles.forEach((obstacle) => {
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

      // 检查是否是障碍物的直线部分
      // 每个障碍物产生5个点：
      // 连接点、直线起点、中心点、直线终点、连接点
      // 对于n个障碍物，点的索引为：
      // 0: 起点
      // 1,2,3,4,5: 第一个障碍物的五个点
      // 6,7,8,9,10: 第二个障碍物的五个点
      // ...
      // 最后: 终点

      // 计算当前点在序列中的位置
      const isStartPoint = i === 0
      const isEndPoint = i === points.length - 1

      // 如果不是起点或终点，检查是否是障碍物的直线部分
      if (!isStartPoint && !isEndPoint) {
        // 减去起点后，每5个点为一组，判断是否是直线部分
        const pointInObstacle = (i - 1) % 5

        // 如果是直线部分的点（直线起点、中心点、直线终点），跳过控制点生成
        if (pointInObstacle === 1 || pointInObstacle === 2 || pointInObstacle === 3) {
          continue
        }
      }

      // 为非直线部分生成控制点
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
    // 获取障碍物杆子的宽度，如果不存在则默认为0
    const poleWidth = obstacle.poles[0]?.width ?? 0

    // 计算所有杆子的总高度，包括杆子的高度和间距
    const totalHeight = obstacle.poles.reduce(
      (sum, pole) => sum + (pole.height ?? 0) + (pole.spacing ?? 0),
      0,
    )

    // 计算障碍物的基础中心点
    const baseX = obstacle.position.x + poleWidth / 2
    const baseY = obstacle.position.y + totalHeight / 2

    // 根据障碍物类型调整中心点
    if (obstacle.type === ObstacleType.LIVERPOOL) {
      // 利物浦障碍的中心点应该在水池的中心
      return {
        x: baseX,
        y: obstacle.position.y + (obstacle.liverpoolProperties?.height ?? 0) / 2,
      }
    } else if (obstacle.type === ObstacleType.WALL) {
      // 墙障碍的中心点应该在墙的中心
      return {
        x: baseX,
        y: obstacle.position.y + (obstacle.wallProperties?.height ?? 0) / 2,
      }
    }

    // 其他类型障碍物使用基础中心点
    return {
      x: baseX,
      y: baseY,
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
      } else {
        point.controlPoint2 = position
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
    currentCourse.value.obstacles.push(newObstacle)

    // 如果路径可见，则重新生成路径
    if (coursePath.value.visible) {
      generatePath()
    }

    updateCourse()
  }

  function updateObstacle(obstacleId: string, updates: Partial<Obstacle>) {
    const index = currentCourse.value.obstacles.findIndex((o) => o.id === obstacleId)
    if (index !== -1) {
      const obstacle = currentCourse.value.obstacles[index]
      currentCourse.value.obstacles[index] = {
        ...obstacle,
        ...updates,
      }

      if (selectedObstacle.value?.id === obstacleId) {
        selectedObstacle.value = currentCourse.value.obstacles[index]
      }

      // 如果路径可见，则重新生成路径
      if (coursePath.value.visible) {
        generatePath()
      }

      updateCourse()
    }
  }

  function removeObstacle(obstacleId: string) {
    currentCourse.value.obstacles = currentCourse.value.obstacles.filter((o) => o.id !== obstacleId)

    // 如果路径可见，则重新生成路径
    if (coursePath.value.visible) {
      generatePath()
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

  // 导出课程数据
  const exportCourse = () => {
    return {
      ...currentCourse.value,
      obstacles: currentCourse.value.obstacles.map((obstacle) => ({
        ...obstacle,
        position: { ...obstacle.position },
        numberPosition: obstacle.numberPosition ? { ...obstacle.numberPosition } : undefined,
      })),
    }
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
  }
})
