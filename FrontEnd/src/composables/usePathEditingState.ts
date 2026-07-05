import { ref } from 'vue'

export function usePathEditingState() {
  const draggingPathPoint = ref<{
    pointType: 'start' | 'end'
    offsetX: number
    offsetY: number
  } | null>(null)

  const rotatingPathPoint = ref<{
    pointType: 'start' | 'end'
    startAngle: number
    startRotation: number
  } | null>(null)

  const draggingControlPoint = ref<{
    pointIndex: number
    controlPointNumber: 1 | 2
  } | null>(null)

  const clearPathEditingState = () => {
    draggingPathPoint.value = null
    rotatingPathPoint.value = null
    draggingControlPoint.value = null
  }

  return {
    draggingPathPoint,
    rotatingPathPoint,
    draggingControlPoint,
    clearPathEditingState,
  }
}
