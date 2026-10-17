// ----- 动作链参数上下文注册表（PageDesigner 注入容器 target 候选与行字段） -----
// npx vitest run src/views/page/components/__tests__/chainParamContext.test.ts

import { describe, it, expect, afterEach } from 'vitest'
import { getChainParamContext, setChainParamContextProvider, resetChainParamContextProvider } from '../chainParamContext'

afterEach(() => {
  resetChainParamContextProvider()
})

describe('chainParamContext', () => {
  it('未注册 provider 时返回空候选', () => {
    expect(getChainParamContext()).toEqual({ containerTargets: [], rowFields: [] })
  })

  it('注册后返回容器 target 候选与行字段', () => {
    setChainParamContextProvider(() => ({
      containerTargets: [{ value: 'ds_a', label: '订单表（ds_a）' }],
      rowFields: ['status', 'amount'],
    }))
    expect(getChainParamContext()).toEqual({
      containerTargets: [{ value: 'ds_a', label: '订单表（ds_a）' }],
      rowFields: ['status', 'amount'],
    })
  })

  it('provider 抛错按空候选兜底（不阻塞配置面板渲染）', () => {
    setChainParamContextProvider(() => {
      throw new Error('designer not ready')
    })
    expect(getChainParamContext()).toEqual({ containerTargets: [], rowFields: [] })
  })
})
