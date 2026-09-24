import { EngineException } from '../../common/exception/engine-exception'
import { evaluateCondition } from './expression'
import type { CompiledNode, NodeType, ProcessModel } from '../process/compiler/process-model'
import { GATEWAY_TYPES } from '../process/compiler/process-model'

function isGatewayNode(nodeType: NodeType): boolean {
  return GATEWAY_TYPES.includes(nodeType)
}

/**
 * 流程引擎运行时（在 ProcessModel 上推进 token）。
 *
 * 依据：spec §4.5 推进算法、§4.6 多实例、§4.7 网关 join（最高风险区）。
 *
 * 本文件刻意实现为**纯内存、确定性**的：不碰数据库、不依赖时钟与随机数。
 * 这是 spec §4.7 要求的对策 ——
 *   「为这四类场景各写一组确定性单元测试（纯内存模型，不碰数据库）」。
 * 持久化由上层（服务层）负责把这里产生的状态映射到 wfe_* 表。
 *
 * 与 Flowable 的关键差异：
 *   - 没有 execution 树 + 变量作用域的完整复刻，只有扁平的 token 列表与作用域 ID
 *   - 多实例的终止不靠 `${rejected || ...}` 表达式，而是显式取消子实例
 */

export type ExecutionStatus = 'ACTIVE' | 'WAITING' | 'COMPLETED'
export type ActivityStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
/**
 * 任务状态。
 * CLAIMED = 已被签收但尚未处理 —— 仍是待办，可以继续 complete。
 */
export type TaskStatus = 'CREATED' | 'CLAIMED' | 'COMPLETED' | 'CANCELLED'

export interface EngineExecution {
  id: string
  nodeId: string
  /** 经由哪条连线到达当前节点（join 汇聚要靠它判断是哪条分支到的）。 */
  arrivedVia: string | null
  parentId: string | null
  /** 所属作用域（子流程 / 多实例根）的 execution id。 */
  scopeId: string | null
  containerId: string | null
  status: ExecutionStatus
  isScope: boolean
  miRootId: string | null
  miIndex: number | null
}

export interface EngineActivity {
  id: string
  executionId: string
  nodeId: string
  nodeType: string
  status: ActivityStatus
  miRootId: string | null
  miIndex: number | null
  /** 活动开始时间。持久化时必须保留 —— 它是历史记录的一部分。 */
  startTime: Date
  endTime: Date | null
}

export interface EngineTask {
  id: string
  executionId: string
  nodeId: string
  assignee: string | null
  candidateUsers: string[]
  status: TaskStatus
  miIndex: number | null
  createTime: Date
  claimTime: Date | null
  endTime: Date | null
}

export interface EngineState {
  status: 'RUNNING' | 'COMPLETED'
  executions: EngineExecution[]
  activities: EngineActivity[]
  tasks: EngineTask[]
  /** join 节点 ID → 已到达的 flowId（用于 AND/OR 汇聚判定）。 */
  joinArrivals: Record<string, string[]>
  /** inclusive fork 的「本次实际激活分支集合」：fork 网关 ID → flowId[]。 */
  activeBranchSets: Record<string, string[]>
}

export function createEngineState(): EngineState {
  return {
    status: 'RUNNING',
    executions: [],
    activities: [],
    tasks: [],
    joinArrivals: {},
    activeBranchSets: {},
  }
}

/** 自动节点连续推进的上限，防止图里有环导致死循环。 */
const MAX_AUTO_STEPS = 10_000

export interface StartOptions {
  instanceId?: string
  /** 发起人用户 ID，写入 initiator 变量并用于发起人节点任务。 */
  initiator?: string
  variables?: Record<string, unknown>
}

export class EngineRuntime {
  private seqCounter = 0
  /** 上一次发出的时间戳（毫秒），用于保证严格递增。 */
  private lastTs = 0
  private readonly variables: Record<string, unknown>
  /** 仅在首次进入发起人节点时自动完成；驳回后回到发起人节点则等待重新提交。 */
  private autoCompleteInitiator = false

  constructor(
    private readonly model: ProcessModel,
    private readonly state: EngineState,
    /**
     * 时钟。默认取系统时间；测试可注入固定时钟以获得确定性。
     * 引擎其余部分保持纯函数式（无随机、无隐式时间依赖）。
     */
    private readonly now: () => Date = () => new Date(),
    /**
     * id 工厂。
     *
     * 默认是**实例内序号**（`exec_1`），让单元测试可读、可断言。
     * 但生产环境必须换成 UUID —— 因为 wfe_execution / wfe_task 的 id 是**全表主键**，
     * 序号只在一个 runtime 内唯一，第二个实例就会撞主键
     * （实测踩到过：`Duplicate entry 'exec_1' for key 'PRIMARY'`）。
     * 同时 Flowable 的实例/任务 id 本来就是 UUID，契约也要求 UUID。
     */
    private readonly makeId: (prefix: string) => string = (prefix) => `${prefix}_${++this.seqCounter}`,
  ) {
    this.variables = {}
  }

  /**
   * 从已持久化状态恢复时，把 id 序号推到已有最大值之上。
   *
   * 引擎的 id 形如 `exec_1` / `task_1`，序号由本实例的计数器产生。
   * 若每处理一个请求都新建 runtime 而不 seed，序号会从头开始，
   * 新生成的 id 就会与库里已有的 id 撞车。
   */
  /**
   * 兼容保留：序号式 id 工厂在跨请求恢复时才需要 seed。
   * 生产用 UUID 工厂，此方法无实际作用。
   */
  seedSeq(seq: number): void {
    if (seq > this.seqCounter) this.seqCounter = seq
  }

