import { describe, expect, it } from 'vitest'
import {
  PROCESS_LEVEL_NODE_ID,
  parseOperationsFromConfig,
  parseProcessOperations,
} from '../../../src/engine/task/task.service'

/**
 * 操作权限解析的单测（对齐 Java `WorkflowTaskService` 的
 * `parseOperationsFromConfig` / `parseProcessOperations` / `extractOperations`）。
 *
 * golden（场景「任务转办与操作权限」）覆盖了两级合并的**两个组合**，
 * 但下面这些**契约网够不到**的地方只能在这里锁住：
 *   - 两级**各自的缺键默认值不同**（节点级 reject/transfer 默认 true，
 *     流程级四个默认全 true）—— 这是最容易写错、也最容易被"统一成 false"的地方；
 *   - 解析失败/结构不对时的兜底（Java 返回**默认值对象**，不是 null）；
 *   - 流程级读的是 `approvalPolicy.operations`，**不是**顶层 `operations`。
 */

describe('parseOperationsFromConfig（节点级）', () => {
  // ⚠️ 默认值来自 Java `OperationsConfig` 的字段初始化器：
  //    allowReject = true、allowAddSign = false、allowTransfer = true、allowDelegate = false。
  //    写成「缺键即 false」会让「配置里没写 allowReject/allowTransfer」的两侧取值分叉。
  const NODE_DEFAULTS = {
    allowReject: true,
    allowAddSign: false,
    allowTransfer: true,
    allowDelegate: false,
  }

  it('null / 空配置 → 全套默认值（绝不是 null）', () => {
    expect(parseOperationsFromConfig(null)).toEqual(NODE_DEFAULTS)
  })

  it('缺少 operations 键 → 默认值', () => {
    expect(parseOperationsFromConfig('{"basic":{"name":"审批节点"}}')).toEqual(NODE_DEFAULTS)
  })

  it('operations 不是对象（数组 / 字符串 / null）→ 默认值', () => {
    expect(parseOperationsFromConfig('{"operations":[]}')).toEqual(NODE_DEFAULTS)
    expect(parseOperationsFromConfig('{"operations":"x"}')).toEqual(NODE_DEFAULTS)
    expect(parseOperationsFromConfig('{"operations":null}')).toEqual(NODE_DEFAULTS)
  })

  it('非法 JSON → 默认值（对齐 Java catch 分支返回刚构造的 result）', () => {
    expect(parseOperationsFromConfig('{')).toEqual(NODE_DEFAULTS)
  })

  // 这一组就是契约场景 B 段节点级的形态：只配 allowAddSign
  it('只配 allowAddSign=true → 其余三个走默认（reject/transfer 为 true）', () => {
    expect(parseOperationsFromConfig('{"operations":{"allowAddSign":true}}')).toEqual({
      allowReject: true,
      allowAddSign: true,
      allowTransfer: true,
      allowDelegate: false,
    })
  })

  it('显式的 false 会覆盖默认值', () => {
    expect(
      parseOperationsFromConfig(
        '{"operations":{"allowReject":false,"allowTransfer":false,"allowDelegate":false}}',
      ),
    ).toEqual({
      allowReject: false,
      allowAddSign: false,
      allowTransfer: false,
      allowDelegate: false,
    })
  })

  it('配置里的额外开关也带回（向前兼容）', () => {
    const out = parseOperationsFromConfig('{"operations":{"allowReject":true,"allowRecall":true}}')
    expect(out.allowRecall).toBe(true)
    // 四个已知键仍然齐全
    expect(Object.keys(out).sort()).toEqual(
      ['allowAddSign', 'allowDelegate', 'allowRecall', 'allowReject', 'allowTransfer'].sort(),
    )
  })
})

