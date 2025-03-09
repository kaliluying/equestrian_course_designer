export enum ObstacleType {
  SINGLE = 'SINGLE',
  DOUBLE = 'DOUBLE',
  COMBINATION = 'COMBINATION',
  WALL = 'WALL', // 砖墙
  LIVERPOOL = 'LIVERPOOL', // 利物浦
  WATER = 'WATER', // 水障
  DECORATION = 'DECORATION', // 装饰物
  CUSTOM = 'CUSTOM', // 自定义障碍物
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

export interface WaterProperties {
  width: number
  depth: number // 水深
  color: string // 水的颜色
  borderColor?: string // 边框颜色
  borderWidth?: number // 边框宽度
}

// 装饰物类别
export enum DecorationCategory {
  TABLE = 'TABLE', // 裁判桌
  TREE = 'TREE', // 树
  ENTRANCE = 'ENTRANCE', // 入口
  EXIT = 'EXIT', // 出口
  FLOWER = 'FLOWER', // 花
  FENCE = 'FENCE', // 围栏
  CUSTOM = 'CUSTOM', // 自定义装饰
}

// 装饰物属性
export interface DecorationProperties {
  category: DecorationCategory // 装饰物类别
  width: number // 宽度
  height: number // 高度
  color: string // 主色
  secondaryColor?: string // 次色
  svgData?: string // 自定义SVG数据
  imageUrl?: string // 图像URL
  text?: string // 文本内容
  textColor?: string // 文本颜色
  // 特定装饰物属性
  trunkHeight?: number // 树干高度(树)
  trunkWidth?: number // 树干宽度(树)
  foliageRadius?: number // 树冠半径(树)
  // 其他可能的属性
  borderColor?: string // 边框颜色
  borderWidth?: number // 边框宽度
  rotation?: number // 旋转角度
  scale?: number // 缩放比例
  showDirectionArrow?: boolean // 是否显示方向箭头
}

// 自定义障碍物模板
export interface CustomObstacleTemplate {
  id: string
  name: string
  baseType: ObstacleType // 基础类型，用于确定渲染方式
  poles: Pole[]
  wallProperties?: WallProperties
  liverpoolProperties?: LiverpoolProperties
  waterProperties?: WaterProperties
  decorationProperties?: DecorationProperties // 装饰物属性
  createdAt: string
  updatedAt: string
  isShared?: boolean // 是否共享
  creator?: string // 创建者名称
  user_username?: string // 用户名，从后端返回
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
  waterProperties?: WaterProperties // 水障属性
  decorationProperties?: DecorationProperties // 装饰物属性
  customId?: string // 如果是自定义障碍物，存储模板ID
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
  viewportInfo?: {
    width: number // 导出时的视口宽度
    height: number // 导出时的视口高度
    canvasWidth: number // 导出时的画布宽度
    canvasHeight: number // 导出时的画布高度
    aspectRatio: number // 导出时的宽高比
  }
}

export interface PathPoint {
  x: number
  y: number
  rotation?: number
  controlPoint1?: { x: number; y: number }
  controlPoint2?: { x: number; y: number }
  isControlPoint1Moved?: boolean // 标记控制点1是否被手动移动过
  isControlPoint2Moved?: boolean // 标记控制点2是否被手动移动过
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