  /**
   * 从持久化状态恢复变量。
   *
   * 跨请求继续流转时必须调用 —— 否则条件表达式求值看不到历史变量，
   * 会走错网关分支。
   */
  restoreVariables(variables: Record<string, unknown>): void {
    Object.assign(this.variables, variables)
  }

  /** 便于测试与上层读取。 */
  getVariables(): Record<string, unknown> {
    return { ...this.variables }
  }

  private nextId(prefix: string): string {
    return this.makeId(prefix)
  }

  /**
   * 单调递增时钟。
   *
   * ⚠️ 为什么不能直接用 `now()`：一次操作里会连续创建多个活动
   *    （Start_1 → Flow_1 → Initiator_1 → Flow_2 → Approve_1），
   *    它们可能落在**同一毫秒**。而 wfe_activity 是按 `start_time` 排序的
   *    （Java 的高亮接口就是 `orderByHistoricActivityInstanceStartTime asc`），
   *    时间相同时 MySQL 的排序不稳定，会让响应数组顺序与 Java 不一致
   *    —— 实测踩到过：activeActivityIds 的第一个元素变成了 Approve_1。
   *
   *    这里保证同一 runtime 内时间严格递增，代价是同一操作内的活动时间
   *    会相差若干毫秒（对展示无影响，对顺序至关重要）。
   */
  private clock(): Date {
    const t = this.now().getTime()
    const next = t > this.lastTs ? t : this.lastTs + 1
    this.lastTs = next
    return new Date(next)
  }

  // ---------------------------------------------------------------- 入口

  /**
   * 启动流程实例。
   *
   * 对齐 Java 侧 `ProcessInstanceService.startProcess`：
   * 启动后**自动完成发起人节点**，使流程直接流转到第一个审批节点，
   * 并写一条 action='submit' 的审批意见（意见的持久化由上层负责，见 onInitiatorSubmitted 回调）。
   */
  start(options: StartOptions = {}): void {
    Object.assign(this.variables, options.variables ?? {})
    if (options.initiator !== undefined) this.variables.initiator = options.initiator
    // 启动时允许自动完成发起人节点（仅此一次）
    this.autoCompleteInitiator = true

    const startNode = this.model.nodes[this.model.startNodeId]
    if (startNode === undefined) {
      throw new EngineException(`流程模型缺少起始节点 "${this.model.startNodeId}"`)
    }

    const root: EngineExecution = {
      id: this.nextId('exec'),
      nodeId: startNode.nodeId,
      arrivedVia: null,
      parentId: null,
      scopeId: null,
      containerId: null,
      status: 'ACTIVE',
      isScope: false,
      miRootId: null,
      miIndex: null,
    }
    this.state.executions.push(root)
    this.advance(root)
  }

  // ---------------------------------------------------------------- 主循环

  /**
   * 推进一个 token 直到它停下来（等待审批）或流程结束。
   *
   * 用**循环**而不是递归处理自动节点连推（startEvent / 网关 / serviceTask / endEvent），
   * 避免长流程爆栈；只有 fork / 多实例 / 子流程入栈才有嵌套，由显式栈管理。
   */
  private advance(execution: EngineExecution): void {
    let steps = 0
    while (execution.status === 'ACTIVE') {
      if (++steps > MAX_AUTO_STEPS) {
        throw new EngineException(
          `流程推进超过 ${MAX_AUTO_STEPS} 步，疑存在环路（节点 ${execution.nodeId}）`,
        )
      }
      const node = this.model.nodes[execution.nodeId]
      if (node === undefined) {
        throw new EngineException(`流程模型缺少节点 "${execution.nodeId}"`)
      }

      if (this.handleNode(execution, node)) return
    }
  }

  /**
   * 处理一个节点。
   * 返回 true 表示 token 已停下（等待外部动作），主循环应退出；
   * 返回 false 表示已把 token 移到下一个节点，主循环继续。
   */
  private handleNode(execution: EngineExecution, node: CompiledNode): boolean {
    switch (node.nodeType) {
      case 'startEvent': {
        const activity = this.beginActivity(execution, node)
        this.completeActivity(activity)
        this.takeSingleOutgoing(execution, node)
        return false
      }

      case 'endEvent': {
        const activity = this.beginActivity(execution, node)
        this.completeActivity(activity)
        this.finishScope(execution)
        return true
      }

      case 'userTask':
        return this.handleUserTask(execution, node)

      case 'exclusiveGateway': {
        const activity = this.beginActivity(execution, node)
        this.completeActivity(activity)
        const flow = this.chooseExclusiveFlow(node)
        this.takeFlow(execution, flow.flowId)
        return false
      }

      case 'parallelGateway':
        return this.handleParallelGateway(execution, node)

      case 'inclusiveGateway':
        return this.handleInclusiveGateway(execution, node)

      case 'serviceTask':
        // 服务任务的执行由上层注入（P1 不实现自动逻辑，仅按成功继续）
        {
          const activity = this.beginActivity(execution, node)
          this.completeActivity(activity)
          this.takeSingleOutgoing(execution, node)
          return false
        }

      case 'subProcess':
        // 内嵌子流程：进入内部 start 节点，作用域入栈
        return this.handleSubProcess(execution, node)

      case 'callActivity': {
        // 调用活动需要启动子实例并等待其完成，P1 未实现
        throw new EngineException(`暂不支持的节点类型: ${node.nodeType}（${node.nodeId}）`)
      }

      default:
        throw new EngineException(`暂不支持的节点类型: ${String(node.nodeType)}`)
    }
  }

