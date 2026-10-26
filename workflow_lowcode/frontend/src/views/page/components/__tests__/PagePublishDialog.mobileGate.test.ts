// ----- TDD: PagePublishDialog 批C C3 发布拦截两级清单 -----
// npx vitest run src/views/page/components/__tests__/PagePublishDialog.mobileGate.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PagePublishDialog from '../PagePublishDialog.vue'

vi.mock('@/api/client', () => ({
  clientOptions: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
  }
})

import { clientOptions } from '@/api/client'
import { ElMessage } from 'element-plus'

const OPTIONS = [
  { id: 1, code: 'portal', name: '平台端', channelTypes: ['WEB'], status: 1 },
  { id: 2, code: 'driver', name: '司机端', channelTypes: ['WEB', 'H5', 'APP', 'MP'], status: 1 },
]

/** 缺块（无移动等价=阻断依据）+ 缺字段（EP-only=提示不阻塞） */
const RULE = [
  { type: 'page-table', field: 't1', props: {} },
  { type: 'page-tree-table', field: 'tt1' },
  { type: 'page-form', field: 'f1', children: [{ type: 'LookupPicker', field: 'lp' }] },
]

function createWrapper(props: Record<string, unknown> = {}) {
  return mount(PagePublishDialog, {
    props: { modelValue: true, pageName: '订单列表', rule: RULE, ...props },
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
}

function clientCheckboxes() {
  return Array.from(document.querySelectorAll<HTMLInputElement>('.publish-target-clients input[type="checkbox"]'))
}

function confirmButton() {
  return document.querySelector<HTMLButtonElement>('.el-dialog__footer .el-button--primary')!
}

async function checkDriver() {
  clientCheckboxes()[1].click()
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(clientOptions as any).mockResolvedValue({ data: OPTIONS })
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('PagePublishDialog — 发布拦截两级清单（§8.3/§5.1 拦截行）', () => {
  it('目标端只勾 WEB 平台端：清单不触发，发布不受影响', async () => {
    const w = createWrapper()
    await flushPromises()
    expect(document.querySelector('.publish-mobile-gate')).toBeNull()
    confirmButton().click()
    await flushPromises()
    expect(w.emitted('confirm')?.[0]).toEqual([[1]])
    w.unmount()
  })

  it('勾选含移动渠道的目标端：块级缺失以「该端不支持」展示并拦截确认', async () => {
    const w = createWrapper()
    await flushPromises()
    await checkDriver()

    const gate = document.querySelector('.publish-mobile-gate')
    expect(gate).not.toBeNull()
    expect(gate!.textContent).toContain('page-tree-table')
    expect(gate!.textContent).toContain('该端不支持')

    confirmButton().click()
    await flushPromises()
    // 块级=阻断（§5.1「标记并拦截」）
    expect(ElMessage.warning).toHaveBeenCalled()
    expect(w.emitted('confirm')).toBeUndefined()
    w.unmount()
  })

  it('字段级缺失只提示不阻断（批B裁定：占位降级可发布）', async () => {
    const w = createWrapper({ rule: [{ type: 'page-form', children: [{ type: 'LookupPicker' }] }] })
    await flushPromises()
    await checkDriver()

    const gate = document.querySelector('.publish-mobile-gate')
    expect(gate!.textContent).toContain('LookupPicker')
    expect(gate!.textContent).not.toContain('page-tree-table')

    confirmButton().click()
    await flushPromises()
    expect(w.emitted('confirm')?.[0]).toEqual([[1, 2]])
    w.unmount()
  })

  it('不传 rule（宿主未接）：行为与 A5 原状一致，不做拦截检查', async () => {
    const w = createWrapper({ rule: undefined })
    await flushPromises()
    await checkDriver()
    expect(document.querySelector('.publish-mobile-gate')).toBeNull()
    confirmButton().click()
    await flushPromises()
    expect(w.emitted('confirm')?.[0]).toEqual([[1, 2]])
    w.unmount()
  })

  it('取消勾选移动端后拦截解除', async () => {
    const w = createWrapper()
    await flushPromises()
    await checkDriver()
    expect(document.querySelector('.publish-mobile-gate')).not.toBeNull()
    // 取消司机端 → 只剩平台端 WEB
    clientCheckboxes()[1].click()
    await flushPromises()
    expect(document.querySelector('.publish-mobile-gate')).toBeNull()
    confirmButton().click()
    await flushPromises()
    expect(w.emitted('confirm')?.[0]).toEqual([[1]])
    w.unmount()
  })
})
