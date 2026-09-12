import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAiAssistantStore } from '../aiAssistantStore'

describe('aiAssistantStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('默认显示（未存过偏好）', () => {
    const store = useAiAssistantStore()
    expect(store.visible).toBe(true)
  })

  it('存过 0 时默认隐藏', () => {
    localStorage.setItem('ai_assistant_visible', '0')
    const store = useAiAssistantStore()
    expect(store.visible).toBe(false)
  })

  it('toggle 切换并持久化偏好', () => {
    const store = useAiAssistantStore()
    store.toggle()
    expect(store.visible).toBe(false)
    expect(localStorage.getItem('ai_assistant_visible')).toBe('0')

    store.toggle()
    expect(store.visible).toBe(true)
    expect(localStorage.getItem('ai_assistant_visible')).toBe('1')
  })

  it('addMessage / clear / setContext', () => {
    const store = useAiAssistantStore()
    store.addMessage('user', '你好')
    store.addMessage('assistant', '已生成', { applied: true })
    expect(store.messages).toHaveLength(2)
    expect(store.messages[1].formResult).toEqual({ applied: true })

    store.setContext({ route: 'form-designer' })
    expect(store.context).toEqual({ route: 'form-designer' })

    store.clear()
    expect(store.messages).toHaveLength(0)
  })
})