  // ---------------------------------------------------------------- userTask

  private handleUserTask(execution: EngineExecution, node: CompiledNode): boolean {
    const approval = node.approval ?? { userIds: [], roleCodes: [], multiMode: 'single' as const }

    // 发起人节点：**仅启动时**自动完成（复刻 autoCompleteInitiatorTask）。
    //
    // ⚠️ 驳回后 token 也会回到发起人节点，但那时**不能**自动完成 ——
    //    Java 的 autoCompleteInitiatorTask 只在 startProcess 里调用一次，
    //    驳回后是等发起人重新填报并提交。若这里无条件自动完成，
    //    驳回会立刻重新流转（甚至重新 fork），产生「幽灵待办」。
    if (node.isInitiator && this.autoCompleteInitiator) {
      this.autoCompleteInitiator = false
      const activity = this.beginActivity(execution, node)
      const task = this.createTask(execution, node, this.initiatorAssignee(node), null)
      this.completeTaskRecord(task)
      this.completeActivity(activity)
      this.takeSingleOutgoing(execution, node)
      return false
    }

    if (node.isInitiator) {
      // 驳回后回到发起人：建真实待办并停下，等重新提交
      const activity = this.beginActivity(execution, node)
      void activity
      this.createTask(execution, node, this.initiatorAssignee(node), null)
      execution.status = 'WAITING'
      return true
    }

    if (approval.multiMode === 'single') {
      const activity = this.beginActivity(execution, node)
      const assignee = this.singleAssignee(node, approval.userIds, execution)
      // 1 人 → assignee；多人 → 候选人（复刻 MultiInstanceBpmnRewriter.applySingleAssignee）
      const task = this.createTask(
        execution,
        node,
        assignee.length === 1 ? assignee[0] : assignee.length > 0 ? null : (node.assignee ?? null),
        assignee.length > 1 ? assignee : node.candidateUsers ? [...node.candidateUsers] : [],
      )
      void activity
      void task
      execution.status = 'WAITING'
      return true
    }

    // 多实例：建 MI 根作用域 + 子 execution/task
    this.expandMultiInstance(execution, node, approval.userIds, approval.multiMode)
    return true
  }
  /** 发起人节点的 assignee：优先 BPMN 上的 `${initiator}` 语义，即当前 initiator 变量。 */
  private initiatorAssignee(node: CompiledNode): string | null {
    const initiator = this.variables.initiator
    if (typeof initiator === 'string' && initiator !== '') return initiator
    if (typeof initiator === 'number') return String(initiator)
    return node.assignee ?? null
  }

  /** 单实例节点的审批人：优先 NodeConfig 的 userIds，回退到 BPMN 上的 assignee。 */
  private singleAssignee(
    node: CompiledNode,
    userIds: string[],
    _execution: EngineExecution,
  ): string[] {
    if (userIds.length > 0) return [...userIds]
    return node.assignee !== null && node.assignee !== undefined ? [node.assignee] : []
  }

  // ---------------------------------------------------------------- 多实例

  /**
   * 展开多实例节点（spec §4.6）。
   *
   *   countersign（会签）：一次展开全部，全部完成才算完成
   *   or_sign（或签）    ：一次展开全部，任一完成即完成并取消其余
   *   sequential（依次） ：一次只建一个，前一个完成后才建下一个
   */
  private expandMultiInstance(
    execution: EngineExecution,
    node: CompiledNode,
    userIds: string[],
    multiMode: 'countersign' | 'or_sign' | 'sequential',
  ): void {
    const activity = this.beginActivity(execution, node)
    /**
     * ⚠️ 这个活动代表「MI **父体**」，不是某一个子实例 —— `nodeType` 必须是
     *    `multiInstanceBody`。
     *
     *    为什么：Flowable 里多实例节点的父活动类型就是 `multiInstanceBody`，
     *    只有子实例才是 `userTask`；而审批时间线（`ProcessHistoryService`）按
     *    `activityType("userTask")` 过滤。父体若也标成 userTask，Node 的时间线就会
     *    比 Java **多出整整一条**（实测「任务加签」：Java 4 条 / Node 5 条，
     *    多出来的那条 assignee/action 全为 null —— 因为没有任何任务挂在父体执行上）。
     *    父体活动本身要保留：高亮/预测依赖「节点已进入」这件事。
     */
    activity.nodeType = 'multiInstanceBody'
    const root: EngineExecution = {
      ...execution,
      // ⚠️ 必须给 MI 根一个**全新的 id**。若沿用 `{...execution}` 里复制来的 id，
      //    根与原 token 会同 id，后续 `find(e => e.id === miRootId)` 会命中已退场的原对象，
      //    导致推进错 token、实例永远无法判定完成（实测踩到过）。
      id: this.nextId('miRoot'),
      // MI 根：本身不移动，仅作为子实例的容器与作用域
      status: 'WAITING',
      isScope: true,
    }
    root.miRootId = root.id
    activity.miRootId = root.id
    this.state.executions.push(root)

    // 原 token 必须退场：它已被 MI 根取代。
    // 若仍留成 ACTIVE，`every(status === 'COMPLETED')` 永远为 false，实例无法判定完成。
    execution.status = 'COMPLETED'

    const approvers = userIds.length > 0 ? userIds : node.assignee ? [node.assignee] : []

    if (multiMode === 'sequential') {
      // 一次只建一个子实例；后续由 completeTask 触发下一个
      this.createMiChild(root, node, approvers[0] ?? null, 0)
      return
    }

    approvers.forEach((approver, index) => {
      this.createMiChild(root, node, approver, index)
    })
  }

