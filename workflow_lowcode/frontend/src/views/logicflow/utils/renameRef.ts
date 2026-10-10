/**
 * 改名重构（ADR-001 路线 Phase B / 落地清单第 4 项前端部分）：改「写」不「报」。
 *
 * 用户改「声明名」（节点 results 行名 / 流入参名 / BATCH itemVar/indexVar）时：
 * - analyzeRename 列出全流引用位点 + Groovy 盲区 SCRIPT 清单 + 新名撞名警示，供确认框展示；
 * - applyRename 按同一规则原子重写引用位点（不改声明行本身——调用方 v-model 已先行变更），
 *   返回实际重写的位点数（节点×字段）。
 *
 * 重写规则 = refScan.ts 逐节点 dispatch 的镜像：
 * - 占位符字段（HTTP url / headers 值、CONDITION value、BATCH collection 模板形态、
 *   DATA_UPDATE setOps/where value、BATCH legacy actionConfig）→ 逐 {{token}} 取根名
 *   （token.split('.')[0]），根名等于 oldName 才替换根段，点路径尾段保留
 *   （DATA_UPDATE 取值 {{old.sub}} → {{new.sub}}，resolvePath 点路径语义）
 * - 裸名字段（HTTP queryParams/bodyParams source、BEAN params source、SUBFLOW
 *   varsMapping source）→ 精确等于 oldName 才替换（vars.get(字面量) 语义，点路径不可用）
 * - CONDITION variable → strip {{}} 后精确匹配，原本带包裹则保持 {{}} 形态
 * - BATCH collection 精确形态 {{oldName}} 整体替换（单 token 场景与根名替换等价）
 * - SCRIPT source 为 Groovy 绑定集，静态不可知：不重写，仅列入 scriptNodes 供确认框警示
 *
 * 作用域（opts.loopRootId，BATCH 循环变量改名时传入该 BATCH 节点 id）：仅重写循环链内
 * 节点 —— 与 refScan buildScope 的「途经 source 为该 BATCH 的 loop 边即入链」反向 BFS
 * 超集语义同源（等价实现：链首沿出边正向可达的节点均视作链内）。普通 results/入参改名
 * 全图扫描（引擎循环结束 vars.putAll 并回父上下文，results 全局可见）。BATCH 自身：
 * collection 在父上下文求值不随循环变量改名；legacy actionConfig 按引擎「逐项执行」
 * 语义视作链内位点（itemVar 在该项作用域可见）。
 *
 * applyRename 不碰 SCRIPT source；改名后撤销依赖设计器既有的 serializeDsl 防抖快照栈。
 */
import type { InjectionKey } from 'vue'
import type { InputVarDef } from './dsl'
import type { VarEdgeLike, VarNodeLike } from './flowVars'

/** 单个重写位点：哪个节点的哪个字段被改写 */
export interface RenameSite {
  nodeId: string
  nodeName: string
  nodeType: string
  /** 字段定位（人类可读），与 refScan 的 field 标签同源：URL / 请求头 X / 判断变量 … */
  field: string
}

export interface RenameImpact {
  /** 需要重写的引用位点（确认框列表主体） */
  sites: RenameSite[]
  /** 作用域内 SCRIPT 节点：Groovy 盲区不重写，仅警示 */
  scriptNodes: RenameSite[]
  /** 新名与既有声明撞名的位置描述（仅警示不阻断）：入参 / 节点输出 / 批处理循环变量 */
  collisions: string[]
}

export interface RenameScopeOpts {
  /** BATCH 循环变量（itemVar/indexVar）改名时传 BATCH 节点 id：仅重写循环链内节点 */
  loopRootId?: string
  /**
   * 改名声明自身（排除撞名误报）：调用方 v-model 已把声明行先行写成新名，
   * 不排除则每次改名都会「撞自己」。kind=result/input 时 index 为声明行下标；
   * kind=loopItem/loopIndex 时 nodeId 定位 BATCH、kind 定位字段。
   */
  selfDecl?: { nodeId?: string; kind: RenameDeclKind; index?: number }
}

export type RenameDeclKind = 'result' | 'input' | 'loopItem' | 'loopIndex'

/** 声明改名载荷：面板/弹窗 → 设计器 renameDeclaration 的最小信息 */
export interface RenameDeclPayload {
  kind: RenameDeclKind
  /** results 行 / BATCH 循环变量改名时的声明宿主节点 id */
  sourceNodeId?: string
  oldName: string
  newName: string
  /** result/input 改名的声明行下标（撞名警示排除自身行用） */
  rowIndex?: number
}

export type RenameDeclFn = (p: RenameDeclPayload) => Promise<boolean>

