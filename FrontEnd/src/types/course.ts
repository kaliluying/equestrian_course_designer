export interface ViewportInfo {
  width: number
  height: number
  canvasWidth: number
  canvasHeight: number
  aspectRatio: number
  devicePixelRatio: number
}

export interface CourseDesign {
  id: string
  name: string
  obstacles: Obstacle[]
  createdAt: string
  updatedAt: string
  fieldWidth: number
  fieldHeight: number
  path?: {
    visible: boolean
    points: PathPoint[]
    startPoint?: {
      x: number
      y: number
      rotation: number
    }
    endPoint?: {
      x: number
      y: number
      rotation: number
    }
  }
  viewportInfo?: ViewportInfo
  originalViewportInfo?: ViewportInfo
}