  /** 建一个多实例子 execution + 对应任务。 */
  private createMiChild(
    root: EngineExecution,
    node: CompiledNode,
    assignee: string | null,
    index: number,
  ): EngineExecution {
    const child: EngineExecution = {
      id: this.nextId('mi'),
      nodeId: node.nodeId,
      arrivedVia: null,
      parentId: root.id,
      scopeId: root.id,
      containerId: node.containerId,
      status: 'WAITING',
      isScope: false,
      miRootId: root.id,
      miIndex: index,
    }
    this.state.executions.push(child)
    const activity = this.beginActivity(child, node)
    activity.miRootId = root.id
    activity.miIndex = index
    this.createTask(child, node, assignee, index)
    return child
  }

  // ---------------------------------------------------------------- 排他网关

  /**
   * 选择排他网关的出边：按 XML 声明顺序求值，命中第一条即走；
   * 全部不命中时走默认分支；既无命中又无默认分支 → 报错。
   */
  private chooseExclusiveFlow(node: CompiledNode) {
    const flows = node.outgoing
      .map((id) => this.model.flows[id])
      .filter((f): f is NonNullable<typeof f> => f !== undefined)

    for (const flow of flows) {
      if (flow.isDefault) continue
      if (flow.condition === null) return flow
      if (evaluateCondition(flow.condition, this.variables)) return flow
    }

    const fallback = flows.find((f) => f.isDefault || f.condition === null)
    if (fallback === undefined) {
      throw new EngineException(
        `排他网关 "${node.nodeId}" 没有命中任何分支，也没有默认分支（变量: ${JSON.stringify(this.variables)}）`,
      )
    }
    return fallback
  }

  // ---------------------------------------------------------------- 并行网关

  private handleParallelGateway(execution: EngineExecution, node: CompiledNode): boolean {
    if (node.incoming.length > 1) {
      return this.arriveAtJoin(execution, node, node.incoming)
    }

    const activity = this.beginActivity(execution, node)
    this.completeActivity(activity)

    const flows = node.outgoing
      .map((id) => this.model.flows[id])
      .filter((f): f is NonNullable<typeof f> => f !== undefined)
    if (flows.length === 0) {
      throw new EngineException(`网关 "${node.nodeId}" 没有出边，无法 fork`)
    }

    // 其余分支新建 token 并各自推进到停点（spawnChild 内部会 advance）
    for (const flow of flows.slice(1)) {
      this.spawnChild(execution, flow.flowId)
    }
    // 当前 token 走第一条分支，**交给主循环继续推进**（返回 false）
    this.takeFlow(execution, flows[0].flowId)
    return false
  }

  // ---------------------------------------------------------------- 包含网关

  private handleInclusiveGateway(execution: EngineExecution, node: CompiledNode): boolean {
    if (node.incoming.length > 1) {
      // OR join：只等待**本次实际激活**的分支。
      // 激活集合记在 fork 节点上，而 join 是另一个节点，所以要把
      // 「被激活的下游节点集合」算出来，再挑出真正通向本 join 的入边。
      const activated = this.collectActivatedFlows()
      return this.arriveAtJoin(
        execution,
        node,
        activated === null
          ? node.incoming
          : node.incoming.filter((flowId) => {
              const flow = this.model.flows[flowId]
              return flow !== undefined && activated.has(flow.sourceId)
            }),
      )
    }

    const activity = this.beginActivity(execution, node)
    this.completeActivity(activity)

    // fork：走所有条件为真的分支；无条件分支视为命中
    const flows = node.outgoing
      .map((id) => this.model.flows[id])
      .filter((f): f is NonNullable<typeof f> => f !== undefined)

    const matched = flows.filter(
      (f) => f.condition === null || evaluateCondition(f.condition, this.variables),
    )
    const chosen = matched.length > 0 ? matched : flows.filter((f) => f.isDefault)
    if (chosen.length === 0) {
      throw new EngineException(`包含网关 "${node.nodeId}" 没有任何分支被激活`)
    }

    // 记录本次激活集合，供对应的 join 使用（spec §4.7）
    this.state.activeBranchSets[node.nodeId] = chosen.map((f) => f.flowId)

    if (chosen.length === 1) {
      this.takeFlow(execution, chosen[0].flowId)
      return false
    }

    // 与并行网关同理：其余分支新建 token，当前 token 走第一条并由主循环继续推进
    for (const flow of chosen.slice(1)) {
      this.spawnChild(execution, flow.flowId)
    }
    this.takeFlow(execution, chosen[0].flowId)
    return false
  }

  // ---------------------------------------------------------------- join 汇聚

