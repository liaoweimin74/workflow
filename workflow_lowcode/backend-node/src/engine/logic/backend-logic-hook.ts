import { Injectable } from '@nestjs/common'
import { EnginePersistence } from '../runtime/engine-persistence'
import type { EngineState } from '../runtime/engine-runtime'
import {
  BackendLogicExecutor,
  type BackendLogicTrigger,
} from './backend-logic-executor'

/**
 * 本次引擎调用里**新完成**的结束事件节点 id（对齐 Java 的 `ACTIVITY_COMPLETED(endEvent)`）。
 *
 * 引擎是同步的，一次 `completeTask` / `start` 可能连推多个自动节点（含子流程里的结束事件），
 * 所以用「调用前后的活动集合求差」来定位「这一次真正走到的结束事件」——
 * 只按 `endTime != null` 收集会把上一次调用里的结束事件重复触发一遍。
 *
 * `before` 传调用前 `state.activities` 里已完成活动的 id 集合（新实例传空集）。
 */
export function newlyCompletedEndEventNodeIds(
  state: EngineState,
  before: ReadonlySet<string>,
): string[] {
  const out: string[] = []
  for (const activity of state.activities) {
    if (activity.endTime === null) continue
    if (before.has(activity.id)) continue
    if (activity.nodeType !== 'endEvent') continue
    if (!out.includes(activity.nodeId)) out.push(activity.nodeId)
  }
  return out
}

/** 调用引擎**之前**该收集的快照（供 `newlyCompletedEndEventNodeIds` 求差）。 */
export function completedActivityIdSnapshot(state: EngineState): Set<string> {
  const ids = new Set<string>()
  for (const activity of state.activities) {
    if (activity.endTime !== null) ids.add(activity.id)
  }
  return ids
}

/**
 * 后端逻辑的**触发适配层**：把「引擎事件」翻译成 `BackendLogicExecutor.execute(...)` 调用。
 *
 * ## 为什么需要这一层（而不是直接在引擎里调）
 * 自研引擎的运行时（`EngineRuntime`）是**同步**的（`start` / `completeTask` 都是 `void`），
 * 而后端逻辑里的 HTTP 动作**必须异步**。硬把引擎改成异步会牵动整个运行时与全部既有契约，
 * 代价极高且与本次目标无关。
 *
 * 于是采用「服务层挂钩」：引擎照旧同步跑完并落库，随后由**异步的服务层**按 Java 的语义
 * 补跑后端逻辑 —— 观测点（HTTP 响应返回时变量已写好）与 Java 一致。
 *
 * ## 与 Java 的触发点对照（另见 `BackendLogicExecutor` 的表格）
 * - **用户任务 ENTER**：Java 在 `ACTIVITY_STARTED(userTask)` 触发，Node 在「引擎返回后扫**新建任务**」触发 ✔
 * - **任务 COMPLETE**：Java 在 `TASK_COMPLETED` 触发，Node 在完成任务后触发 ✔
 * - **结束事件 COMPLETE**：Java 在 `ACTIVITY_COMPLETED(endEvent)` 触发，Node 用
 *   `newlyCompletedEndEventNodeIds` 求差定位本次走到的结束事件 ✔
 * - **流程开始 ENTER**：⚠️ 刻意不做 —— Java 侧因缺陷（把 processInstanceId 当 nodeId）永不触发
 *
 * ## 变量写回
 * `resultVar` 写进传进来的 `vars`（内存态，与引擎刚落库的那份是同一个来源），
 * 全部节点跑完后**一次性** `replaceVariables` 落库 —— 避免每个变量写一次库。
 */
@Injectable()
export class BackendLogicHook {
  constructor(
    private readonly executor: BackendLogicExecutor,
    private readonly persistence: EnginePersistence,
  ) {}

  /**
   * 对若干节点按 `trigger` 执行后端逻辑，并把 `resultVar` 落库。
   *
   * @param processDefinitionId 部署版本 id（取配置快照用）
   * @param instanceId          流程实例 id（写回变量用）
   * @param nodeIds            要触发的节点（会去重并保持首次出现顺序）
   * @param trigger            `ENTER` / `COMPLETE`
   * @param vars               当前流程变量（会被就地修改）
   * @returns 实际执行的后端逻辑条数
   */
  async run(
    processDefinitionId: string,
    instanceId: string,
    nodeIds: string[],
    trigger: BackendLogicTrigger,
    vars: Record<string, unknown>,
  ): Promise<number> {
    const unique = [...new Set(nodeIds.filter((id) => id !== ''))]
    if (unique.length === 0) return 0

    let executed = 0
    let dirty = false
    for (const nodeId of unique) {
      executed += await this.executor.execute({
        processDefinitionId,
        nodeId,
        trigger,
        vars,
        setVariable: async (name, value) => {
          vars[name] = value
          dirty = true
        },
      })
    }
    if (dirty) await this.persistence.replaceVariables(instanceId, vars)
    return executed
  }
}
