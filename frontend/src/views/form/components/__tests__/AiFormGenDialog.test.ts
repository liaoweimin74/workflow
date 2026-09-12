import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { nextTick } from 'vue'
import AiFormGenDialog from '../AiFormGenDialog.vue'
import { generateForm } from '@/api/ai'

vi.mock('@/api/ai', () => ({
  generateForm: vi.fn(),
}))

let wrapper: VueWrapper | null = null

function createWrapper() {
  wrapper = mount(AiFormGenDialog, {
    props: { modelValue: true },
    global: { plugins: [ElementPlus] },
  })
  return wrapper
}

/** el-dialog 使用 append-to-body，内容在 document.body 中 */
function bodyText(): string {
  return document.body.textContent ?? ''
}

function bodyButton(label: string): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.includes(label))
}

describe('AiFormGenDialog', () => {
  let handlers: any
  let abortSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    handlers = null
    abortSpy = vi.fn()
    vi.mocked(generateForm).mockReset()
    vi.mocked(generateForm).mockImplementation((_description: string, h: any) => {
      handlers = h
      return { abort: abortSpy } as any
    })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
  })

  it('空描述不发起请求', async () => {
    const w = createWrapper()
    const vm = w.vm as any
    vm.description = '   '
    vm.handleGenerate()
    await nextTick()

    expect(generateForm).not.toHaveBeenCalled()
    expect(vm.status).toBe('idle')
  })

  it('流式增量更新预览，done 后进入可应用状态', async () => {
    const w = createWrapper()
    const vm = w.vm as any
    vm.description = '请假单'
    vm.handleGenerate()

    expect(vm.status).toBe('generating')
    handlers.onDelta('{"rule":')
    handlers.onDelta('[]}')
    await nextTick()
    expect(vm.previewJson).toContain('"rule"')

    handlers.onDone({
      schema: '{"rule":[]}',
      fields: [{ field: 'a', title: 'A', componentType: 'input' }],
      warnings: ['x'],
    })
    await nextTick()

    expect(vm.status).toBe('done')
    expect(vm.fields).toHaveLength(1)
    expect(vm.warnings).toEqual(['x'])
  })

  it('应用时 emit apply 并解析出 rule 数组', async () => {
    const w = createWrapper()
    const vm = w.vm as any
    vm.description = '请假单'
    vm.handleGenerate()
    handlers.onDone({
      schema: '{"rule":[{"type":"input","field":"a","title":"A"}]}',
      fields: [],
      warnings: [],
    })
    await nextTick()

    vm.handleApply()

    const emitted = w.emitted('apply')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toEqual([{ type: 'input', field: 'a', title: 'A' }])
    expect(w.emitted('update:modelValue')?.at(-1)?.[0]).toBe(false)
  })

  it('error 事件进入错误态并展示提示', async () => {
    const w = createWrapper()
    const vm = w.vm as any
    vm.description = '请假单'
    vm.handleGenerate()

    handlers.onError({ code: 'CONFIG_MISSING', msg: 'AI 服务未配置' })
    await nextTick()

    expect(vm.status).toBe('error')
    expect(vm.errorMsg).toBe('AI 服务未配置')
    expect(bodyText()).toContain('AI 服务未配置')
    expect(bodyButton('重试')).toBeTruthy()
  })

  it('生成中禁用应用到设计器按钮', async () => {
    const w = createWrapper()
    const vm = w.vm as any
    vm.description = '请假单'
    vm.handleGenerate()
    await nextTick()

    const applyBtn = bodyButton('应用到设计器')
    expect(applyBtn).toBeTruthy()
    expect(applyBtn!.disabled).toBe(true)
  })
})