  /**
   * 到达 join 网关（spec §4.7，最高风险区）。
   *
   * AND join：等待该网关**所有** incoming 各到达一次。
   * OR  join：只等待 `required`（本次实际激活的分支集合）。
   *
   * 到达的 token 挂起（WAITING）；当 required 全部到齐时，
   * 保留一个 token 继续向下，其余标记完成（合并）。
   */
  private arriveAtJoin(
    execution: EngineExecution,
    node: CompiledNode,
    required: string[],
  ): boolean {
    const arrivingFlow = execution.arrivedVia
    if (arrivingFlow === null) {
      throw new EngineException(`token 到达汇聚网关 "${node.nodeId}" 时缺少来源连线`)
    }

    const arrived = this.state.joinArrivals[node.nodeId] ?? []
    if (!arrived.includes(arrivingFlow)) arrived.push(arrivingFlow)
    this.state.joinArrivals[node.nodeId] = arrived

    const allArrived = required.every((flowId) => arrived.includes(flowId))
    if (!allArrived) {
      // 还没齐：挂起等待
      execution.status = 'WAITING'
      return true
    }

    // 齐了：本 token 继续，同时把该 join 上其它挂起的 token 合并掉
    this.state.joinArrivals[node.nodeId] = []
    delete this.state.activeBranchSets[node.nodeId]

    for (const other of this.state.executions) {
      if (other.id === execution.id) continue
      if (other.nodeId !== node.nodeId) continue
      if (other.status !== 'WAITING') continue
      other.status = 'COMPLETED'
    }

    const activity = this.beginActivity(execution, node)
    this.completeActivity(activity)
    this.takeSingleOutgoing(execution, node)
    return false
  }

  /**
   * 由各 fork 记录的激活分支集合，向前遍历得到「本次实际会经过的节点集合」。
   *
   * 用途：包含网关的 join 需要知道哪些入边被激活过。
   * 激活集合本身记在 fork 网关节点上，而对应的 join 是另一个节点，
   * 因此需要沿图向前走，把被激活分支能到达的节点都收集起来。
   *
   * 返回 null 表示当前没有激活集合（例如实例恢复后状态丢失）——
   * 调用方应退化为「等待全部入边」这一保守语义。
   */
  private collectActivatedFlows(): Set<string> | null {
    const starts: string[] = []
    for (const flowIds of Object.values(this.state.activeBranchSets)) {
      for (const flowId of flowIds) {
        const flow = this.model.flows[flowId]
        if (flow !== undefined) starts.push(flow.targetId)
      }
    }
    if (starts.length === 0) return null

    const reachable = new Set<string>()
    const queue = [...starts]
    while (queue.length > 0) {
      const nodeId = queue.shift() as string
      if (reachable.has(nodeId)) continue
      reachable.add(nodeId)
      const node = this.model.nodes[nodeId]
      if (node === undefined) continue
      // 到达汇聚网关即停：join 自身不需要再往前
      if (node.incoming.length > 1 && isGatewayNode(node.nodeType)) continue
      for (const flowId of node.outgoing) {
        const flow = this.model.flows[flowId]
        if (flow !== undefined) queue.push(flow.targetId)
      }
    }
    return reachable
  }

  // ---------------------------------------------------------------- 流动

  /** 单出边：直接把 token 移过去。多出边属于 fork，调用方需显式处理。 */
  private takeSingleOutgoing(execution: EngineExecution, node: CompiledNode): void {
    const flows = node.outgoing
      .map((id) => this.model.flows[id])
      .filter((f): f is NonNullable<typeof f> => f !== undefined)
    if (flows.length === 0) {
      throw new EngineException(`节点 "${node.nodeId}" 没有出边`)
    }
    if (flows.length > 1) {
      throw new EngineException(
        `节点 "${node.nodeId}" 有 ${flows.length} 条出边，应使用 fork 语义（网关或多实例）`,
      )
    }
    this.takeFlow(execution, flows[0].flowId)
  }

  /**
   * 让 token 沿指定连线移动，并更新 arrivedVia。
   *
   * ⚠️ 连线本身也要记一条活动实例 —— 这是 Flowable 的行为（ACT_HI_ACTINST 里既有
   *    节点也有 sequenceFlow），而流程图的边高亮依赖它。
   *    实测踩到过：只记节点会让 `highlight` 的 completedActivityIds/activeActivityIds
   *    只有 Java 的一半。
   */
  private takeFlow(execution: EngineExecution, flowId: string): void {
    const flow = this.model.flows[flowId]
    if (flow === undefined) throw new EngineException(`缺少连线 "${flowId}"`)

    const flowActivity = this.beginActivity(execution, {
      nodeId: flow.flowId,
      nodeType: 'sequenceFlow' as NodeType,
      name: '',
      containerId: execution.containerId,
      incoming: [],
      outgoing: [],
      isInitiator: false,
    })
    this.completeActivity(flowActivity)

    execution.nodeId = flow.targetId
    execution.arrivedVia = flow.flowId
    execution.status = 'ACTIVE'
  }

  /** fork：为每条出边建一个并发 token。 */
  private forkAll(execution: EngineExecution, node: CompiledNode): void {
    const flows = node.outgoing
      .map((id) => this.model.flows[id])
      .filter((f): f is NonNullable<typeof f> => f !== undefined)
    if (flows.length === 0) {
      throw new EngineException(`网关 "${node.nodeId}" 没有出边，无法 fork`)
    }
    // 第一个分支复用当前 token，其余新建
    const [first, ...rest] = flows
    this.takeFlow(execution, first.flowId)
    for (const flow of rest) {
      this.spawnChild(execution, flow.flowId)
    }
  }

