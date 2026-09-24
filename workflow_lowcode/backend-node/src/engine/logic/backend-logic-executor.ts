import { Injectable, Logger } from '@nestjs/common'
import { ProcessDesignRepository } from '../process/repository/process-design.repository'
import {
  type BackendLogicItemConfig,
  parseBackendLogicItems,
} from './backend-logic-config'
import { HttpLogicExecutor } from './http-logic-executor'

/** 触发时机（对齐 Java `BackendLogicEventListener` 的 `ENTER` / `COMPLETE`）。 */
export type BackendLogicTrigger = 'ENTER' | 'COMPLETE'

/** 一致性常量：Java 的 `TYPE_HTTP/BEAN/SCRIPT` 与 `ACTION_CONTINUE`。 */
const TYPE_HTTP = 'http'
const TYPE_BEAN = 'bean'
const TYPE_SCRIPT = 'script'
const ACTION_CONTINUE = 'IGNORE_CONTINUE'

/** 一次执行调用的入参（变量读写由调用方注入，执行器不直接依赖流程实例服务）。 */
export interface BackendLogicContext {
  /** 部署版本 id（`wfe_process_def.id`，形如 `key:version`），用于取**配置快照**。 */
  processDefinitionId: string | null
  /** BPMN 节点 id。 */
  nodeId: string | null
  trigger: BackendLogicTrigger
  /** 当前流程变量（Java 是 `runtimeService.getVariables(executionId)` 的快照）。 */
  vars: Record<string, unknown>
  /** 写回流程变量（Java 是 `runtimeService.setVariable(executionId, name, value)`）。 */
  setVariable: (name: string, value: unknown) => Promise<void>
}

/**
 * 节点级后端逻辑执行器（对齐 Java `BackendLogicExecutor` 157 行 + `ProcessConfigResolver` 102 行）。
 *
 * ## 触发点与 Java 的对应关系
 * | 时机 | Java（`BackendLogicEventListener`） | Node |
 * |---|---|---|
 * | 用户任务 ENTER | `ACTIVITY_STARTED`（`activityType=userTask`），此时**任务已创建** | `ProcessInstanceService.start` / `TaskService.completeTask` 之后按**新建任务**逐个触发 |
 * | 任务 COMPLETE | `TASK_COMPLETED`（nodeId = 任务的 `taskDefinitionKey`） | 完成任务之后触发 |
 * | 结束事件 COMPLETE | `ACTIVITY_COMPLETED`（`activityType=endEvent`） | ⚠️ **未实现**（见类尾注释） |
 * | 流程开始 ENTER | `PROCESS_STARTED`，⚠️ **Java 侧实现有缺陷**（把 processInstanceId 当成 nodeId 传 ⇒ 与 `node_id` 永不匹配） | **刻意不做** —— 与 Java 的可观测行为一致 |
 *
 * ## ⚠️ 「失败不中断」是**照抄**，不是偷懒
 * Java 里 `errorAction=FAIL_FLOW` 会抛 `RuntimeException("Backend logic 'x' failed")`，
 * 但那是从**引擎事件监听器**里抛的，而监听器 `isFailOnException=false` **且自己 catch 掉了所有异常**
 * （`onEvent` 的 try/catch）⇒ 端到端可观测行为是：**两条路径都只留下一条日志，流程继续走**。
 *
 * 因此这里**绝不向上抛错**：如果抛了，异常会一路冒到 API 响应变成 500 —— 那才是与 Java 分叉。
 * `IGNORE_CONTINUE` 与 `FAIL_FLOW` 的差别只体现在日志文案与「是否包一层 `Backend logic 'x' failed`」，
 * 这一点由单测钉住（见 `backend-logic-executor.spec.ts`）。
 *
 * ## 未覆盖部分（显式留痕，不静默）
 * - `type=bean`：Node 没有 Spring 容器与 Bean 白名单（Java 用 `BackendLogicBeanRegistry`）⇒ 记 error 日志后跳过；
 * - `type=script`：Node 没有 Groovy（规格 U2 实测「存量脚本 0 条」，故不投入 JS 沙箱兼容）⇒ 同样记日志跳过；
 * - 未知 type：Java 抛 `UNSUPPORTED_LOGIC_TYPE: x`，同样被监听器吞掉 ⇒ 记日志跳过。
 *
 * 三者都**不能**因为「不支持」就改流程行为 —— 静默跳过在这里是正确的等价实现，
 * 而「响应变 500」或「流程中断」才是分叉。日志里带 `UNSUPPORTED` 前缀便于线上检索。
 */
@Injectable()
export class BackendLogicExecutor {
  private readonly logger = new Logger(BackendLogicExecutor.name)

  constructor(
    private readonly repository: ProcessDesignRepository,
    private readonly httpExecutor: HttpLogicExecutor,
  ) {}