describe('parseProcessOperations（流程级）', () => {
  // ⚠️ 流程级的默认值是**四个全 true**（Java 先 setAllowXxx(true) 再按需覆盖），
  //    与节点级的默认值**不同** —— 两者不能合并成一个函数。
  const PROCESS_DEFAULTS = {
    allowReject: true,
    allowAddSign: true,
    allowTransfer: true,
    allowDelegate: true,
  }

  it('null / 非法 JSON / 缺 approvalPolicy → 全开默认值', () => {
    expect(parseProcessOperations(null)).toEqual(PROCESS_DEFAULTS)
    expect(parseProcessOperations('{')).toEqual(PROCESS_DEFAULTS)
    expect(parseProcessOperations('{"numberRule":{"enabled":false}}')).toEqual(PROCESS_DEFAULTS)
    expect(parseProcessOperations('{"approvalPolicy":{}}')).toEqual(PROCESS_DEFAULTS)
    expect(parseProcessOperations('{"approvalPolicy":{"operations":null}}')).toEqual(
      PROCESS_DEFAULTS,
    )
  })

  // 契约场景 A 段的形态：只配 allowTransfer=false ⇒ 其余三个仍是 true
  it('只配 allowTransfer=false → 其余三个保持 true', () => {
    expect(
      parseProcessOperations('{"approvalPolicy":{"operations":{"allowTransfer":false}}}'),
    ).toEqual({
      allowReject: true,
      allowAddSign: true,
      allowTransfer: false,
      allowDelegate: true,
    })
  })

  it('读的是 approvalPolicy.operations，**不是**顶层 operations', () => {
    // 顶层 operations 是**节点级**的形态，流程级必须忽略它
    expect(parseProcessOperations('{"operations":{"allowTransfer":false}}')).toEqual(
      PROCESS_DEFAULTS,
    )
    // 两者都存在时只认 approvalPolicy 里的那个
    expect(
      parseProcessOperations(
        '{"operations":{"allowTransfer":false},"approvalPolicy":{"operations":{"allowTransfer":true}}}',
      ).allowTransfer,
    ).toBe(true)
  })
})

describe('两级 AND 合并（用契约场景的两个组合复算一遍）', () => {
  const merge = (
    processJson: string | null,
    nodeJson: string | null,
  ): Record<string, boolean> => {
    const processLevel = parseProcessOperations(processJson)
    const nodeLevel = parseOperationsFromConfig(nodeJson)
    const out: Record<string, boolean> = {}
    for (const key of ['allowReject', 'allowAddSign', 'allowTransfer', 'allowDelegate']) {
      out[key] = processLevel[key] && nodeLevel[key]
    }
    return out
  }

  it('A 段：流程级关掉 allowTransfer，节点级全开 ⇒ 合并后为 false', () => {
    // 这正是「只读节点级的旧实现」会答错的那一格：节点级四项全 true
    const merged = merge(
      '{"approvalPolicy":{"operations":{"allowTransfer":false}}}',
      '{"operations":{"allowReject":true,"allowAddSign":true,"allowTransfer":true,"allowDelegate":true}}',
    )
    expect(merged).toEqual({
      allowReject: true,
      allowAddSign: true,
      allowTransfer: false,
      allowDelegate: true,
    })
  })

  it('B 段：两级各只配一个键 ⇒ 缺键默认值参与合并', () => {
    const merged = merge(
      '{"approvalPolicy":{"operations":{"allowDelegate":true}}}',
      '{"operations":{"allowAddSign":true}}',
    )
    // addSign: 流程级默认 true && 节点级显式 true = true
    // delegate: 流程级显式 true && 节点级默认 false = false  ← 默认值不同导致的关键一格
    // reject/transfer: 两级默认都是 true = true
    expect(merged).toEqual({
      allowReject: true,
      allowAddSign: true,
      allowTransfer: true,
      allowDelegate: false,
    })
  })

  it('流程级未配置时不参与合并（等价于全开）', () => {
    const nodeLevel = parseOperationsFromConfig('{"operations":{"allowAddSign":true}}')
    // 场景 B 段之外，大多数部署没有 __PROCESS__ 行 —— 此时结果就等于节点级
    expect(nodeLevel).toEqual({
      allowReject: true,
      allowAddSign: true,
      allowTransfer: true,
      allowDelegate: false,
    })
  })

  it('流程级伪节点 ID 的字面量就是 __PROCESS__', () => {
    expect(PROCESS_LEVEL_NODE_ID).toBe('__PROCESS__')
  })
})
