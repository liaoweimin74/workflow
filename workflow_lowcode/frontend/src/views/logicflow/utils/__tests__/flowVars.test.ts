/**
 * flowVars 变量收集单测：重点覆盖「隐式整体输出」条目
 * （未声明 results 的执行型祖先节点 → 变量名 = 节点 id，与引擎隐式约定对齐）。
 */
import { describe, expect, it } from 'vitest'
import { collectAvailableVars, EXEC_NODE_TYPES } from '../flowVars'
import type { VarEdgeLike, VarNodeLike } from '../flowVars'
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