  /**
   * 对某节点执行匹配 `trigger` 的后端逻辑。
   *
   * 返回**实际执行的条数**（供单测与调用方判断；无配置时为 0）。
   * ⚠️ 永不抛错：所有失败都在内部按 Java 监听器的行为记录日志（见类注释）。
   */
  async execute(context: BackendLogicContext): Promise<number> {
    const { processDefinitionId, nodeId, trigger } = context
    if (processDefinitionId === null || processDefinitionId === '') return 0
    if (nodeId === null || nodeId === '') return 0

    let items: BackendLogicItemConfig[]
    try {
      items = await this.resolveItems(processDefinitionId, nodeId)
    } catch (error) {
      // 连配置都读不出来（例如表结构异常）：记日志，不影响流程
      this.logger.error(
        `read backendLogic failed: processDefinitionId=${processDefinitionId} nodeId=${nodeId}: ${messageOf(error)}`,
      )
      return 0
    }
    if (items.length === 0) return 0

    let executed = 0
    for (const item of items) {
      if (!item.enabled) continue
      if (item.trigger === null || item.trigger.toLowerCase() !== trigger.toLowerCase()) continue
      executed += 1
      await this.executeItem(item, context)
    }
    return executed
  }

  /** 读该部署版本的配置快照并解析出该节点的 `backendLogic[]`（对应 Java `ProcessConfigResolver`）。 */
  private async resolveItems(
    processDefinitionId: string,
    nodeId: string,
  ): Promise<BackendLogicItemConfig[]> {
    const row = await this.repository.findNodeConfig(processDefinitionId, nodeId)
    if (row === null) return []
    return parseBackendLogicItems(row.config_json)
  }

  /** 单条执行：成功且配了 `resultVar` → 写回变量；失败 → 按 Java 监听器的可观测行为记日志。 */
  private async executeItem(
    item: BackendLogicItemConfig,
    context: BackendLogicContext,
  ): Promise<void> {
    try {
      const result = await this.dispatch(item, context.vars)
      const resultVar = item.resultVar
      if (resultVar !== null && resultVar.trim() !== '') {
        await context.setVariable(resultVar, result)
      }
    } catch (error) {
      const name = item.name ?? item.id ?? '(unnamed)'
      if (ACTION_CONTINUE.toLowerCase() === (item.errorAction ?? '').toLowerCase()) {
        // Java：log.warn("Backend logic '{}' (type={}) failed, IGNORE_CONTINUE: {}")
        this.logger.warn(
          `Backend logic '${name}' (type=${String(item.type)}) failed, IGNORE_CONTINUE: ${messageOf(error)}`,
        )
        return
      }
      // Java：抛 RuntimeException("Backend logic 'x' failed", e) —— 被监听器吞掉后只剩一条日志
      this.logger.error(
        `Backend logic '${name}' failed: ${messageOf(error)}`,
        error instanceof Error ? error.stack : undefined,
      )
    }
  }

  private async dispatch(
    item: BackendLogicItemConfig,
    vars: Record<string, unknown>,
  ): Promise<unknown> {
    const type = item.type ?? ''
    if (type.toLowerCase() === TYPE_HTTP) return this.executeHttp(item, vars)
    if (type.toLowerCase() === TYPE_BEAN) {
      // Java：executeBean → backendBeanRegistry.invoke(...)；Node 无 Spring 容器
      throw new UnsupportedLogicError('UNSUPPORTED_LOGIC_TYPE: bean（Node 无 Spring Bean 白名单）')
    }
    if (type.toLowerCase() === TYPE_SCRIPT) {
      const language = item.script?.language ?? ''
      throw new UnsupportedLogicError(
        language.toLowerCase() === 'groovy'
          ? 'UNSUPPORTED_LOGIC_TYPE: script（Node 无 Groovy 运行时，规格 U2 实测存量脚本 0 条）'
          : `UNSUPPORTED_LANGUAGE: ${language}`,
      )
    }
    throw new UnsupportedLogicError(`UNSUPPORTED_LOGIC_TYPE: ${type}`)
  }

  /** HTTP 动作：直接复用已移植的 `HttpLogicExecutor`（返回响应体字符串，与 Java 一致）。 */
  private async executeHttp(
    item: BackendLogicItemConfig,
    vars: Record<string, unknown>,
  ): Promise<string> {
    const cfg = item.http
    if (cfg === null) throw new Error('HTTP logic requires http config')
    if (cfg.url === null || cfg.url === '') throw new Error('HTTP logic requires url')
    return this.httpExecutor.execute(
      cfg.url,
      cfg.method ?? 'GET',
      cfg.headers,
      cfg.queryParams,
      cfg.bodyParams,
      vars,
      cfg.connTimeoutMs,
      cfg.readTimeoutMs,
      cfg.retryCount,
    )
  }
}

/** 不支持的动作类型（只用于内部区分日志，不会冒到调用方）。 */
class UnsupportedLogicError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedLogicError'
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
