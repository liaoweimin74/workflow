// ----- 动作与事件统一清单：能力元数据与配置入口过滤规则 -----
// npx vitest run src/types/__tests__/pageActionCatalog.test.ts

import { describe, it, expect } from 'vitest'
import {
  BUS_OPS,
  CHAIN_ACTIONS,
  chainParamKeyOptions,
  chainParamOptions,
  syncActionParams,
  busOpOptions,
  busStepFields,
  busTriggerOptions,
  chainActionOptions,
  chainParamKind,
  chainTriggerLabel,
  chainTriggerOptions,
  CHAIN_TABLE_ONLY_TRIGGERS,
} from '../pageActionCatalog'

describe('总线动作清单（体系 A）', () => {
  it('busOpOptions 仅含 configurable 项，set-value 暂无配置入口', () => {
    const values = busOpOptions().map((o) => o.value)
    expect(values).toContain('set-filter')
    expect(values).toContain('close-container')
    expect(values).not.toContain('set-value')
    expect(BUS_OPS.find((o) => o.value === 'set-value')?.configurable).toBe(false)
  })

  it('busStepFields 决定参数输入框：set-filter 出 field/value，容器类仅 target', () => {
    expect(busStepFields('set-filter')).toEqual(['target', 'field', 'value'])
    expect(busStepFields('reload-record')).toEqual(['target', 'value'])
    expect(busStepFields('load-record')).toEqual(['target', 'recordId'])
    expect(busStepFields('open-container')).toEqual(['target'])
  })

  it('触发器候选与清单同序且无重复', () => {
    const values = busTriggerOptions().map((o) => o.value)
    expect(values).toEqual([...new Set(values)])
    expect(values).toContain('node-click')
    expect(values).toContain('record-change')
  })

  it('每个 op 的 fields 必含 target（执行器缺 target 直接跳过）', () => {
    for (const op of BUS_OPS) {
      expect(op.fields).toContain('target')
    }
  })
})

describe('组件级动作清单（体系 B）', () => {
  it('容器动作经宿主总线执行：按钮/事件入口可选，列点击入口不提供', () => {
    const containerOps = ['open-container', 'close-container', 'load-record', 'save-container']
    for (const op of containerOps) {
      expect(chainActionOptions('button').map((o) => o.value)).toContain(op)
      expect(chainActionOptions('event').map((o) => o.value)).toContain(op)
      expect(chainActionOptions('cell').map((o) => o.value)).not.toContain(op)
    }
  })

  it('未接线的动作不出现在任何配置入口', () => {
    for (const consumer of ['button', 'event', 'cell'] as const) {
      const values = chainActionOptions(consumer).map((o) => o.value)
      expect(values).not.toContain('new-record')
    }
    expect(CHAIN_ACTIONS.find((a) => a.value === 'new-record')?.renderers).toEqual([])
  })

  it('入口差异：open-link 仅按钮/列，set-page 仅事件/列，edit 仅列', () => {
    const button = chainActionOptions('button').map((o) => o.value)
    const event = chainActionOptions('event').map((o) => o.value)
    const cell = chainActionOptions('cell').map((o) => o.value)
    expect(button).toContain('open-link')
    expect(event).not.toContain('open-link')
    expect(event).toContain('set-page')
    expect(button).not.toContain('set-page')
    expect(cell).toContain('edit')
    expect(button).not.toContain('edit')
  })

  it('cards 渲染器未实现的分页/排序/清空只在表格生效（能力差异有据可查）', () => {
    const tableOnly = CHAIN_ACTIONS.filter(
      (a) => a.renderers.length > 0 && !a.renderers.includes('cards'),
    ).map((a) => a.value)
    expect(tableOnly).toEqual(['set-page', 'set-sort', 'clear-selection'])
  })

  it('清单内不重复登记动作', () => {
    const values = CHAIN_ACTIONS.map((a) => a.value)
    expect(values).toEqual([...new Set(values)])
  })

  it('触发器按模式过滤，被过滤项仍可取标签', () => {
    const card = chainTriggerOptions('card').map((t) => t.value)
    expect(card).not.toContain('cell-click')
    expect(CHAIN_TABLE_ONLY_TRIGGERS.has('selection-change')).toBe(true)
    expect(chainTriggerLabel('cell-click')).toBe('单元格点击')
    expect(chainTriggerLabel('unknown-trigger')).toBe('unknown-trigger')
  })
})

