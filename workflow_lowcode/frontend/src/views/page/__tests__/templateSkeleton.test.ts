// ----- TDD: 骨架模板化 skeletonizePageSchema（保留槽位与联动拓扑，清空数据语义） -----
// npx vitest run src/views/page/__tests__/templateSkeleton.test.ts

import { describe, it, expect } from 'vitest'
import { skeletonizePageSchema } from '../templateSkeleton'
import type { PageSchema } from '../templateSchema'

function baseSchema(): PageSchema {
  return {
    rule: [],
    option: {},
    dataSources: [
      { id: 'ds_tree', refId: 'org_tree', searchFields: ['name'] },
      { id: 'ds_table', refId: 'emp_list', searchFields: ['status'] },
    ],
    actions: [],
  }
}

/** 左树右表样例：树 + 表 + node-click → set-filter 联动 */
function treeTableSchema(): PageSchema {
  const s = baseSchema()
  s.rule = [
    {
      type: 'page-tree',
      field: 'tree1',
      props: {
        dataSourceId: 'ds_tree',
        'node-key': 'parentId',
        props: { label: 'orgName', children: 'subList' },
        highlightCurrent: true,
      },
    },
    {
      type: 'page-table',
      field: 'table1',
      props: {
        dataSourceId: 'ds_table',
        columns: [
          { key: 'name', label: '姓名' },
          { key: 'amount', label: '金额', onCellClick: { actions: [{ type: 'message', params: [{ key: 'text', value: 'ok' }, { key: 'type', value: 'info' }] }] } },
        ],
        sortableFields: ['name', 'amount'],
        searchFields: [{ key: 'status' }],
        pagination: true,
        viewActions: {
          buttons: [
            { key: 'b1', label: '编辑', visible: "$row.status === 'PENDING'", events: [{ trigger: 'click', actions: [{ type: 'load-record', params: [{ key: 'target', value: 'ds_table' }, { key: 'recordId', value: '$row.id' }] }] }] },
            { key: 'b2', label: '刷新' },
          ],
          permissions: 'page:edit',
        },
        viewEvents: [
          { trigger: 'row-click', target: 'table', actions: [{ type: 'set-filter', params: [{ key: 'deptId', value: '$row.id' }] }] },
        ],
      },
    },
  ]
  s.actions = [
    {
      trigger: 'node-click',
      source: 'ds_tree',
      steps: [
        { op: 'set-filter', target: 'ds_table', field: 'parentId', value: '{node.id}' },
        { op: 'refresh', target: 'ds_table' },
        { op: 'load-record', target: 'ds_table', recordId: '{node.id}' },
      ],
    },
  ]
  return s
}

describe('skeletonizePageSchema — 数据源槽位化', () => {
  it('refId/searchFields 清空，label 由引用组件自动生成', () => {
    const s = treeTableSchema()
    const schema = skeletonizePageSchema(s)
    expect(schema.dataSources).toHaveLength(2)
    const tree = schema.dataSources.find((d) => d.id === 'ds_tree')!
    const table = schema.dataSources.find((d) => d.id === 'ds_table')!
    expect(tree.refId).toBe('')
    expect(tree.searchFields).toEqual([])
    expect(tree.label).toContain('page-tree#tree1')
    expect(table.refId).toBe('')
    expect(table.label).toContain('page-table#table1')
    expect(s.dataSources[0].refId).toBe('org_tree') // 纯函数：入参未改
  })

  it('label 默认取数据源条目 name；用户指定的锚点名优先', () => {
    const s = treeTableSchema()
    s.dataSources[0].name = '组织机构树'
    const schema = skeletonizePageSchema(s)
    expect(schema.dataSources[0].label).toBe('组织机构树')
    expect(schema.dataSources[1].label).toContain('page-table#table1') // 无 name 的回退组件标签

    const overridden = skeletonizePageSchema(s, { ds_tree: '左树', ds_table: '右表' })
    expect(overridden.dataSources[0].label).toBe('左树')
    expect(overridden.dataSources[1].label).toBe('右表')
  })
})

