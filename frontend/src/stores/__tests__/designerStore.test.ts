import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDesignerStore, PROCESS_CONFIG_KEY, DEFAULT_PROCESS_CONFIG, type ProcessConfigData, type NodeConfigData, type BackendLogicItem } from '../designerStore'

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
    const parsed = JSON.parse(store.nodeConfigs[PROCESS_CONFIG_KEY])
    expect(parsed.approvalPolicy).toBeDefined()
    expect(parsed.numberRule).toBeDefined()
  })

  it('backendLogic 序列化读写往返', () => {
    const store = useDesignerStore()
    const logic: BackendLogicItem = {
      id: 'l1', name: '同步订单', enabled: true,
      trigger: 'ENTER', type: 'http',
      errorAction: 'IGNORE_CONTINUE', resultVar: 'orderStatus',
      http: { url: 'https://ex/api', method: 'POST', bodyParams: [{ source: 'orderId', target: 'id' }] },
    }
    const cfg: NodeConfigData = { backendLogic: [logic] }
    store.setNodeConfig('UserTask_1', cfg)
    const back = store.getNodeConfig('UserTask_1')
    expect(back?.backendLogic?.[0].http?.url).toBe('https://ex/api')
    expect(back?.backendLogic?.[0].trigger).toBe('ENTER')
  })
})
