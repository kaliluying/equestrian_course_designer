import { ref } from 'vue'

export interface DragPosition { x: number; y: number }

export function useCanvasDragState() {
  const draggingObstacles = ref<{
    ids: string[]
    pointerStart: DragPosition
    startPositions: Record<string, DragPosition>
    currentPositions?: Record<string, DragPosition>
  } | null>(null)

  const draggingNumber = ref<{
    id: string
    pointerStart: DragPosition
    startPosition: DragPosition
    currentPosition?: DragPosition
  } | null>(null)

  const rotatingObstacle = ref<{
    id: string
    center: DragPosition
    startAngle: number
    startRotation: number
    currentRotation?: number
  } | null>(null)

  const selectingState = ref<{
    start: DragPosition
    end: DragPosition
    additive: boolean
    baseSelectedIds: string[]
  } | null>(null)

  const clearDragState = () => {
    draggingObstacles.value = null
    draggingNumber.value = null
    rotatingObstacle.value = null
    selectingState.value = null
  }

  return {
    draggingObstacles,
    draggingNumber,
    rotatingObstacle,
    selectingState,
    clearDragState,
  }
}
