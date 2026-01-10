import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getCachedData,
  setCachedData,
  invalidateCache,
  getCacheStats,
  resetCacheStats,
  destroyCache
} from '../apiCache'

describe('ApiCache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    invalidateCache()
    resetCacheStats()
  })

  afterEach(() => {
    destroyCache()
    vi.useRealTimers()
  })

  it('缓存基本功能', () => {
    setCachedData('test-key', { data: 'test-value' })
    const cached = getCachedData('test-key')

    expect(cached).toEqual({ data: 'test-value' })
  })

  it('缓存过期自动清理', () => {
    setCachedData('test-key', { data: 'test' }, 100)

    expect(getCachedData('test-key')).toBeTruthy()

    vi.advanceTimersByTime(150)

    expect(getCachedData('test-key')).toBeNull()
  })

  it('缓存统计功能', () => {
    setCachedData('key1', 'value1')
    getCachedData('key1')
    getCachedData('key2')

    const stats = getCacheStats()

    expect(stats.hits).toBe(1)
    expect(stats.misses).toBe(1)
    expect(stats.size).toBe(1)
  })

  it('LRU淘汰策略', () => {
    for (let i = 0; i < 105; i++) {
      setCachedData(`key-${i}`, `value-${i}`)
    }

    const stats = getCacheStats()

    expect(stats.size).toBeLessThanOrEqual(100)
    expect(stats.evictions).toBeGreaterThan(0)
  })

  it('访问计数更新', () => {
    setCachedData('test-key', 'test-value')

    getCachedData('test-key')
    getCachedData('test-key')
    getCachedData('test-key')

    const stats = getCacheStats()
    expect(stats.hits).toBe(3)
  })

  it('invalidateCache清空指定缓存', () => {
    setCachedData('key1', 'value1')
    setCachedData('key2', 'value2')

    invalidateCache('key1')

    expect(getCachedData('key1')).toBeNull()
    expect(getCachedData('key2')).toBeTruthy()
  })

  it('invalidateCache清空所有缓存', () => {
    setCachedData('key1', 'value1')
    setCachedData('key2', 'value2')

    invalidateCache()

    expect(getCachedData('key1')).toBeNull()
    expect(getCachedData('key2')).toBeNull()
    expect(getCacheStats().size).toBe(0)
  })
})
