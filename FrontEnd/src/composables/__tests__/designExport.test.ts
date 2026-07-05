import { describe, expect, it } from 'vitest'
import { buildTimestampedFileName } from '@/composables/useDesignExport'
import { buildSaveDesignRequest, sanitizeDesignFileName } from '@/composables/useDesignSave'

describe('design export/save composables', () => {
  it('生成稳定的时间戳文件名', () => {
    const name = buildTimestampedFileName('路线', new Date('2026-07-05T01:02:03'))
    expect(name).toContain('路线-2026-07-05')
  })

  it('清理非法文件名并构造保存请求', () => {
    expect(sanitizeDesignFileName('a/b:c*')).toBe('abc')
    const request = buildSaveDesignRequest({
      title: '测试/设计',
      imageBlob: new Blob(['image'], { type: 'image/png' }),
      designBlob: new Blob(['{}'], { type: 'application/json' }),
      designId: '42',
    })
    expect(request.id).toBe(42)
    expect(request.image.name).toBe('测试设计.png')
  })
})
