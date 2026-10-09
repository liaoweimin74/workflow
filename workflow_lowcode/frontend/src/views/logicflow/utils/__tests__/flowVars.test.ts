/**
 * flowVars 变量收集单测：重点覆盖「隐式整体输出」条目
 * （未声明 results 的执行型祖先节点 → 变量名 = 节点 id，与引擎隐式约定对齐）。
 */
import { describe, expect, it } from 'vitest'
import { collectAvailableVars, EXEC_NODE_TYPES, varInsertText } from '../flowVars'
import type { FormFieldGroupLike, VarEdgeLike, VarNodeLike } from '../flowVars'
import type { InputVarDef, ResultVarDef } from '../dsl'

function node(id: string, nodeType: string, name?: string, results?: ResultVarDef[]): VarNodeLike {
  return { id, data: { nodeType, name: name ?? id, results } }
}

function edge(source: string, target: string, loop = false): VarEdgeLike {
  return { source, target, data: loop ? { loop: true } : null }
}

const NO_INPUT: InputVarDef[] = []

describe('EXEC_NODE_TYPES', () => {
  it('包含全部执行型节点（与引擎 NodeType 一致）', () => {
    for (const t of ['HTTP', 'BEAN', 'SCRIPT', 'CONDITION', 'BATCH', 'SUBFLOW', 'DATA_UPDATE']) {
      expect(EXEC_NODE_TYPES.has(t)).toBe(true)
    }
    expect(EXEC_NODE_TYPES.has('START')).toBe(false)
    expect(EXEC_NODE_TYPES.has('END')).toBe(false)
  })
})

describe('collectAvailableVars · 隐式整体输出', () => {
  it('未声明 results 的 HTTP 祖先 → upstream 列出节点 id 条目', () => {
    const nodes = [
      node('start', 'START', '开始'),
      node('http_abc', 'HTTP', '查询订单'),
      node('script_1', 'SCRIPT', '处理'),
    ]
    const edges = [edge('start', 'http_abc'), edge('http_abc', 'script_1')]

    const vars = collectAvailableVars('script_1', nodes, edges, NO_INPUT)

    const implicit = vars.find((v) => v.name === 'http_abc')
    expect(implicit).toBeDefined()
    expect(implicit!.group).toBe('upstream')
    expect(implicit!.detail).toContain('自动整体输出')
    expect(implicit!.detail).toContain('查询订单')
  })

  it('已声明 results 的 SCRIPT 祖先 → 只列声明名，不再列节点 id', () => {
    const results: ResultVarDef[] = [{ name: 'sum', mode: 'WHOLE', type: 'number' }]
    const nodes = [node('sc_1', 'SCRIPT', '计算', results), node('sc_2', 'SCRIPT', '消费')]
    const edges = [edge('sc_1', 'sc_2')]

    const vars = collectAvailableVars('sc_2', nodes, edges, NO_INPUT)

    expect(vars.find((v) => v.name === 'sum')).toBeDefined()
    expect(vars.find((v) => v.name === 'sc_1')).toBeUndefined()
  })

  it('results 为空数组的祖先 → 视为未声明，列隐式条目（与引擎 isEmpty 分支一致）', () => {
    const nodes = [node('http_empty', 'HTTP', '空声明', []), node('n', 'SCRIPT', '下游')]
    const edges = [edge('http_empty', 'n')]

    const vars = collectAvailableVars('n', nodes, edges, NO_INPUT)

    expect(vars.find((v) => v.name === 'http_empty')).toBeDefined()
  })

  it('START/END 祖先不产生隐式条目', () => {
    const nodes = [node('st', 'START', '开始'), node('n', 'SCRIPT', '下游')]
    const edges = [edge('st', 'n')]

    const vars = collectAvailableVars('n', nodes, edges, NO_INPUT)

    expect(vars.find((v) => v.name === 'st')).toBeUndefined()
  })

  it('非直接相邻的祖先执行型节点同样产出隐式条目（沿边反向可达）', () => {
    const nodes = [
      node('a_http', 'HTTP', '远端调用'),
      node('mid', 'SCRIPT', '中间'),
      node('n', 'SCRIPT', '末端'),
    ]
    const edges = [edge('a_http', 'mid'), edge('mid', 'n')]

    const vars = collectAvailableVars('n', nodes, edges, NO_INPUT)

    expect(vars.find((v) => v.name === 'a_http')).toBeDefined()
  })

  it('CONDITION 祖先（PropertyPanel 无声明入口）→ 隐式布尔条目', () => {
    const nodes = [
      node('cond_x', 'CONDITION', '金额判断'),
      node('n', 'SCRIPT', '下游'),
    ]
    const edges = [edge('cond_x', 'n')]

    const vars = collectAvailableVars('n', nodes, edges, NO_INPUT)

    const implicit = vars.find((v) => v.name === 'cond_x')
    expect(implicit).toBeDefined()
    expect(implicit!.group).toBe('upstream')
  })
})

