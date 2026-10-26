// ----- TDD: PagePublishDialog A5 发布目标端 -----
// npx vitest run src/views/page/components/__tests__/PagePublishDialog.test.ts

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
  { id: 3, code: 'passenger', name: '乘客端', channelTypes: ['H5'], status: 0 },
]

/** el-dialog 内容 teleport 到 document.body：DOM 级断言用 document 查询（attachTo 保证树内挂载，unmount 清理） */
function createWrapper() {
  return mount(PagePublishDialog, {
    props: { modelValue: true, pageName: '订单列表' },
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
}

function clientCheckboxes() {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>('.publish-target-clients input[type="checkbox"]'),
  )
}

function confirmButton() {
  return document.querySelector<HTMLButtonElement>('.el-dialog__footer .el-button--primary')!
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(clientOptions as any).mockResolvedValue({ data: OPTIONS })
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('PagePublishDialog — A5 发布目标端', () => {
  it('打开时加载端列表：渲染每端勾选项与渠道徽标，停用端置灰', async () => {
    const w = createWrapper()
    await flushPromises()

    expect(clientOptions).toHaveBeenCalled()
    const boxes = Array.from(document.querySelectorAll('.publish-target-clients .el-checkbox'))
    expect(boxes).toHaveLength(3)
    expect(boxes[0].textContent).toContain('平台端')
    expect(boxes[1].textContent).toContain('司机端')
    // 线框口径：端名旁展示已开通渠道徽标
    expect(boxes[1].textContent).toContain('H5')
    expect(boxes[1].textContent).toContain('MP')
    // 停用端（乘客端 status=0）置灰不可选并标注
    expect(clientCheckboxes()[2].disabled).toBe(true)
    expect(boxes[2].textContent).toContain('停用')
    w.unmount()
  })

  it('平台端(1) 缺省勾选', async () => {
    const w = createWrapper()
    await flushPromises()

    expect(clientCheckboxes()[0].checked).toBe(true)
    expect(clientCheckboxes()[1].checked).toBe(false)
    w.unmount()
  })

  it('确认发布：按勾选升序 emit clientIds 并关闭对话框', async () => {
    const w = createWrapper()
    await flushPromises()

    clientCheckboxes()[1].click() // 勾选司机端
    await flushPromises()
    confirmButton().click()
    await flushPromises()

    expect(w.emitted('confirm')?.[0]).toEqual([[1, 2]])
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
    w.unmount()
  })

  it('取消勾选平台端后确认：warning 阻断，不 emit confirm', async () => {
    const w = createWrapper()
    await flushPromises()

    clientCheckboxes()[0].click() // 取消缺省勾选 → 空选择
    await flushPromises()
    confirmButton().click()
    await flushPromises()

    expect(ElMessage.warning).toHaveBeenCalledWith('至少选择一个发布目标端')
    expect(w.emitted('confirm')).toBeUndefined()
    w.unmount()
  })
})