/** provide/inject key：设计器提供改名重构实现，PropertyPanel 注入调用 */
export const LF_RENAME_DECL: InjectionKey<RenameDeclFn> = Symbol('lfRenameDecl')

// ==================== 重写原语（refScan 提取原语的镜像） ====================

/** 与 refScan.PLACEHOLDER 一致：引擎 VariableResolver 仅 \w+；DATA_UPDATE resolvePath 另支持点路径 */
const PLACEHOLDER = /\{\{\s*(\w+(?:\.\w+)*)\s*}}/g

const BATCH_TYPE = 'BATCH'
const DEFAULT_ITEM_VAR = 'item'
const DEFAULT_INDEX_VAR = 'index'

function str(v: unknown): string {
  return v == null ? '' : String(v)
}

/** 占位符根名替换：{{old.sub}} → {{new.sub}}，根名不匹配的 token 原样保留 */
function replacePlaceholderRoots(text: string, oldName: string, newName: string): [string, number] {
  let count = 0
  const out = text.replace(PLACEHOLDER, (token: string, path: string) => {
    const root = path.split('.')[0]
    if (root !== oldName) return token
    count += 1
    return `{{${newName}${path.slice(root.length)}}}`
  })
  return [out, count]
}

/** 裸名精确替换（vars.get(字面量)：source 字段只装一个名字） */
function replaceBare(text: string, oldName: string, newName: string): [string, number] {
  if (text.trim() !== oldName) return [text, 0]
  return [newName, 1]
}

/** CONDITION variable：strip {{}} 后精确匹配，原本带包裹则保持包裹形态 */
function replaceCondVariable(text: string, oldName: string, newName: string): [string, number] {
  const trimmed = text.trim()
  if (!trimmed) return [text, 0]
  const wrapped = /^\{\{[\s\S]*\}\}$/.test(trimmed)
  const inner = trimmed.replace(/^\{\{/, '').replace(/\}\}$/, '').trim()
  if (inner !== oldName) return [text, 0]
  return [wrapped ? `{{${newName}}}` : newName, 1]
}

/** 深遍历重写（legacy actionConfig 兜底，镜像 refScan.deepPlaceholders）：所有字符串值里的占位符 */
function rewriteDeep(value: unknown, oldName: string, newName: string): { value: unknown; count: number } {
  if (typeof value === 'string') {
    const [next, count] = replacePlaceholderRoots(value, oldName, newName)
    return { value: next, count }
  }
  if (Array.isArray(value)) {
    let count = 0
    const arr = value.map((v) => {
      const r = rewriteDeep(v, oldName, newName)
      count += r.count
      return r.value
    })
    return { value: count ? arr : value, count }
  }
  if (value && typeof value === 'object') {
    let count = 0
    let changed = false
    const obj: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const r = rewriteDeep(v, oldName, newName)
      count += r.count
      obj[k] = r.value
      if (r.value !== v) changed = true
    }
    return { value: changed ? obj : value, count }
  }
  return { value, count: 0 }
}

// ==================== 循环链作用域（buildScope loops 传递的等价实现） ====================

/**
 * loopRootId BATCH 的循环链内节点集合：
 * 链首 = 该 BATCH 经 loop 边（data.loop===true）连出的目标节点；链首沿出边正向可达的
 * 节点均视作链内 —— 与 refScan buildScope「反向 BFS 途经该 BATCH 的 loop 边即入链，
 * 链上后续节点均算」的超集语义等价（入链判定只取决于从节点出发能否沿祖先链走到该
 * loop 边，即节点是否从链首正向可达；嵌套循环的内层链挂在链内 BATCH 上同样可达）。
 */
function loopChainMembers(edges: VarEdgeLike[], loopRootId: string): Set<string> {
  const members = new Set<string>()
  const queue: string[] = []
  for (const e of edges || []) {
    if (e?.source !== loopRootId || !e?.target || e.data?.loop !== true) continue
    if (members.has(e.target)) continue
    members.add(e.target)
    queue.push(e.target)
  }
  while (queue.length) {
    const cur = queue.shift()!
    for (const e of edges || []) {
      if (!e?.source || e.source !== cur || !e?.target || members.has(e.target)) continue
      members.add(e.target)
      queue.push(e.target)
    }
  }
  return members
}

// ==================== 主走查（analyze / apply 共用，mutate 区分是否写回） ====================

interface WalkCtx {
  oldName: string
  newName: string
  mutate: boolean
  sites: RenameSite[]
  scriptNodes: RenameSite[]
}

