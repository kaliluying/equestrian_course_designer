import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useCourseStore } from '@/stores/course'

describe('course store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('导入 AI 路径时，不会为缺失控制点的路径点补出多余手柄', () => {
    const courseStore = useCourseStore()

    const importResult = courseStore.importAIResult({
      obstacles: [
        {
          id: 'ai-obstacle-1',
          type: 'SINGLE',
          position: { x: 20, y: 20 },
          rotation: 0,
          number: '1',
          poles: [{ height: 1.1, width: 3.5, color: '#8B4513' }],
        },
      ],
      path: {
        visible: true,
        points: [
          { x: 10, y: 10 },
          { x: 15, y: 15 },
          { x: 20, y: 20 },
          { x: 25, y: 25 },
          { x: 30, y: 30 },
          { x: 35, y: 35 },
        ],
        startPoint: { x: 10, y: 10, rotation: 0 },
        endPoint: { x: 35, y: 35, rotation: 180 },
      },
    })

    expect(importResult).toBe(true)
    expect(courseStore.coursePath.visible).toBe(true)
    expect(courseStore.coursePath.points).toHaveLength(6)

    courseStore.coursePath.points.forEach((point) => {
      expect(point.controlPoint1).toBeUndefined()
      expect(point.controlPoint2).toBeUndefined()
      expect(point.isControlPoint1Moved).toBe(false)
      expect(point.isControlPoint2Moved).toBe(false)
    })
  })

  it('自动生成路线时，只保留真正参与曲线的控制点', () => {
    const courseStore = useCourseStore()

    courseStore.currentCourse.obstacles = [
      {
        id: 'obstacle-1',
        type: 'SINGLE',
        position: { x: 20, y: 20 },
        rotation: 0,
        number: '1',
        poles: [{ height: 1.1, width: 3.5, color: '#8B4513' }],
      },
    ]

    courseStore.generatePath(true)

    expect(courseStore.coursePath.points).toHaveLength(7)
    expect(courseStore.startPoint.x).toBeCloseTo(22.75)
    expect(courseStore.startPoint.y).toBeCloseTo(15)
    expect(courseStore.endPoint.x).toBeCloseTo(22.75)
    expect(courseStore.endPoint.y).toBeCloseTo(28.1)
    expect(courseStore.coursePath.points[1].controlPoint1).toBeDefined()
    expect(courseStore.coursePath.points[1].controlPoint2).toBeUndefined()
    expect(courseStore.coursePath.points[2].controlPoint1).toBeUndefined()
    expect(courseStore.coursePath.points[2].controlPoint2).toBeUndefined()
    expect(courseStore.coursePath.points[3].controlPoint1).toBeUndefined()
    expect(courseStore.coursePath.points[3].controlPoint2).toBeUndefined()
    expect(courseStore.coursePath.points[4].controlPoint1).toBeUndefined()
    expect(courseStore.coursePath.points[4].controlPoint2).toBeUndefined()
    expect(courseStore.coursePath.points[5].controlPoint1).toBeUndefined()
    expect(courseStore.coursePath.points[5].controlPoint2).toBeDefined()
  })
})