  /** 新建一个并发 token 并从指定连线出发（同步推进到下一个停点或汇聚）。 */
  private spawnChild(parent: EngineExecution, flowId: string): EngineExecution {
    const flow = this.model.flows[flowId]
    if (flow === undefined) throw new EngineException(`缺少连线 "${flowId}"`)
    const child: EngineExecution = {
      id: this.nextId('exec'),
      nodeId: flow.targetId,
      arrivedVia: flow.flowId,
      parentId: parent.parentId ?? parent.id,
      scopeId: parent.scopeId,
      containerId: parent.containerId,
      status: 'ACTIVE',
      isScope: false,
      miRootId: parent.miRootId,
      miIndex: parent.miIndex,
    }
    this.state.executions.push(child)
    this.advance(child)
    return child
  }

  // ---------------------------------------------------------------- 子流程

  private handleSubProcess(execution: EngineExecution, node: CompiledNode): boolean {
    const activity = this.beginActivity(execution, node)
    const scope: EngineExecution = {
      ...execution,
      id: this.nextId('scope'),
      status: 'WAITING',
      isScope: true,
    }
    this.state.executions.push(scope)

    const children = this.model.containers[node.nodeId] ?? []
    const startChild = children.find((id) => this.model.nodes[id]?.nodeType === 'startEvent')
    if (startChild === undefined) {
      throw new EngineException(`子流程 "${node.nodeId}" 缺少 startEvent`)
    }

    const inner: EngineExecution = {
      id: this.nextId('exec'),
      nodeId: startChild,
      arrivedVia: null,
      parentId: scope.id,
      scopeId: scope.id,
      containerId: node.nodeId,
      status: 'ACTIVE',
      isScope: false,
      miRootId: null,
      miIndex: null,
    }
    this.state.executions.push(inner)
    // 子流程活动在内部结束后才完成，这里先留 ACTIVE
    activity.status = 'ACTIVE'
    this.advance(inner)
    return true
  }

  /** token 到达 endEvent：结束其作用域；顶层则整个实例完成。 */
  private finishScope(execution: EngineExecution): void {
    execution.status = 'COMPLETED'

    const scope = execution.scopeId
    if (scope === null) {
      // 顶层结束
      if (this.state.executions.every((e) => e.status === 'COMPLETED')) {
        this.state.status = 'COMPLETED'
      }
      return
    }

    // 子流程结束：若该作用域内已无活跃 token，则父 token 继续
    const siblings = this.state.executions.filter(
      (e) => e.scopeId === scope && e.status !== 'COMPLETED',
    )
    if (siblings.length > 0) return

    const scopeExecution = this.state.executions.find((e) => e.id === scope)
    if (scopeExecution === undefined) return

    // 完成子流程活动
    for (const activity of this.state.activities) {
      if (activity.nodeId === scopeExecution.nodeId && activity.status === 'ACTIVE') {
        this.completeActivity(activity)
      }
    }

    // 作用域完成后，从父 token 所在节点继续（子流程节点自身的出边）
    const parentExec = this.state.executions.find(
      (e) => e.nodeId === scopeExecution.nodeId && e.id !== scopeExecution.id && !e.isScope,
    )
    if (parentExec !== undefined) {
      parentExec.status = 'ACTIVE'
      scopeExecution.status = 'COMPLETED'
      const node = this.model.nodes[parentExec.nodeId]
      if (node !== undefined) this.takeSingleOutgoing(parentExec, node)
      this.advance(parentExec)
    } else {
      scopeExecution.status = 'COMPLETED'
    }
  }

  // ---------------------------------------------------------------- 任务

  private beginActivity(execution: EngineExecution, node: CompiledNode): EngineActivity {
    const activity: EngineActivity = {
      id: this.nextId('act'),
      executionId: execution.id,
      nodeId: node.nodeId,
      nodeType: node.nodeType,
      status: 'ACTIVE',
      miRootId: execution.miRootId,
      miIndex: execution.miIndex,
      startTime: this.clock(),
      endTime: null,
    }
    this.state.activities.push(activity)
    return activity
  }

  private completeActivity(activity: EngineActivity): void {
    activity.status = 'COMPLETED'
    activity.endTime = this.clock()
  }

  private createTask(
    execution: EngineExecution,
    node: CompiledNode,
    assignee: string | null,
    candidateUsersOrIndex: string[] | number | null,
  ): EngineTask {
    const candidateUsers = Array.isArray(candidateUsersOrIndex) ? candidateUsersOrIndex : []
    const miIndex =
      typeof candidateUsersOrIndex === 'number'
        ? candidateUsersOrIndex
        : (execution.miIndex ?? null)
    const task: EngineTask = {
      id: this.nextId('task'),
      executionId: execution.id,
      nodeId: node.nodeId,
      assignee,
      candidateUsers,
      status: 'CREATED',
      miIndex,
      createTime: this.clock(),
      claimTime: null,
      endTime: null,
    }
    this.state.tasks.push(task)
    return task
  }

  private completeTaskRecord(task: EngineTask): void {
    task.status = 'COMPLETED'
    task.endTime = this.clock()
  }

  // ---------------------------------------------------------------- 外部动作

  /** 查一个仍在待办状态的任务。 */
  findTask(taskId: string): EngineTask {
    const task = this.state.tasks.find((t) => t.id === taskId)
    if (task === undefined) throw new EngineException(`Task not found: ${taskId}`)
    return task
  }