function walkGraph(
  nodes: VarNodeLike[],
  edges: VarEdgeLike[],
  inputVars: InputVarDef[],
  rawOld: string,
  rawNew: string,
  opts?: RenameScopeOpts,
  mutate = false
): RenameImpact {
  const oldName = rawOld.trim()
  const newName = rawNew.trim()
  const ctx: WalkCtx = { oldName, newName, mutate, sites: [], scriptNodes: [] }

  const chain = opts?.loopRootId ? loopChainMembers(edges || [], opts.loopRootId) : null

  /** 作用域内的位点重写：命中即记位点；mutate 时写回 */
  const rewr = (
    node: VarNodeLike,
    kind: 'ph' | 'bare' | 'cond',
    field: string,
    text: string,
    writeBack?: (next: string) => void
  ): void => {
    if (!text || !ctx.oldName) return
    const [next, count] =
      kind === 'bare'
        ? replaceBare(text, ctx.oldName, ctx.newName)
        : kind === 'cond'
          ? replaceCondVariable(text, ctx.oldName, ctx.newName)
          : replacePlaceholderRoots(text, ctx.oldName, ctx.newName)
    if (!count) return
    if (ctx.mutate) writeBack?.(next)
    ctx.sites.push({
      nodeId: node.id,
      nodeName: node.data?.name || node.id,
      nodeType: node.data?.nodeType,
      field,
    })
  }

  for (const n of nodes || []) {
    const data = n?.data
    if (!data || !data.nodeType) continue
    const isLoopRoot = chain != null && opts?.loopRootId === n.id
    // 循环变量改名只作用于链内节点（BATCH 自身仅 legacy actionConfig 特殊处理，见下）
    if (chain && !chain.has(n.id) && !isLoopRoot) continue

    const nodeType = data.nodeType
    if (nodeType === 'SCRIPT') {
      ctx.scriptNodes.push({ nodeId: n.id, nodeName: data.name || n.id, nodeType, field: '脚本 source' })
      continue
    }

    const cfg = (data.config ?? {}) as Record<string, unknown>
    switch (nodeType) {
      case 'HTTP': {
        rewr(n, 'ph', 'URL', str(cfg.url), (t) => {
          cfg.url = t
        })
        const headers = cfg.headers as Record<string, string> | undefined
        if (headers && typeof headers === 'object') {
          for (const [k, v] of Object.entries(headers)) {
            rewr(n, 'ph', `请求头 ${k}`, str(v), (t) => {
              headers[k] = t
            })
          }
        }
        for (const [key, label] of [
          ['queryParams', 'Query 参数'],
          ['bodyParams', 'Body 参数'],
        ] as const) {
          const pairs = (cfg[key] ?? []) as { source?: string }[]
          pairs.forEach((p, i) =>
            rewr(n, 'bare', `${label} #${i + 1}`, str(p?.source), (t) => {
              if (p) p.source = t
            })
          )
        }
        break
      }
      case 'BEAN': {
        const pairs = (cfg.params ?? []) as { source?: string }[]
        pairs.forEach((p, i) =>
          rewr(n, 'bare', `方法参数 #${i + 1}`, str(p?.source), (t) => {
            if (p) p.source = t
          })
        )
        break
      }
      case 'CONDITION': {
        rewr(n, 'cond', '判断变量', str(cfg.variable), (t) => {
          cfg.variable = t
        })
        const op = str(cfg.operator).toUpperCase()
        if (op !== 'EMPTY' && op !== 'NOT_EMPTY') {
          rewr(n, 'ph', '比较值', str(cfg.value), (t) => {
            cfg.value = t
          })
        }
        break
      }
      case 'BATCH': {
        if (isLoopRoot) {
          // 循环变量改名：BATCH 自身 collection 在父上下文求值（item 未定义），仅
          // legacy 单动作配置按「逐项执行」语义视作链内位点
          rewriteLegacy(n, cfg, ctx)
          break
        }
        rewr(n, 'ph', '集合 collection', str(cfg.collection), (t) => {
          cfg.collection = t
        })
        rewriteLegacy(n, cfg, ctx)
        break
      }
      case 'SUBFLOW': {
        const pairs = (cfg.varsMapping ?? []) as { source?: string }[]
        pairs.forEach((p, i) =>
          rewr(n, 'bare', `变量映射 #${i + 1}`, str(p?.source), (t) => {
            if (p) p.source = t
          })
        )
        break
      }
      case 'DATA_UPDATE': {
        // DATA_UPDATE 取值走 resolvePath：点路径受支持，占位符按根名替换（{{old.sub}} → {{new.sub}}）
        const setOps = (cfg.setOps ?? []) as { column?: string; mode?: string; value?: string }[]
        setOps.forEach((op, i) => {
          const mode = str(op?.mode).toUpperCase() || 'SET'
          rewr(n, 'ph', `写入列 ${str(op?.column) || `#${i + 1}`}（${mode}）`, str(op?.value), (t) => {
            if (op) op.value = t
          })
        })
        const where = (cfg.where ?? []) as { column?: string; op?: string; value?: string }[]
        where.forEach((cond, i) => {
          const op = str(cond?.op).toUpperCase()
          if (op === 'IS_NULL' || op === 'NOT_NULL') return
          rewr(n, 'ph', `条件列 ${str(cond?.column) || `#${i + 1}`}`, str(cond?.value), (t) => {
            if (cond) cond.value = t
          })
        })
        break
      }
      default:
        break
    }
  }

  return { sites: ctx.sites, scriptNodes: ctx.scriptNodes, collisions: collectCollisions(nodes, inputVars, newName, opts?.selfDecl) }

  /** legacy 单动作配置深重写（挂在 BATCH 分支内复用记位点结构） */
  function rewriteLegacy(node: VarNodeLike, cfg: Record<string, unknown>, c: WalkCtx): void {
    const legacy = cfg.actionConfig as Record<string, unknown> | undefined
    if (!cfg.actionType || !legacy || !c.oldName) return
    const r = rewriteDeep(legacy, c.oldName, c.newName)
    if (!r.count) return
    if (c.mutate) cfg.actionConfig = r.value as Record<string, unknown>
    c.sites.push({
      nodeId: node.id,
      nodeName: node.data?.name || node.id,
      nodeType: node.data?.nodeType,
      field: 'legacy 动作配置',
    })
  }
}

