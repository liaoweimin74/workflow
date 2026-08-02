import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDesignerStore, PROCESS_CONFIG_KEY, DEFAULT_PROCESS_CONFIG, type ProcessConfigData } from '../designerStore'

describe('designerStore — 流程配置', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('getProcessConfig 返回默认值当未配置时', () => {
    const store = useDesignerStore()
    const config = store.getProcessConfig()
    expect(config).toEqual(DEFAULT_PROCESS_CONFIG)
  })

  it('setProcessConfig 写入后 getProcessConfig 读回相同值', () => {
    const store = useDesignerStore()
    const custom: ProcessConfigData = {
      ...DEFAULT_PROCESS_CONFIG,
      name: '请假流程',
      categoryId: 'cat-1',
      approvalPolicy: {
        ...DEFAULT_PROCESS_CONFIG.approvalPolicy,
        deduplication: {
          ...DEFAULT_PROCESS_CONFIG.approvalPolicy.deduplication,
          enabled: true,
          scope: 'GLOBAL',
          action: 'SKIP',
        },
      },
    }
    store.setProcessConfig(custom)
    expect(store.getProcessConfig()).toEqual(custom)
  })

  it('setProcessConfig 写入 nodeConfigs 的 __PROCESS__ key', () => {
    const store = useDesignerStore()
    store.setProcessConfig(DEFAULT_PROCESS_CONFIG)
    expect(store.nodeConfigs[PROCESS_CONFIG_KEY]).toBeDefined()
    expect(JSON.parse(store.nodeConfigs[PROCESS_CONFIG_KEY]).name).toBe('')
  })
})