describe('collectAvailableVars · 表单字段树', () => {
  const groups: FormFieldGroupLike[] = [
    {
      formKey: 'bill_test',
      formName: '测试表单',
      formType: 'BUSINESS',
      source: 'columnConfig',
      triggerTypes: ['BEFORE_CREATE', 'AFTER_CREATE'],
      fields: [
        { path: 'person_name', label: '请假人姓名', type: 'string' },
        { path: 'order', type: 'object', children: [
          { path: 'order.no', label: '单号', type: 'string' },
        ] },
      ],
    },
  ]

  it('有结构时 form 组展开为 formData 根条目 + 字段子条目（完整路径）', () => {
    const vars = collectAvailableVars('n', [], [], NO_INPUT, groups)

    const root = vars.find((v) => v.name === 'formData')
    expect(root).toBeDefined()
    expect(root!.prefixOnly).toBe(true)
    expect(root!.children!.map((c) => c.name)).toEqual(['formData.person_name', 'formData.order'])
    expect(root!.detail).toContain('测试表单')
    // 孙层（props.columns / 采样深层）
    expect(root!.children![1].children!.map((c) => c.name)).toEqual(['formData.order.no'])
  })

  it('无结构（未传/空数组/全部空字段）→ 回退单条 formData 提示', () => {
    const fallback = collectAvailableVars('n', [], [], NO_INPUT)
    expect(fallback.find((v) => v.name === 'formData')).toBeDefined()

    const empty = collectAvailableVars('n', [], [], NO_INPUT, [{ formKey: 'x', fields: [] }])
    const root = empty.find((v) => v.name === 'formData')
    expect(root!.children).toBeUndefined()
    expect(root!.prefixOnly).toBeUndefined()
  })

  it('绑定含 UPDATE/DELETE 触发点 → 额外列出 formDataExisting（同构字段）', () => {
    const mutGroups: FormFieldGroupLike[] = [
      { formKey: 'b1', fields: [{ path: 'amount', type: 'number' }], triggerTypes: ['BEFORE_UPDATE'] },
    ]
    const vars = collectAvailableVars('n', [], [], NO_INPUT, mutGroups)

    const ex = vars.find((v) => v.name === 'formDataExisting')
    expect(ex).toBeDefined()
    expect(ex!.children!.map((c) => c.name)).toEqual(['formDataExisting.amount'])
  })

  it('仅查询类触发点（CREATE/SNAPSHOT）→ 不列 formDataExisting', () => {
    const vars = collectAvailableVars('n', [], [], NO_INPUT, groups)
    expect(vars.find((v) => v.name === 'formDataExisting')).toBeUndefined()
  })

  it('多表单字段合并去重（同路径先到先得）', () => {
    const two: FormFieldGroupLike[] = [
      { formKey: 'a', fields: [{ path: 'amount', type: 'number' }] },
      { formKey: 'b', fields: [{ path: 'amount', type: 'string' }, { path: 'extra' }] },
    ]
    const vars = collectAvailableVars('n', [], [], NO_INPUT, two)
    const root = vars.find((v) => v.name === 'formData')!
    expect(root.children!.filter((c) => c.name === 'formData.amount')).toHaveLength(1)
    expect(root.children!.find((c) => c.name === 'formData.amount')!.detail).toContain('number')
    expect(root.children!.find((c) => c.name === 'formData.extra')).toBeDefined()
  })
})

describe('varInsertText · 表单条目', () => {
  const root: any = { name: 'formData', group: 'form', prefixOnly: true }
  const leaf: any = { name: 'formData.person_name', group: 'form' }
  const exLeaf: any = { name: 'formDataExisting.amount', group: 'form' }

  it('根条目仅插前缀（存量行为不变）', () => {
    expect(varInsertText(root, 'placeholder')).toBe('{{formData.')
    expect(varInsertText(root, 'bare')).toBe('formData.')
  })

  it('字段子条目插完整路径', () => {
    expect(varInsertText(leaf, 'placeholder')).toBe('{{formData.person_name}}')
    expect(varInsertText(leaf, 'bare')).toBe('formData.person_name')
    expect(varInsertText(exLeaf, 'placeholder')).toBe('{{formDataExisting.amount}}')
  })
})
