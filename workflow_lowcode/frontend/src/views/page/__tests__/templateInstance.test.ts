// ----- TDD: 模板实例化（buildTemplateInstance：ID 生成 + remap + 重绑降级） -----
// npx vitest run src/views/page/__tests__/templateInstance.test.ts

import { describe, it, expect } from 'vitest'
import { buildTemplateInstance } from '../templateInstance'
import type { PageSchema } from '../templateSchema'

function templateSchema(): PageSchema {
  return {
    rule: [
      {
        type: 'page-table',
        field: 't1',
        props: {
          dataSourceId: 'ds_a',
          viewActions: {
            buttons: [
              {
                key: 'b1',
                events: [
                  {
                    trigger: 'click',
                    actions: [{ type: 'open-container', params: [{ key: 'target', value: 'ds_b' }] }],
                  },
                ],
              },
            ],
          },
        },
      },
      { type: 'page-form', field: 'f1', props: { dataSourceId: 'ds_b' } },
    ],
    option: {},
    dataSources: [
      { id: 'ds_a', refId: 'ref_order', searchFields: ['status'] },
      { id: 'ds_b', refId: 'ref_order', searchFields: [] },
    ],
    actions: [{ trigger: 'row-click', source: 'ds_a', steps: [{ op: 'set-filter', target: 'ds_b', field: 'status', value: '{row.status}' }] }],
  }
}

describe('buildTemplateInstance — 实例化（同项目，refId 不变）', () => {
  it('生成全新 ds ID 并重写全部引用，refId/searchFields 原样保留', () => {
    const res = buildTemplateInstance(templateSchema(), undefined, 1000)
    const ids = res.schema.dataSources.map((d) => d.id)
    expect(ids).toEqual(['ds_rs', 'ds_rs1']) // 36 进制 base + 序号（同毫秒不碰撞）
    expect(res.schema.dataSources[0].refId).toBe('ref_order')
    expect(res.schema.dataSources[0].searchFields).toEqual(['status'])
    expect(res.schema.rule[0].props.dataSourceId).toBe('ds_rs')
    expect(res.schema.rule[1].props.dataSourceId).toBe('ds_rs1')
    expect(res.schema.actions[0].source).toBe('ds_rs')
    expect(res.schema.actions[0].steps[0].target).toBe('ds_rs1')
    expect(res.idMap).toEqual({ ds_a: 'ds_rs', ds_b: 'ds_rs1' })
    expect(res.report).toEqual([])
  })

  it('空 dataSources 模板：直通返回，无副作用', () => {
    const empty: PageSchema = { rule: [{ type: 'page-iframe', field: 'i1', props: {} }], option: {}, dataSources: [], actions: [] }
    const res = buildTemplateInstance(empty, undefined, 1000)
    expect(res.schema.rule[0].props).toEqual({})
    expect(res.idMap).toEqual({})
  })

  it('候选 ID 与模板既有字符串冲突 → 递增避让', () => {
    const s = templateSchema()
    s.rule[0].props.columns = [{ key: 'ds_rs' }] // 业务列名恰为候选 ID
    const res = buildTemplateInstance(s, undefined, 1000)
    expect(res.schema.dataSources[0].id).toBe('ds_rs1') // ds_rs 被业务列名占用 → 递增避让
    expect(res.schema.dataSources[1].id).toBe('ds_rs2')
  })
})

describe('buildTemplateInstance — 导入重绑（refId 变更）', () => {
  it('refId 改绑且未提供 searchFields → 置空并记 warn（发布白名单校验兼容）', () => {
    const res = buildTemplateInstance(templateSchema(), { ds_a: { refId: 'ref_new' } }, 1000)
    expect(res.schema.dataSources[0].refId).toBe('ref_new')
    expect(res.schema.dataSources[0].searchFields).toEqual([])
    expect(res.warnings.some((w) => w.includes('白名单'))).toBe(true)
    // 未重绑的条目保持原样
    expect(res.schema.dataSources[1].refId).toBe('ref_order')
  })

  it('重绑同时提供 searchFields → 采用提供值，不告警', () => {
    const res = buildTemplateInstance(templateSchema(), { ds_a: { refId: 'ref_new', searchFields: ['state'] } }, 1000)
    expect(res.schema.dataSources[0].searchFields).toEqual(['state'])
    expect(res.warnings).toEqual([])
  })

  it('重绑不存在的旧 ds ID → 记 error 报告，其余条目正常', () => {
    const res = buildTemplateInstance(templateSchema(), { ds_ghost: { refId: 'x' } }, 1000)
    expect(res.report.some((r) => r.level === 'error' && r.kind === 'unknown-rebind')).toBe(true)
    expect(res.schema.dataSources).toHaveLength(2)
  })
})