  /** 待办任务（供测试断言）。 */
  openTasks(): EngineTask[] {
    // CLAIMED 仍是待办（已被签收但未处理）
    return this.state.tasks.filter((t) => t.status === 'CREATED' || t.status === 'CLAIMED')
  }

  /**
   * 完成任务并继续流转。
   *
   * 多实例语义：
   *   - countersign：全部子实例完成才整体完成
   *   - or_sign：任一完成即整体完成，并**取消其余子实例**
   *   - sequential：完成当前后建下一个；全部完成则整体完成
   */
  completeTask(taskId: string, variables: Record<string, unknown> = {}): void {
    const task = this.findTask(taskId)
    // ⚠️ CLAIMED 也必须可完成：签收只是换了办理人，不是终态。
    //    只认 CREATED 会让「先 claim 再 complete」这一正常流程直接报「任务已处理」（实测踩到过）。
    if (task.status !== 'CREATED' && task.status !== 'CLAIMED') {
      throw new EngineException(`任务已处理: ${taskId}`)
    }
    Object.assign(this.variables, variables)
    this.completeTaskRecord(task)

    const execution = this.state.executions.find((e) => e.id === task.executionId)
    if (execution === undefined) throw new EngineException(`任务 ${taskId} 找不到对应 token`)

    // 结束该任务对应的活动实例
    for (const activity of this.state.activities) {
      if (activity.executionId === execution.id && activity.status === 'ACTIVE') {
        this.completeActivity(activity)
      }
    }

    if (execution.miRootId === null) {
      // 单实例：token 继续
      execution.status = 'ACTIVE'
      const node = this.model.nodes[execution.nodeId]
      if (node === undefined) throw new EngineException(`缺少节点 "${execution.nodeId}"`)
      this.takeSingleOutgoing(execution, node)
      this.advance(execution)
      return
    }

    this.continueMultiInstance(execution)
  }

  /** 多实例完成后的判定（spec §4.6）。 */
  private continueMultiInstance(execution: EngineExecution): void {
    const miRootId = execution.miRootId as string
    const root = this.state.executions.find((e) => e.id === miRootId)
    if (root === undefined) throw new EngineException(`多实例根 ${miRootId} 不存在`)
    const node = this.model.nodes[root.nodeId]
    if (node === undefined) throw new EngineException(`多实例节点 "${root.nodeId}" 不存在`)
    const multiMode = node.approval?.multiMode ?? 'countersign'

    execution.status = 'COMPLETED'

    const siblings = this.state.executions.filter(
      (e) => e.miRootId === miRootId && e.id !== root.id && e.status !== 'COMPLETED',
    )
    const openSiblings = siblings.filter((e) => e.status === 'WAITING')

    if (multiMode === 'or_sign') {
      // 或签：本实例完成即整体完成，取消其余
      for (const sibling of siblings) {
        sibling.status = 'COMPLETED'
        this.cancelTasksOfExecution(sibling.id)
      }
      this.completeMultiInstanceRoot(root, node, multiMode)
      return
    }

    if (multiMode === 'sequential' && openSiblings.length === 0) {
      // 依次审批：建下一个
      const approvers =
        node.approval?.userIds && node.approval.userIds.length > 0
          ? node.approval.userIds
          : node.assignee
            ? [node.assignee]
            : []
      const completedCount = this.state.executions.filter(
        (e) => e.miRootId === miRootId && e.status === 'COMPLETED' && e.id !== root.id,
      ).length
      if (completedCount < approvers.length) {
        this.createMiChild(root, node, approvers[completedCount], completedCount)
        return
      }
      this.completeMultiInstanceRoot(root, node, multiMode)
      return
    }

    if (openSiblings.length === 0) {
      this.completeMultiInstanceRoot(root, node, multiMode)
    }
  }

  private cancelTasksOfExecution(executionId: string): void {
    for (const t of this.state.tasks) {
      if (t.executionId === executionId && t.status === 'CREATED') {
        t.status = 'CANCELLED'
        t.endTime = this.clock()
      }
    }
    for (const a of this.state.activities) {
      if (a.executionId === executionId && a.status === 'ACTIVE') {
        a.status = 'CANCELLED'
        a.endTime = this.clock()
      }
    }
  }

  /** 多实例整体完成：完成 MI 根活动，并让流程继续向下。 */
  private completeMultiInstanceRoot(
    root: EngineExecution,
    node: CompiledNode,
    _multiMode: string,
  ): void {
    for (const activity of this.state.activities) {
      if (activity.executionId === root.id && activity.status === 'ACTIVE') {
        this.completeActivity(activity)
      }
    }
    // 顶层的第一个子实例用 root 的父 token 继续；这里直接让 root 自身下游推进
    root.status = 'ACTIVE'
    root.isScope = false
    this.takeSingleOutgoing(root, node)
    this.advance(root)
  }


