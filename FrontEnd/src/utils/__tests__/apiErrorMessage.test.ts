import { describe, expect, it } from 'vitest'
import { getApiErrorMessage } from '@/utils/apiErrorMessage'

describe('apiErrorMessage', () => {
  it.each([
    [{ response: { data: { message: { prompt: ['请输入设计需求描述'] } } } }, '请输入设计需求描述'],
    [{ response: { data: { message: { email: ['邮箱格式不正确'], password: ['密码太短'] } } } }, '邮箱格式不正确；密码太短'],
    [{ response: { data: { detail: '认证已过期' } } }, '认证已过期'],
    [{ response: { data: { error: '模型服务不可用' } } }, '模型服务不可用'],
    [{ response: { data: '服务维护中' } }, '服务维护中'],
    [{ message: 'Network Error' }, '网络错误，请检查您的网络连接'],
    [{ message: 'timeout of 120000ms exceeded' }, '请求超时，请稍后重试'],
    [{ code: 'ECONNREFUSED' }, '无法连接到服务器，请检查网络连接'],
    [{ code: 'TIMEOUT' }, '服务器响应超时，请稍后重试'],
    [{ code: 'NETWORK_ERROR' }, '网络错误，请检查网络连接'],
  ])('提取用户可读错误文案 %#', (error, expected) => {
    expect(getApiErrorMessage(error)).toBe(expected)
  })

  it('无法识别的异常使用调用方默认文案', () => {
    expect(getApiErrorMessage({}, '生成失败，请稍后重试')).toBe('生成失败，请稍后重试')
  })
})
