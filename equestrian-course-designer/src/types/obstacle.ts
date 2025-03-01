export enum ObstacleType {
  SINGLE = 'SINGLE',
  DOUBLE = 'DOUBLE',
  COMBINATION = 'COMBINATION',
  WALL = 'WALL', // 砖墙
  LIVERPOOL = 'LIVERPOOL', // 利物浦
}

export interface Pole {
  height: number
  width: number
  color: string
  spacing?: number
  number?: string
  numberPosition?: {
    x: number
    y: number
  }
}

export interface WallProperties {
  height: number
  width: number
  color: string
  texture?: string // 墙面纹理
}

export interface LiverpoolProperties {
  height: number
  width: number
  waterDepth: number // 水深
  waterColor: string // 水的颜色
  hasRail?: boolean // 是否有横杆
  railHeight?: number // 横杆高度
}

export interface Obstacle {
  id: string
  type: ObstacleType
  position: {
    x: number
    y: number
  }
  numberPosition?: {
    x: number
    y: number
  }
  rotation: number
  poles: Pole[]
  number?: string
  wallProperties?: WallProperties // 砖墙属性
  liverpoolProperties?: LiverpoolProperties // 利物浦属性
}

export interface CourseDesign {
  id: string
  name: string
  obstacles: Obstacle[]
  createdAt: string
  updatedAt: string
  fieldWidth: number // 场地宽度（米）
  fieldHeight: number // 场地高度（米）
  path?: CoursePathData
}

export interface PathPoint {
  x: number
  y: number
  rotation?: number
  controlPoint1?: { x: number; y: number }
  controlPoint2?: { x: number; y: number }
}

export interface CoursePath {
  points: PathPoint[]
  visible: boolean
}

export interface CoursePathData {
  visible: boolean
  points: PathPoint[]
  startPoint: {
    x: number
    y: number
    rotation: number
  }
  endPoint: {
    x: number
    y: number
    rotation: number
  }
}