  /**
   * 驳回：把 token 移回发起人节点（spec §4.8）。
   *
   * 精确复刻 Java `RejectService` 的关键语义：
   *   - 当前节点已是发起人节点 → 报错（消息逐字一致）
   *   - 取消沿途全部活动实例与多实例子实例（避免「幽灵待办」）
   *   - 设置 rejected = true
   *
   * ⚠️ **只设 `rejected`，不设别的变量**：契约场景「任务驳回」实测 Java 侧的
   *    流程变量是 `{amount, rejected, initiator}` —— 原先这里还写过
   *    `rejectReason = reason`，导致 `GET /process-instances/{id}/variables`
   *    和任务详情的 `variables` 都多出一个 Java 没有的字段（契约比对当场抓到的）。
   *    驳回原因是写在**审批意见**（`wf_task_comment.comment`）里的，不进流程变量。
   */
  reject(taskId: string, reason: string | null = null): void {
    void reason
    const task = this.findTask(taskId)
    const execution = this.state.executions.find((e) => e.id === task.executionId)
    if (execution === undefined) throw new EngineException(`任务 ${taskId} 找不到对应 token`)

    const initiatorNodeId = this.model.initiatorNodeId
    if (initiatorNodeId === null) {
      throw new EngineException(
        `Initiator node not found for process definition: ${this.model.processKey}`,
      )
    }
    if (execution.nodeId === initiatorNodeId) {
      throw new EngineException('Cannot reject: current node is already the initiator node')
    }

    this.variables.rejected = true

    // 取消**整条实例上**全部仍活跃的 token 与其待办 —— 包括被驳回的那个任务本身。
    // 驳回是把整个实例退回发起人；若只取消同节点、或漏掉被驳回的任务，
    // 并行分支上的其它 token 与原任务都会残留成「幽灵待办」（实测踩到过）。
    // 注意：被驳回的 token 会在下面被复用为「继续流转的载体」，所以这里一并取消是安全的。
    for (const e of this.state.executions) {
      if (e.status === 'COMPLETED') continue
      e.status = 'COMPLETED'
      this.cancelTasksOfExecution(e.id)
    }

    // 把 token 移回发起人节点并推进（发起人节点会自动完成，回到发起人填报）
    execution.status = 'ACTIVE'
    execution.nodeId = initiatorNodeId
    execution.arrivedVia = null
    execution.miRootId = null
    execution.miIndex = null
    this.advance(execution)
  }

  /**
   * 加签：给当前任务**增加审批人**（复刻 Java `AddSignService.addSign` 的 MI 分支）。
   *
   * ⚠️ **调用方负责分辨 MI / 非 MI**：非 MI 节点的加签在 Java 里走的是
   *    `addCandidateUser`（加候选人），压根不进引擎 —— 所以这里对非 MI 直接抛错，
   *    由 `TaskService.addSignTask` 在调用前分流（不要在这里"顺手兜底"，
   *    否则「引擎只管 MI」这条边界就糊了）。
   *
   * ⚠️ 新增子实例的序号接着**当前活跃**的子实例数（与 `forwardSign` 同一口径，
   *    且必须排除 MI 根自身 —— 根的 `miRootId` 指向它自己）：
   *    golden 实测 2 人 + 加签 1 人 ⇒ 新人 `loopCounter=2`、`nrOfInstances` 2→3。
   */
  addSign(taskId: string, userIds: string[]): void {
    const task = this.findTask(taskId)
    const execution = this.state.executions.find((e) => e.id === task.executionId)
    if (execution === undefined) throw new EngineException(`任务 ${taskId} 找不到对应 token`)
    if (execution.miRootId === null) {
      throw new EngineException('加签仅适用于多实例节点')
    }
    const root = this.state.executions.find((e) => e.id === execution.miRootId)
    const node = root === undefined ? undefined : this.model.nodes[root.nodeId]
    if (root === undefined || node === undefined) throw new EngineException('多实例根不存在')

    let index = this.state.executions.filter(
      (e) => e.miRootId === root.id && e.id !== root.id && e.status !== 'COMPLETED',
    ).length
    for (const user of userIds) {
      this.createMiChild(root, node, user, index)
      index += 1
    }
  }

  /**
   * 转签：多实例中把当前审批人的实例换成另一个人（spec §4.6）。
   * 删除的实例**不计入完成计数** —— 复刻 `deleteMultiInstanceExecution(executionId, false)`。
   */
  forwardSign(taskId: string, toUser: string): void {
    const task = this.findTask(taskId)
    const execution = this.state.executions.find((e) => e.id === task.executionId)
    if (execution === undefined) throw new EngineException(`任务 ${taskId} 找不到对应 token`)
    if (execution.miRootId === null) throw new EngineException('转签仅适用于多实例节点')

    const root = this.state.executions.find((e) => e.id === execution.miRootId)
    const node = root === undefined ? undefined : this.model.nodes[root.nodeId]
    if (root === undefined || node === undefined) throw new EngineException('多实例根不存在')

    // 删除当前实例（**不计完成**）并取消其任务
    //
    // ⚠️ 两处都不能改成"标记 COMPLETED"：
    //    ① 标成 COMPLETED 会让会签的完成计数 +1，`nrOfCompletedInstances` 立刻偏离
    //       Java（golden：转签后仍是 0），completionCondition 还可能被提前满足；
    //    ② 新实例的**序号**要接着腾出来的那个槽位（Java 的 loopCounter=1），
    //       所以先把它从列表里摘掉再数剩余子实例。
    //    照抄的是 `deleteMultiInstanceExecution(executionId, false)`。
    execution.status = 'COMPLETED'
    this.cancelTasksOfExecution(execution.id)
    const at = this.state.executions.indexOf(execution)
    if (at >= 0) this.state.executions.splice(at, 1)

    const existing = this.state.executions.filter(
      (e) => e.miRootId === root.id && e.id !== root.id && e.status !== 'COMPLETED',
    ).length
    this.createMiChild(root, node, toUser, existing)
  }
}