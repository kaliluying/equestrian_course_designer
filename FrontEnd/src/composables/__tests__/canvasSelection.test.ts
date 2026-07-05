import { describe, expect, it } from 'vitest'
import { useCanvasSelection } from '@/composables/useCanvasSelection'
import { ObstacleType, type Obstacle } from '@/types/obstacle'

const obstacle = (id: string): Obstacle => ({
  id,
  type: ObstacleType.SINGLE,
  position: { x: 0, y: 0 },
  rotation: 0,
  number: id,
  poles: [{ height: 1, width: 3.5, color: '#000' }],
})

describe('useCanvasSelection', () => {
  it('去重并过滤不可用障碍 ID，同时同步 selectedObstacle', () => {
    const store = {
      currentCourse: { obstacles: [obstacle('a'), obstacle('b')] },
      selectedObstacle: null as Obstacle | null,
    }

    const selection = useCanvasSelection(store)
    selection.setSelectedObstacleIds(['a', 'a', 'missing', 'b'])

    expect(selection.selectedObstacleIds.value).toEqual(['a', 'b'])
    expect(selection.selectedObstacleId.value).toBe('a')
    expect(store.selectedObstacle?.id).toBe('a')
    expect(selection.isObstacleSelected('b')).toBe(true)
  })
})