// ==================== 撞名警示（仅警示不阻断） ====================

/**
 * newName 与既有声明撞名的位置：全部入参名 ∪ 全部节点 results 名 ∪ 各 BATCH 的
 * itemVar/indexVar（含缺省名 item/index——引擎按缺省注入循环变量，同样占用命名空间）。
 * selfDecl 排除被改名的声明行自身（调用方 v-model 已先行写入新名，不排除则必「撞自己」）。
 */
function collectCollisions(
  nodes: VarNodeLike[],
  inputVars: InputVarDef[],
  newName: string,
  self?: RenameScopeOpts['selfDecl']
): string[] {
  if (!newName) return []
  const holders = new Set<string>()

  const selfInputIndex = self?.kind === 'input' ? self.index : undefined
  ;(inputVars || []).forEach((v, i) => {
    const name = v?.name?.trim()
    if (!name || name !== newName || i === selfInputIndex) return
    holders.add('入参声明')
  })

  for (const n of nodes || []) {
    const data = n?.data
    if (!data) continue
    const label = data.name || n.id
    if (Array.isArray(data.results)) {
      ;(data.results as { name?: string }[]).forEach((r, i) => {
        const name = str(r?.name).trim()
        if (!name || name !== newName) return
        if (self?.kind === 'result' && self.nodeId === n.id && self.index === i) return
        holders.add(`节点「${label}」输出`)
      })
    }
    if (data.nodeType === BATCH_TYPE) {
      const cfg = (data.config ?? {}) as { itemVar?: string; indexVar?: string }
      const itemVar = cfg.itemVar?.trim() || DEFAULT_ITEM_VAR
      const indexVar = cfg.indexVar?.trim() || DEFAULT_INDEX_VAR
      if (itemVar === newName && !(self?.kind === 'loopItem' && self.nodeId === n.id)) {
        holders.add(`批处理「${label}」项变量`)
      }
      if (indexVar === newName && !(self?.kind === 'loopIndex' && self.nodeId === n.id)) {
        holders.add(`批处理「${label}」序号变量`)
      }
    }
  }
  return [...holders]
}

// ==================== 对外 API ====================

/**
 * 分析改名影响：列出需重写的引用位点 + SCRIPT 盲区清单 + 新名撞名警示。不改任何数据。
 */
export function analyzeRename(
  nodes: VarNodeLike[],
  edges: VarEdgeLike[],
  inputVars: InputVarDef[],
  oldName: string,
  opts?: RenameScopeOpts
): RenameImpact {
  return walkGraph(nodes || [], edges || [], inputVars || [], oldName, '', opts, false)
}

/**
 * 原子重写引用位点（不碰声明行本身与 SCRIPT source），返回实际重写的位点数（节点×字段）。
 * 节点/边为画布 store 真值（响应式代理），就地变更实时联动画布与序列化快照。
 */
export function applyRename(
  nodes: VarNodeLike[],
  edges: VarEdgeLike[],
  inputVars: InputVarDef[],
  oldName: string,
  newName: string,
  opts?: RenameScopeOpts
): number {
  const impact = walkGraph(nodes || [], edges || [], inputVars || [], oldName, newName, opts, true)
  return impact.sites.length
}
