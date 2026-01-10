import type { AxiosRequestConfig } from 'axios'
import { request } from '@/utils/request'

interface CacheEntry<T> {
  data: T
  timestamp: number
  key: string
  expiresAt: number
  accessCount: number
  lastAccess: number
}

interface CacheStats {
  hits: number
  misses: number
  evictions: number
  size: number
}

const DEFAULT_CACHE_TIME = 60000 // 60秒
const MAX_CACHE_SIZE = 100 // 最大缓存条目数
const CLEANUP_INTERVAL = 30000 // 30秒清理一次

class ApiCache {
  private cache = new Map<string, CacheEntry<unknown>>()
  private stats: CacheStats = { hits: 0, misses: 0, evictions: 0, size: 0 }
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.startCleanup()
  }

  /**
   * 启动定期清理任务
   */
  private startCleanup(): void {
    if (this.cleanupTimer) return

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired()
    }, CLEANUP_INTERVAL)
  }

  /**
   * 清理过期缓存
   */
  private cleanupExpired(): void {
    const now = Date.now()
    let evicted = 0

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
        evicted++
      }
    }

    if (evicted > 0) {
      this.stats.evictions += evicted
      this.stats.size = this.cache.size
    }
  }

  /**
   * LRU淘汰：当缓存满时移除最少使用的条目
   */
  private evictLRU(): void {
    if (this.cache.size < MAX_CACHE_SIZE) return

    let oldestKey: string | null = null
    let oldestAccess = Infinity

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
      this.stats.evictions++
      this.stats.size = this.cache.size
    }
  }

  /**
   * 获取缓存数据
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key)

    if (!entry) {
      this.stats.misses++
      return null
    }

    const now = Date.now()
    if (now > entry.expiresAt) {
      this.cache.delete(key)
      this.stats.misses++
      this.stats.evictions++
      this.stats.size = this.cache.size
      return null
    }

    // 更新访问信息
    entry.accessCount++
    entry.lastAccess = now
    this.stats.hits++

    return entry.data as T
  }

  /**
   * 设置缓存数据
   */
  set<T>(key: string, data: T, cacheTime = DEFAULT_CACHE_TIME): void {
    // 如果缓存已满，执行LRU淘汰
    if (this.cache.size >= MAX_CACHE_SIZE && !this.cache.has(key)) {
      this.evictLRU()
    }

    const now = Date.now()
    this.cache.set(key, {
      data,
      timestamp: now,
      key,
      expiresAt: now + cacheTime,
      accessCount: 0,
      lastAccess: now,
    })

    this.stats.size = this.cache.size
  }

  /**
   * 清除缓存
   */
  invalidate(key?: string): void {
    if (key) {
      this.cache.delete(key)
    } else {
      this.cache.clear()
    }
    this.stats.size = this.cache.size
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): CacheStats {
    return { ...this.stats }
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0, evictions: 0, size: this.cache.size }
  }

  /**
   * 停止清理任务（用于测试或卸载）
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    this.cache.clear()
  }
}

// 创建全局缓存实例
const apiCache = new ApiCache()

// 导出兼容的API
export function getCachedData<T>(key: string): T | null {
  return apiCache.get<T>(key)
}

export function setCachedData<T>(
  key: string,
  data: T,
  cacheTime = DEFAULT_CACHE_TIME
): void {
  apiCache.set(key, data, cacheTime)
}

export function invalidateCache(key?: string): void {
  apiCache.invalidate(key)
}

export async function cachedRequest<T>(
  url: string,
  options?: AxiosRequestConfig,
  cacheTime = DEFAULT_CACHE_TIME
): Promise<T> {
  const cacheKey = `${url}-${JSON.stringify(options?.params || {})}`

  const cached = apiCache.get<T>(cacheKey)
  if (cached) {
    return cached
  }

  const response = await request.get<T>(url, options)
  apiCache.set(cacheKey, response, cacheTime)

  return response
}

/**
 * 获取缓存统计信息（用于监控和调试）
 */
export function getCacheStats(): CacheStats {
  return apiCache.getStats()
}

/**
 * 重置缓存统计信息
 */
export function resetCacheStats(): void {
  apiCache.resetStats()
}

/**
 * 销毁缓存实例（用于测试）
 */
export function destroyCache(): void {
  apiCache.destroy()
}