describe('参数值输入形态（chainParamKind）', () => {
  it('script 动作的 source 为脚本形态，同动作其他参数回落文本', () => {
    expect(chainParamKind('script', 'source')).toBe('script')
    expect(chainParamKind('script', 'other')).toBe('free')
  })

  it('未标注 paramKinds 的动作一律 free（不改变既有控件）', () => {
    expect(chainParamKind('message', 'text')).toBe('free')
    expect(chainParamKind('message', 'type')).toBe('free')
    expect(chainParamKind('open-container', 'target')).toBe('free')
  })

  it('paramKinds 的键必须属于该动作的 paramKeys（防元数据漂移）', () => {
    for (const a of CHAIN_ACTIONS) {
      for (const k of Object.keys(a.paramKinds || {})) {
        expect(a.paramKeys, `${a.value}.${k}`).toContain(k)
      }
    }
  })
})

describe('参数值候选（chainParamOptions）', () => {
  it('枚举参数给固定候选：message.type 与 set-sort.order', () => {
    expect(chainParamOptions('message', 'type')).toEqual(['info', 'success', 'warning', 'error'])
    expect(chainParamOptions('set-sort', 'order')).toEqual(['ascending', 'descending'])
  })

  it('未标注候选的参数返回空（仍为自由输入）', () => {
    expect(chainParamOptions('message', 'text')).toEqual([])
    expect(chainParamOptions('set-page', 'page')).toEqual([])
    expect(chainParamOptions('unknown-action', 'type')).toEqual([])
  })

  it('paramOptions 的键必须属于该动作的 paramKeys（防元数据漂移）', () => {
    for (const a of CHAIN_ACTIONS) {
      for (const k of Object.keys(a.paramOptions || {})) {
        expect(a.paramKeys, `${a.value}.${k}`).toContain(k)
        expect(a.paramOptions?.[k]?.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('切换动作类型补齐约定参数（syncActionParams）', () => {
  it('声明了 paramKeys 的动作：按声明顺序生成空值参数行', () => {
    expect(syncActionParams('script')).toEqual([{ key: 'source', value: '' }])
    expect(syncActionParams('message')).toEqual([
      { key: 'text', value: '' },
      { key: 'type', value: '' },
    ])
  })

  it('同名参数保留已填值（切走再切回不丢脚本）', () => {
    const existing = [{ key: 'source', value: 'actions.refresh()' }]
    expect(syncActionParams('script', existing)).toEqual(existing)
  })

  it('未声明 paramKeys 的动作原样返回（set-filter 参数名即过滤字段，不能清空）', () => {
    const existing = [{ key: 'status', value: '$row.status' }]
    expect(syncActionParams('set-filter', existing)).toEqual(existing)
    expect(syncActionParams('refresh', [])).toEqual([])
  })

  it('用户自加的约定外参数保留在末尾，不被覆盖丢失', () => {
    const next = syncActionParams('message', [{ key: 'extra', value: 'x' }])
    expect(next.map((p) => p.key)).toEqual(['text', 'type', 'extra'])
    expect(next[2].value).toBe('x')
  })

  it('约定外但值为空的参数行丢弃（切类型不留上一个动作的自动空行）', () => {
    const next = syncActionParams('script', [
      { key: 'text', value: '' },
      { key: 'type', value: '' },
    ])
    expect(next).toEqual([{ key: 'source', value: '' }])
  })

  it('丢弃未填参数名的空占位行', () => {
    expect(syncActionParams('script', [{ key: '', value: '残留值' }])).toEqual([{ key: 'source', value: '' }])
  })
})

describe('参数名候选（chainParamKeyOptions）', () => {
  it('返回该动作约定的参数名，供下拉选择', () => {
    expect(chainParamKeyOptions('script')).toEqual(['source'])
    expect(chainParamKeyOptions('load-record')).toEqual(['target', 'recordId'])
  })

  it('无约定参数的动作候选为空（仍可自由输入过滤字段名）', () => {
    expect(chainParamKeyOptions('set-filter')).toEqual([])
    expect(chainParamKeyOptions('unknown-action')).toEqual([])
  })
})
