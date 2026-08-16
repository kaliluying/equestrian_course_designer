import { ref } from 'vue'
import type { Obstacle } from '@/types/obstacle'

interface CourseSelectionStore {
  currentCourse: { obstacles: Obstacle[] }
  selectedObstacle: Obstacle | null
}

export function useCanvasSelection(courseStore: CourseSelectionStore) {
  const selectedObstacleId = ref<string | null>(null)
  const selectedObstacleIds = ref<string[]>([])

  const isObstacleSelected = (obstacleId: string) => selectedObstacleIds.value.includes(obstacleId)

  const setSelectedObstacleIds = (ids: string[]) => {
    const availableIds = new Set(courseStore.currentCourse.obstacles.map((obstacle) => obstacle.id))
    const uniqueIds = Array.from(new Set(ids)).filter((id) => availableIds.has(id))
    selectedObstacleIds.value = uniqueIds
    selectedObstacleId.value = uniqueIds[0] || null
    courseStore.selectedObstacle =
      uniqueIds.length > 0
        ? courseStore.currentCourse.obstacles.find((obstacle) => obstacle.id === uniqueIds[0]) || null
        : null
  }

  const clearSelection = () => setSelectedObstacleIds([])

  return {
    selectedObstacleId,
    selectedObstacleIds,
    isObstacleSelected,
    setSelectedObstacleIds,
    clearSelection,
  }
}

export type CanvasSelectionState = ReturnType<typeof useCanvasSelection>
