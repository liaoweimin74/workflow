/**
 * 节点类型契约注册表（ADR-001 落地清单第 1 项）。
 *
 * 每种执行型节点声明它「可提供」的输出 schema（名/类型/语义），属元数据而非
 * 运行时数据：放节点零操作、不产生任何运行时输出；下游在变量选择器点选某个
 * 契约输出时才在上游节点生成 results 声明（用侧声明 / 引用即声明，第 2 项）。
 *
 * 契约 key 同时是自动声明名的「名族」基名（body / body_2 / body_3...），
 * 名族匹配用于跨会话去重：节点已声明同名族输出则不再重复提议该契约。
 * 稳定 refKey 持久化（改名重构安全）属第 4 项，此处先用名族启发式。
 */
import type { InjectionKey } from 'vue'
import type { LogicNodeType, ResultMode, ResultVarDef } from './dsl'

/** 声明类型域（与 DSL OUTPUT_VAR_TYPES 对齐） */
export type ContractVarType = 'string' | 'number' | 'boolean' | 'json'

/** 单个契约输出：节点类型的固定产出位（引擎按 WHOLE/KEY 语义写入，见 dsl.ts ResultMode） */
export interface NodeContractOutput {
  /** 契约键 = 自动声明名名族基名（稳定，不随节点改名变化） */
  key: string
  /** 选择器展示名 */
  label: string
  type: ContractVarType
  /** 声明提取方式（契约统一 WHOLE：返回值整体写入） */
  mode: ResultMode
  /** 语义说明（写进声明 desc，供下游 picker detail / 属性面板理解） */
  desc: string
}

/**
 * 契约表：与引擎写入语义一一对应（dsl.ts 头注释 / PropertyPanel results tip）：
 * - HTTP  WHOLE = 响应 body（JSON 尽量解析）→ 契约 body
 * - BEAN  WHOLE = 方法返回值               → 契约 result
 * - SCRIPT WHOLE = 脚本末行返回值          → 契约 result
 * - BATCH WHOLE = 循环体返回值聚合列表      → 契约 list（循环作用域 item/index 由 flowVars 循环组承载）
 * - SUBFLOW WHOLE = 子流 outputVars（Map） → 契约 output
 * - DATA_UPDATE WHOLE = 受影响行数         → 契约 updated
 * - START/END/CONDITION 为控制节点，无产出契约。错误输出（ADR-001 第 6 项 / Phase C）
 *   不走本注册表：引擎失败路径不写 results，节点失败且 IGNORE_CONTINUE 时直接向上下文
 *   写入扁平键 errorMessage/errorNodeId/errorNodeName（最近一次被忽略的失败，成功不清除，
 *   子流内不跨边界），属条件性可用而非可声明产出 —— 由 flowVars 'error' 组（有忽略继续
 *   祖先时列出）与 refScan.buildScope（作用域条件性放行）承载，无需用侧声明
 */
export const NODE_CONTRACTS: Record<LogicNodeType, NodeContractOutput[]> = {
  HTTP: [
    {
      key: 'body',
      label: '响应 body',
      type: 'json',
      mode: 'WHOLE',
      desc: 'HTTP 响应体（JSON 自动解析为对象/数组，否则原文）',
    },
  ],
  BEAN: [
    { key: 'result', label: '方法返回值', type: 'json', mode: 'WHOLE', desc: 'Bean 方法返回值' },
  ],
  SCRIPT: [
    { key: 'result', label: '脚本返回值', type: 'json', mode: 'WHOLE', desc: 'Groovy 脚本末行返回值' },
  ],
  BATCH: [
    { key: 'list', label: '聚合结果列表', type: 'json', mode: 'WHOLE', desc: '循环体各步返回值按序聚合的列表' },
  ],
  SUBFLOW: [
    { key: 'output', label: '子流输出', type: 'json', mode: 'WHOLE', desc: '子流程 outputVars 整体（Map）' },
  ],
  DATA_UPDATE: [
    { key: 'updated', label: '受影响行数', type: 'number', mode: 'WHOLE', desc: '本节点 SET/ADD/SUB 更新影响的行数' },
  ],
  START: [],
  END: [],
  CONDITION: [],
}

/** 节点类型的契约输出（无契约类型返回空数组） */
export function contractOutputsFor(nodeType: string): NodeContractOutput[] {
  return NODE_CONTRACTS[nodeType as LogicNodeType] ?? []
}

/** 名族正则：base 或 base_N（N≥2）——契约派生名的可识别范围 */
function nameFamilyRegex(base: string): RegExp {
  return new RegExp(`^${base}(_\\d+)?$`)
}

/**
 * 跨会话去重：该节点是否已声明过此契约（名族内任一名字命中即视为已声明，
 * 无论 WHOLE/KEY——用户已手动围绕该产出建模时不重复提议）。
 */
export function isContractDeclared(results: ResultVarDef[] | undefined, base: string): boolean {
  if (!Array.isArray(results)) return false
  const re = nameFamilyRegex(base)
  return results.some((r) => re.test(String(r?.name ?? '').trim()))
}

/**
 * 从全局已用变量名集合中分配一个不冲突的声明名：base 优先，冲突退位 base_N。
 * usedNames 需包含全图 results 声明名 + inputVars 入参名 + 循环变量名（同一上下文命名空间）。
 * 就地写回 usedNames，保证同一次收集内多个契约提议互相不撞名。
 */
export function allocateContractName(usedNames: Set<string>, base: string): string {
  if (!usedNames.has(base)) {
    usedNames.add(base)
    return base
  }
  let i = 2
  while (usedNames.has(`${base}_${i}`)) i++
  const name = `${base}_${i}`
  usedNames.add(name)
  return name
}

/** 由契约生成声明行（写回上游节点 data.results 的形态，与手写声明同构） */
export function buildContractDeclaration(c: NodeContractOutput): ResultVarDef {
  return { name: '', mode: c.mode, type: c.type, desc: `契约输出：${c.desc}` }
}

// ==================== 用侧声明接线（provide/inject，跨 PropertyPanel 三层） ====================

/** 声明载荷：点选契约输出时，选择器 → 设计器的最小信息 */
export interface LfDeclareContractPayload {
  /** 产出节点 id（声明写回它的 data.results） */
  sourceNodeId: string
  /** 已预留的唯一声明名（收集期由 allocateContractName 分配） */
  name: string
  /** 契约键（定位 NODE_CONTRACTS 中的输出定义） */
  contractKey: string
}

export type LfDeclareContractFn = (p: LfDeclareContractPayload) => void

/** provide/inject key：设计器提供实现，VariablePicker 注入调用（缺失时点选契约项为 no-op） */
export const LF_DECLARE_CONTRACT: InjectionKey<LfDeclareContractFn> = Symbol('lfDeclareContract')
