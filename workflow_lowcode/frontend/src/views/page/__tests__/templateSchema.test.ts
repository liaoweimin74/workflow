// ----- TDD: 页面模板 schema 重映射算法（设计稿 docs/designs/page-template-remap.md） -----
// npx vitest run src/views/page/__tests__/templateSchema.test.ts

import { describe, it, expect } from 'vitest'
import {
  remapPageSchema,
  collectDsRefs,
  type PageSchema,
  type DsBinding,
} from '../templateSchema'

function baseSchema(): PageSchema {
  return {
    rule: [],
    option: {},
    dataSources: [
      { id: 'ds_a', refId: 'order_main', searchFields: ['status', 'amount'] },
      { id: 'ds_b', refId: 'order_detail', searchFields: [] },
    ],
    actions: [],
  }
}

const bindings: Record<string, DsBinding> = {
  ds_a: { id: 'ds_new1', refId: 'order_main', searchFields: ['status', 'amount'] },
  ds_b: { id: 'ds_new2', refId: 'order_detail', searchFields: [] },
}

describe('remapPageSchema — 结构性引用改写（D0–D3）', () => {
  it('D0：dataSources 按绑定重建（id/refId/searchFields 全取绑定值）', () => {
    const s = baseSchema()
    const rebinding: Record<string, DsBinding> = {
      ds_a: { id: 'ds_new1', refId: 'other_entity', searchFields: ['x'] },
      ds_b: { id: 'ds_new2', refId: 'order_detail', searchFields: [] },
    }
    const { schema } = remapPageSchema(s, rebinding)
    expect(schema.dataSources).toEqual([
      { id: 'ds_new1', refId: 'other_entity', searchFields: ['x'] },
      { id: 'ds_new2', refId: 'order_detail', searchFields: [] },
    ])
    expect(s.dataSources[0].id).toBe('ds_a') // 不修改入参
  })

  it('D1：嵌套子节点 props.dataSourceId 改写，空值不动，未知 id 置空并记 dangling', () => {
    const s = baseSchema()
    s.rule = [
      {
        type: 'group',
        children: [
          { type: 'page-table', field: 't1', props: { dataSourceId: 'ds_a' } },
          { type: 'page-detail', field: 'd1', props: { dataSourceId: 'ds_b' } },
          { type: 'page-chart', field: 'c1', props: { dataSourceId: '' } },
          { type: 'dataPicker', field: 'p1', props: { dataSourceId: 'ds_x' } },
        ],
      },
    ]
    const { schema, report } = remapPageSchema(s, bindings)
    const kids = schema.rule[0].children
    expect(kids[0].props.dataSourceId).toBe('ds_new1')
    expect(kids[1].props.dataSourceId).toBe('ds_new2')
    expect(kids[2].props.dataSourceId).toBe('')
    expect(kids[3].props.dataSourceId).toBe('') // 悬空引用 → 置空
    expect(report.some((r) => r.level === 'error' && r.kind === 'dangling' && r.value === 'ds_x')).toBe(true)
    expect(s.rule[0].children[0].props.dataSourceId).toBe('ds_a') // 入参未被修改
  })

  it('D1：容器嵌套载体（props.rule / props.columns[].rule）内的 dataSourceId 同样改写', () => {
    const s = baseSchema()
    s.rule = [
      {
        type: 'page-form',
        field: 'f1',
        props: {
          dataSourceId: 'ds_a',
          rule: [
            { type: 'FcInput', field: 'code', props: { dataSourceId: 'ds_a' } },
            {
              type: 'FcSubTable',
              field: 'items',
              props: {
                columns: [{ label: '产品', rule: [{ type: 'FcSelect', field: 'sku', props: { dataSourceId: 'ds_b' } }] }],
              },
            },
          ],
        },
      },
    ]
    const { schema } = remapPageSchema(s, bindings)
    const inner = schema.rule[0].props.rule
    expect(inner[0].props.dataSourceId).toBe('ds_new1')
    expect(inner[1].props.columns[0].rule[0].props.dataSourceId).toBe('ds_new2')
    const refs = collectDsRefs(s)
    expect(refs.filter((r) => r.value === 'ds_b' && r.path.includes('props.columns[0].rule'))).toHaveLength(1)
  })

  it('D1：数据容器自身的绑定与 props.rule 内的子组件一起改写', () => {
    const s = baseSchema()
    s.rule = [
      {
        type: 'page-data-container',
        field: 'dc1',
        props: {
          dataSourceId: 'ds_a',
          rule: [
            { type: 'div', native: true, children: ['共 {rows.length} 条'] },
            { type: 'dash-kpi', field: 'k1', props: { dataSourceId: 'ds_b' } },
          ],
        },
      },
    ]
    const { schema } = remapPageSchema(s, bindings)
    expect(schema.rule[0].props.dataSourceId).toBe('ds_new1')
    const kids = schema.rule[0].props.rule
    expect(kids[0].children).toEqual(['共 {rows.length} 条']) // 文案里的 {rows.x} 是语义引用，不参与改写
    expect(kids[1].props.dataSourceId).toBe('ds_new2')
  })

  it('D2：总线 actions 的 source 与 steps[].target 改写；未配置的 source 不动', () => {
    const s = baseSchema()
    s.actions = [
      {
        trigger: 'row-click',
        source: 'ds_a',
        steps: [
          { op: 'set-filter', target: 'ds_b', field: 'status', value: '{row.status}' },
          { op: 'refresh', target: 'ds_b' },
        ],
      },
      { trigger: 'field-change', steps: [{ op: 'save-record', target: '' }] },
    ]
    const { schema } = remapPageSchema(s, bindings)
    expect(schema.actions[0].source).toBe('ds_new1')
    expect(schema.actions[0].steps[0].target).toBe('ds_new2')
    expect(schema.actions[0].steps[0].field).toBe('status')
    expect(schema.actions[0].steps[0].value).toBe('{row.status}')
    expect(schema.actions[1].source).toBeUndefined()
    expect(schema.actions[1].steps[0].target).toBe('')
  })

  it('D3：三类链承载点的委托动作 params[key=target] 改写', () => {
    const s = baseSchema()
    s.rule = [
      {
        type: 'page-table',
        field: 't1',
        props: {
          dataSourceId: 'ds_a',
          viewEvents: [
            {
              trigger: 'row-click',
              target: 'table', // 组件内部子区域名，不参与重映射
              actions: [{ type: 'open-container', params: [{ key: 'target', value: 'ds_b' }] }],
            },
          ],
          viewActions: {
            buttons: [
              {
                key: 'b1',
                events: [
                  {
                    trigger: 'click',
                    actions: [{ type: 'load-record', params: [{ key: 'target', value: 'ds_b' }, { key: 'recordId', value: '$row.id' }] }],
                  },
                ],
              },
            ],
          },
          viewColumns: [
            {
              key: 'amount',
              onCellClick: {
                actions: [{ type: 'save-container', params: [{ key: 'target', value: 'ds_b' }] }],
              },
            },
          ],
        },
      },
    ]
    const { schema } = remapPageSchema(s, bindings)
    const p = schema.rule[0].props
    expect(p.viewEvents[0].target).toBe('table')
    expect(p.viewEvents[0].actions[0].params[0].value).toBe('ds_new2')
    expect(p.viewActions.buttons[0].events[0].actions[0].params[0].value).toBe('ds_new2')
    expect(p.viewActions.buttons[0].events[0].actions[0].params[1].value).toBe('$row.id')
    expect(p.viewColumns[0].onCellClick.actions[0].params[0].value).toBe('ds_new2')
  })

  it('D3：委托动作 target 留空（回退本组件数据源）不报错', () => {
    const s = baseSchema()
    s.rule = [
      {
        type: 'page-table',
        field: 't1',
        props: {
          dataSourceId: 'ds_a',
          viewEvents: [{ trigger: 'row-click', target: 'table', actions: [{ type: 'open-container', params: [{ key: 'target', value: '' }] }] }],
        },
      },
    ]
    const { schema, report } = remapPageSchema(s, bindings)
    expect(schema.rule[0].props.viewEvents[0].actions[0].params[0].value).toBe('')
    expect(report.filter((r) => r.level === 'error')).toHaveLength(0)
  })

  it('非委托动作的同名 target 参数恰为旧 ID：不改写，记 warn', () => {
    const s = baseSchema()
    s.rule = [
      {
        type: 'page-table',
        field: 't1',
        props: {
          viewEvents: [
            {
              trigger: 'row-click',
              target: 'table',
              actions: [{ type: 'set-filter', params: [{ key: 'target', value: 'ds_a' }] }],
            },
          ],
        },
      },
    ]
    const { schema, report } = remapPageSchema(s, bindings)
    expect(schema.rule[0].props.viewEvents[0].actions[0].params[0].value).toBe('ds_a')
    expect(report.some((r) => r.level === 'warn' && r.kind === 'target-like-id')).toBe(true)
  })

  it('脚本动作 params.source 含 api. 上下文引用：不改写，记 script-ref warn', () => {
    const s = baseSchema()
    s.rule = [
      {
        type: 'page-table',
        field: 't1',
        props: {
          viewEvents: [
            {
              trigger: 'row-click',
              target: 'table',
              actions: [
                {
                  type: 'script',
                  params: [{ key: 'source', value: 'api.refresh(); ds=api.dataSourceId' }],
                },
              ],
            },
          ],
        },
      },
    ]
    const { schema, report } = remapPageSchema(s, bindings)
    expect(schema.rule[0].props.viewEvents[0].actions[0].params[0].value).toContain('api.refresh')
    const warn = report.find((r) => r.kind === 'script-ref')
    expect(warn?.level).toBe('warn')
    expect(warn?.path).toContain('t1')
  })

  it('契约外动作类型：原样保留，记 unknown-op warn', () => {
    const s = baseSchema()
    s.rule = [
      {
        type: 'page-table',
        field: 't1',
        props: {
          viewEvents: [
            { trigger: 'row-click', target: 'table', actions: [{ type: 'legacy-thing', params: [] }] },
          ],
        },
      },
    ]
    const { schema, report } = remapPageSchema(s, bindings)
    expect(schema.rule[0].props.viewEvents[0].actions[0].type).toBe('legacy-thing')
    expect(report.some((r) => r.kind === 'unknown-op')).toBe(true)
  })

  it('缺绑定条目：数据源条目与其引用槽位均原样保留，记 error', () => {
    const s = baseSchema()
    s.rule = [{ type: 'page-table', field: 't1', props: { dataSourceId: 'ds_b' } }]
    const { schema, report } = remapPageSchema(s, {
      ds_a: { id: 'ds_new1', refId: 'order_main', searchFields: [] },
    })
    expect(schema.dataSources[1].id).toBe('ds_b')
    expect(schema.rule[0].props.dataSourceId).toBe('ds_b')
    expect(report.filter((r) => r.level === 'error' && r.kind === 'missing-binding').length).toBeGreaterThan(0)
  })

  it('总线 steps 值模板与字段引用不参与 ID 改写', () => {
    const s = baseSchema()
    s.actions = [
      {
        trigger: 'node-click',
        source: 'ds_a',
        steps: [{ op: 'set-filter', target: 'ds_b', field: 'ds_a', value: '{row.ds_a}' }],
      },
    ]
    const { schema } = remapPageSchema(s, bindings)
    expect(schema.actions[0].steps[0].field).toBe('ds_a') // 业务字段名恰为旧 ID：不动
    expect(schema.actions[0].steps[0].value).toBe('{row.ds_a}')
  })
})