describe('skeletonizePageSchema — 组件数据语义清空', () => {
  it('page-table：columns/sortableFields/searchFields 清空，布局属性保留', () => {
    const s = treeTableSchema()
    const schema = skeletonizePageSchema(s)
    const p = schema.rule[1].props
    expect(p.columns).toEqual([])
    expect(p.sortableFields).toEqual([])
    expect(p.searchFields).toEqual([])
    expect(p.pagination).toBe(true)
    expect(p.dataSourceId).toBe('ds_table') // 槽位引用保留
  })

  it('page-tree：node-key 与 label/children 映射重置为默认', () => {
    const s = treeTableSchema()
    const schema = skeletonizePageSchema(s)
    const p = schema.rule[0].props
    expect(p['node-key']).toBe('id')
    expect(p.props).toEqual({ label: 'name', children: 'children' })
    expect(p.highlightCurrent).toBe(true)
  })

  it('操作按钮保留（标签/结构），visible 表达式清空', () => {
    const s = treeTableSchema()
    const schema = skeletonizePageSchema(s)
    const btns = schema.rule[1].props.viewActions.buttons
    expect(btns).toHaveLength(2)
    expect(btns[0].label).toBe('编辑')
    expect(btns[0].visible).toBe('')
    expect(schema.rule[1].props.viewActions.permissions).toBe('page:edit')
  })

  it('未知组件类型的 props 原样保留', () => {
    const s = baseSchema()
    s.rule = [{ type: 'page-iframe', field: 'f1', props: { url: 'https://x', height: '360px' } }]
    const schema = skeletonizePageSchema(s)
    expect(schema.rule[0].props.url).toBe('https://x')
  })

  it('formContainer 的字段组件（props.rule）清空，容器壳保留', () => {
    const s = baseSchema()
    s.rule = [
      {
        type: 'formContainer',
        props: { dataSourceId: 'ds_table', rule: [{ type: 'input', field: 'name' }] },
      },
    ]
    const schema = skeletonizePageSchema(s)
    expect(schema.rule[0].props.rule).toEqual([])
    expect(schema.rule[0].props.dataSourceId).toBe('ds_table')
  })
})

describe('skeletonizePageSchema — 联动拓扑保留', () => {
  it('总线：trigger/source/steps 的 op/target 保留；数据语义参数清空', () => {
    const s = treeTableSchema()
    const schema = skeletonizePageSchema(s)
    const a = schema.actions[0]
    expect(a.trigger).toBe('node-click')
    expect(a.source).toBe('ds_tree')
    expect(a.steps[0].op).toBe('set-filter')
    expect(a.steps[0].target).toBe('ds_table')
    expect(a.steps[0].field).toBeUndefined()
    expect(a.steps[0].value).toBeUndefined()
    expect(a.steps[1]).toEqual({ op: 'refresh', target: 'ds_table' }) // 无数据语义的 step 原样
    expect(a.steps[2].target).toBe('ds_table')
    expect(a.steps[2].recordId).toBeUndefined()
  })

  it('链动作：set-filter 参数全清；load-record 保留 target 清 recordId；open-container 保留 target', () => {
    const s = treeTableSchema()
    const schema = skeletonizePageSchema(s)
    const p = schema.rule[1].props
    expect(p.viewEvents[0].trigger).toBe('row-click')
    expect(p.viewEvents[0].actions[0].type).toBe('set-filter')
    expect(p.viewEvents[0].actions[0].params).toEqual([])
    const btnActions = p.viewActions.buttons[0].events[0].actions
    expect(btnActions[0].type).toBe('load-record')
    expect(btnActions[0].params).toEqual([{ key: 'target', value: 'ds_table' }])
  })

  it('message 的展示参数（text/type）保留；脚本动作 source 清空', () => {
    const s = baseSchema()
    s.rule = [
      {
        type: 'page-table',
        field: 't1',
        props: {
          viewEvents: [
            {
              trigger: 'cell-click',
              target: 'table',
              actions: [
                { type: 'message', params: [{ key: 'text', value: '已选中' }, { key: 'type', value: 'info' }] },
                { type: 'script', params: [{ key: 'source', value: 'api.refresh()' }] },
                { type: 'open-link', params: [{ key: 'url', value: '/x?id=$row.id' }] },
                { type: 'set-sort', params: [{ key: 'field', value: 'name' }, { key: 'order', value: 'asc' }] },
                { type: 'legacy-thing', params: [{ key: 'field', value: 'keep' }] },
              ],
            },
          ],
        },
      },
    ]
    const schema = skeletonizePageSchema(s)
    const acts = schema.rule[0].props.viewEvents[0].actions
    expect(acts[0].params).toEqual([{ key: 'text', value: '已选中' }, { key: 'type', value: 'info' }])
    expect(acts[1].params).toEqual([])
    expect(acts[2].params).toEqual([]) // url 内嵌 $row 字段 → 清
    expect(acts[3].params).toEqual([{ key: 'order', value: 'asc' }]) // field 清，order 留
    expect(acts[4].params).toEqual([{ key: 'field', value: 'keep' }]) // 契约外动作原样
  })

  it('嵌套 children 内组件同样清空', () => {
    const s = treeTableSchema()
    s.rule = [{ type: 'group', children: [...s.rule] }]
    const schema = skeletonizePageSchema(s)
    const kids = schema.rule[0].children
    expect(kids[0].props['node-key']).toBe('id')
    expect(kids[1].props.columns).toEqual([])
  })
})
