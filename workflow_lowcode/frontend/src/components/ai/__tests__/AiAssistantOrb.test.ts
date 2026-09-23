import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import AiAssistantOrb from '../AiAssistantOrb.vue'
import { chat } from '@/api/ai'
import { aiActionBus } from '@/utils/aiActionBus'
import { useAiAssistantStore } from '@/stores/aiAssistantStore'

vi.mock('@/api/ai', () => ({ chat: vi.fn() }))

const { pushSpy } = vi.hoisted(() => ({ pushSpy: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'FormDesigner', path: '/form/designer' }),
  useRouter: () => ({ push: pushSpy }),
}))

let wrapper: VueWrapper | null = null
let handlers: any

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  aiActionBus.clear()
  pushSpy.mockReset()
  handlers = null
  vi.mocked(chat).mockReset()
  vi.mocked(chat).mockImplementation((_payload: any, h: any) => {
    handlers = h
    return { abort: vi.fn() } as any
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

function createWrapper() {
  wrapper = mount(AiAssistantOrb, { global: { plugins: [ElementPlus] } })
  return wrapper
}

describe('AiAssistantOrb', () => {
  it('可见时渲染悬浮球，隐藏后不渲染', async () => {
    const w = createWrapper()
    const store = useAiAssistantStore()
    await nextTick()
    expect(w.find('.ai-orb').exists()).toBe(true)

    store.setVisible(false)
    await nextTick()
    expect(w.find('.ai-orb').exists()).toBe(false)
  })

  it('发送后写入用户消息并携带上下文调用 chat', async () => {
    const w = createWrapper()
    const store = useAiAssistantStore()
    store.setContext({ route: 'form-designer', formId: 'f1' })
    const vm = w.vm as any

    vm.input = '生成请假单'
    vm.send()

    expect(store.messages[0]).toMatchObject({ role: 'user', content: '生成请假单' })
    expect(chat).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(chat).mock.calls[0][0] as any
    expect(payload.message).toBe('生成请假单')
    expect(payload.context.route).toBe('form-designer')
    expect(Array.isArray(payload.context.menus)).toBe(true)
  })

  it('form-designer 上下文下，表单工具结果自动派发回填', async () => {
    const w = createWrapper()
    const store = useAiAssistantStore()
    store.setContext({ route: 'form-designer', formId: 'f1' })
    const applied: unknown[] = []
    aiActionBus.on('applyFormSchema', (rule) => applied.push(rule))
    const vm = w.vm as any

    vm.input = '生成请假单'
    vm.send()
    handlers.onToolResult('generate_form_schema', {
      schema: '{"rule":[{"type":"input","field":"a","title":"A"}]}',
    })
    handlers.onMessage('已生成')

    expect(applied).toEqual([[{ type: 'input', field: 'a', title: 'A' }]])
    expect(store.messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: '已生成',
      formResult: { applied: true },
    })
  })

  it('非表单设计器上下文不派发，标记未应用', async () => {
    const w = createWrapper()
    const store = useAiAssistantStore()
    store.setContext({ route: 'dashboard' })
    const applied: unknown[] = []
    aiActionBus.on('applyFormSchema', (rule) => applied.push(rule))
    const vm = w.vm as any

    vm.input = 'x'
    vm.send()
    handlers.onToolResult('generate_form_schema', {
      schema: '{"rule":[{"type":"input","field":"a","title":"A"}]}',
    })
    handlers.onMessage('完成')

    expect(applied).toEqual([])
    expect(store.messages.at(-1)?.formResult).toEqual({ applied: false })
  })

  it('message 事件携带的页面入口渲染为可点击 tag 并可跳转', () => {
    const w = createWrapper()
    const store = useAiAssistantStore()
    const vm = w.vm as any

    vm.input = '怎么配置流程超时'
    vm.send()
    handlers.onMessage('去流程定义里配置', [{ path: '/process/definition', label: '流程定义' }])

    const message = store.messages.at(-1)
    expect(message?.navigations).toEqual([{ path: '/process/definition', label: '流程定义' }])

    vm.navigate(message!.navigations![0].path)
    expect(pushSpy).toHaveBeenCalledWith('/process/definition')
  })

  it('正文已内联链接的页面不在底部重复出现', () => {
    const w = createWrapper()
    const store = useAiAssistantStore()
    const vm = w.vm as any

    vm.input = '怎么添加用户'
    vm.send()
    handlers.onMessage('请到 [用户管理](/system/user) 页面添加', [
      { path: '/system/user', label: '用户管理' },
    ])

    expect(store.messages.at(-1)?.navigations).toBeUndefined()
  })

  it('已在目标页时不重复跳转', () => {
    const w = createWrapper()
    const vm = w.vm as any

    vm.navigate('/form/designer')

    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('错误时写入提示并复位发送状态', async () => {
    const w = createWrapper()
    const store = useAiAssistantStore()
    const vm = w.vm as any

    vm.input = 'x'
    vm.send()
    expect(vm.sending).toBe(true)

    handlers.onError({ code: 'CONFIG_MISSING', msg: 'AI 服务未配置' })

    expect(vm.sending).toBe(false)
    expect(store.messages.at(-1)?.content).toContain('AI 服务未配置')
  })

  it('清空对话', () => {
    const w = createWrapper()
    const store = useAiAssistantStore()
    store.addMessage('user', 'a')
    const vm = w.vm as any

    vm.handleClear()

    expect(store.messages).toHaveLength(0)
  })
})