describe('collectDsRefs — 只读引用扫描（悬空检查 / 删除级联复用）', () => {
  it('列出全部 ds 引用槽位；未知值标 dangling', () => {
    const s = baseSchema()
    s.rule = [
      {
        type: 'page-table',
        field: 't1',
        props: {
          dataSourceId: 'ds_a',
          viewEvents: [
            {
              trigger: 'row-click',
              target: 'table',
              actions: [{ type: 'open-container', params: [{ key: 'target', value: 'ds_ghost' }] }],
            },
          ],
        },
      },
    ]
    s.actions = [{ trigger: 'refresh', source: 'ds_b', steps: [{ op: 'close-container', target: 'ds_a' }] }]
    const refs = collectDsRefs(s)
    const known = new Set(s.dataSources.map((d) => d.id))
    expect(refs.filter((r) => !r.dangling).map((r) => r.value).sort()).toEqual(['ds_a', 'ds_a', 'ds_b'])
    const ghost = refs.find((r) => r.dangling)
    expect(ghost?.value).toBe('ds_ghost')
    expect(ghost?.path).toContain('t1')
    expect([...known]).toEqual(['ds_a', 'ds_b'])
  })

  it('删除组件级联场景：反查引用某容器的总线与链槽位', () => {
    const s = baseSchema()
    s.rule = [
      { type: 'page-table', field: 't1', props: { dataSourceId: 'ds_a' } },
      {
        type: 'page-form',
        field: 'f1',
        props: {
          dataSourceId: 'ds_b',
          viewEvents: [
            { trigger: 'save-success', target: 'form', actions: [{ type: 'refresh', params: [] }] },
          ],
        },
      },
    ]
    s.actions = [
      { trigger: 'row-create', source: 'ds_a', steps: [{ op: 'open-container', target: 'ds_b' }] },
    ]
    const refs = collectDsRefs(s)
    const pointingToB = refs.filter((r) => r.value === 'ds_b')
    expect(pointingToB).toHaveLength(2) // props.dataSourceId + 总线 steps.target
    expect(pointingToB.some((r) => r.path.includes('actions[0]'))).toBe(true)
  })
})
