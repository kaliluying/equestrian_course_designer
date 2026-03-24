/**
 * 时间格式化工具
 *
 * 推荐做法：
 * - 后端数据库存储 UTC 时间
 * - API 返回 UTC ISO 8601 字符串（如 "2026-03-24T00:01:12Z"）
 * - 前端统一在此处转换为东八区（Asia/Shanghai）本地时间显示
 *
 * 所有组件应通过此模块格式化时间，禁止分散使用 toLocaleString / new Date 格式化
 */
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

// 注册插件
dayjs.extend(utc)
dayjs.extend(timezone)

/** 应用所在时区（东八区） */
const APP_TIMEZONE = 'Asia/Shanghai'

/**
 * 格式化为东八区完整日期时间（年-月-日 时:分）
 * @example "2026-03-24 08:01"
 */
export function formatDateTime(utcString: string | null | undefined): string {
  if (!utcString) return '-'
  return dayjs.utc(utcString).tz(APP_TIMEZONE).format('YYYY-MM-DD HH:mm')
}

/**
 * 格式化为东八区完整日期时间（含秒）
 * @example "2026-03-24 08:01:12"
 */
export function formatDateTimeWithSeconds(utcString: string | null | undefined): string {
  if (!utcString) return '-'
  return dayjs.utc(utcString).tz(APP_TIMEZONE).format('YYYY-MM-DD HH:mm:ss')
}

/**
 * 格式化为东八区日期（仅日期）
 * @example "2026-03-24"
 */
export function formatDate(utcString: string | null | undefined): string {
  if (!utcString) return '-'
  return dayjs.utc(utcString).tz(APP_TIMEZONE).format('YYYY-MM-DD')
}

/**
 * 格式化为相对时间（多久之前）
 * @example "3 小时前"
 */
export function formatRelativeTime(utcString: string | null | undefined): string {
  if (!utcString) return '-'
  const localTime = dayjs.utc(utcString).tz(APP_TIMEZONE)
  const now = dayjs().tz(APP_TIMEZONE)
  const diffMinutes = now.diff(localTime, 'minute')

  if (diffMinutes < 1) return '刚刚'
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`
  const diffHours = now.diff(localTime, 'hour')
  if (diffHours < 24) return `${diffHours} 小时前`
  const diffDays = now.diff(localTime, 'day')
  if (diffDays < 30) return `${diffDays} 天前`
  return localTime.format('YYYY-MM-DD')
}

/**
 * 获取当前东八区时间的 ISO 字符串（用于发送给后端）
 */
export function nowISOString(): string {
  return dayjs().utc().toISOString()
}
