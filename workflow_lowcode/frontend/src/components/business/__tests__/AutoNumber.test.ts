// ----- Task 3-c: AutoNumber 自动编号组件（只读展示 + 格式预览 + resetPolicy 粒度提示）测试 -----
// npx vitest run src/components/business/__tests__/AutoNumber.test.ts

import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import AutoNumber from '../AutoNumber.vue'
import { buildPreviewText, formatAutoNumberDate, RESET_POLICY_LABELS } from '../autoNumberFormat'

function mountComp(props: Record<string, unknown> = {}) {
  return mount(AutoNumber, { props, global: { plugins: [ElementPlus] } })
}

// 固定「当前时间」为本地时区 2026-02-11 09:05（用本地构造避免时区漂移导致日期段断言失败）
const FIXED_NOW = new Date(2026, 1, 11, 9, 5, 0)

afterEach(() => {
  vi.useRealTimers()
})

describe('AutoNumber — 占位与只读展示', () => {
  it('无值：输入框 disabled + 默认占位「提交后自动生成」+ 显示格式预览', () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
    const w = mountComp()
    const input = w.find('input').element as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(input.placeholder).toBe('提交后自动生成')
    const preview = w.find('.auto-number__preview')
    expect(preview.exists()).toBe(true)
    expect(preview.text()).toContain('BN20260211xxxx')
  })

  it('无值 + 自定义 placeholder：占位文案被替换，格式预览仍在', () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
    const w = mountComp({ placeholder: '单号提交后由系统生成' })
    const input = w.find('input').element as HTMLInputElement
    expect(input.placeholder).toBe('单号提交后由系统生成')
    expect(w.find('.auto-number__preview').exists()).toBe(true)
  })

  it('前缀图标经 el-input prefix 槽渲染', () => {
    const w = mountComp()
    expect(w.find('.auto-number__icon').exists()).toBe(true)
  })
})

describe('AutoNumber — 值回显（后端生成写入）', () => {
  it('有值：回显编号、隐藏格式预览、输入框只读不可编辑', () => {
    const w = mountComp({ modelValue: 'BN20260101-0001' })
    const input = w.find('input').element as HTMLInputElement
    expect(input.value).toBe('BN20260101-0001')
    expect(input.disabled).toBe(true)
    expect(w.find('.auto-number__preview').exists()).toBe(false)
    expect(w.text()).not.toContain('编号规则')
  })
})

describe('AutoNumber — previewText 格式化（dateFormat / seqDigits / resetPolicy）', () => {
  it('previewText：prefix + dateFormat 日期段 + seqDigits 个 x，粒度提示随 resetPolicy', () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
    const w = mountComp({ prefix: 'PO', dateFormat: 'yyyyMM', seqDigits: 6, resetPolicy: 'month' })
    const preview = w.find('.auto-number__preview')
    expect(preview.text()).toContain('PO202602xxxxxx')
    expect(preview.text()).toContain('流水号按月重置')
  })

  it('resetPolicy 影响 UI 粒度提示但不影响日期段：day / never 两档', () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
    const day = mountComp({ resetPolicy: 'day' })
    expect(day.text()).toContain('BN20260211xxxx')
    expect(day.text()).toContain('流水号按天重置')
    const never = mountComp({ resetPolicy: 'never', dateFormat: 'yyyy' })
    expect(never.text()).toContain('BN2026xxxx')
    expect(never.text()).toContain('流水号永不重置')
  })

  it('buildPreviewText 纯函数：默认值 / yyyyMMddHH / 未知格式回退 / 位数边界', () => {
    expect(buildPreviewText({}, FIXED_NOW)).toBe('BN20260211xxxx')
    expect(
      buildPreviewText({ prefix: 'INV', dateFormat: 'yyyyMMddHH', seqDigits: 2 }, FIXED_NOW),
    ).toBe('INV2026021109xx')
    // 白名单外格式回退 yyyyMMdd
    expect(buildPreviewText({ dateFormat: 'unknown-fmt' }, FIXED_NOW)).toBe('BN20260211xxxx')
    // seqDigits 边界：0 → 无占位段；负数/非数按 0 处理不抛错
    expect(buildPreviewText({ seqDigits: 0 }, FIXED_NOW)).toBe('BN20260211')
    expect(buildPreviewText({ seqDigits: -3 }, FIXED_NOW)).toBe('BN20260211')
    expect(formatAutoNumberDate(FIXED_NOW, 'yyyy')).toBe('2026')
  })

  it('RESET_POLICY_LABELS：四档粒度文案齐备（day/month/year/never）', () => {
    expect(RESET_POLICY_LABELS.day).toBe('按天重置')
    expect(RESET_POLICY_LABELS.month).toBe('按月重置')
    expect(RESET_POLICY_LABELS.year).toBe('按年重置')
    expect(RESET_POLICY_LABELS.never).toBe('永不重置')
  })
})
