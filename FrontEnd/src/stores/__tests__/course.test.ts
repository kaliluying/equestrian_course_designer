import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useCourseStore } from '@/stores/course'

describe('course store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('缺少服务器基准时间时不误判自动保存冲突', () => {
    const courseStore = useCourseStore()
    localStorage.setItem('design_id_to_update', 'server-1')
    localStorage.setItem(
      'autosaved_course:anonymous:server-1:course',
      JSON.stringify({ id: 'server-1', obstacles: [{ id: 'obstacle-1' }] }),
    )
    localStorage.setItem('autosaved_course:anonymous:server-1:timestamp', '2030-01-01T00:00:00.000Z')

    const state = courseStore.getAutosaveConflictState()

    expect(state?.hasConflict).toBe(false)
    expect(state?.serverUpdatedAt).toBeNull()
  })

  it('不从旧版全局草稿键恢复其他账号的数据', () => {
    const courseStore = useCourseStore()
    localStorage.setItem(
      'autosaved_course',
      JSON.stringify({ id: 'other-user-design', obstacles: [{ id: 'private-obstacle' }] }),
    )
    localStorage.setItem('autosaved_timestamp', '2026-08-16T00:00:00.000Z')

    expect(courseStore.readAutosaveDraft().savedCourse).toBeNull()
    expect(courseStore.readAutosaveDraft().savedTimestamp).toBeNull()
  })

  it('另存为新设计时清理旧设计自动保存分桶', () => {
    vi.useFakeTimers()
    const courseStore = useCourseStore()
    localStorage.setItem('design_id_to_update', 'server-1')
    localStorage.setItem(
      'autosaved_course:anonymous:server-1:course',
      JSON.stringify({ id: 'server-1', name: '旧设计', obstacles: [{ id: 'obstacle-1' }] }),
    )
    localStorage.setItem('autosaved_course:anonymous:server-1:timestamp', '2026-08-16T00:00:00.000Z')

    expect(courseStore.saveAutosaveAsNewDesign()).toBe(true)
    expect(localStorage.getItem('autosaved_course:anonymous:server-1:course')).toBeNull()
    expect(localStorage.getItem('design_id_to_update')).toBeNull()
  })
})
