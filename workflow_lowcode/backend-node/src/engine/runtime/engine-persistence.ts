import { Inject, Injectable } from '@nestjs/common'
import { Kysely, type Transaction } from 'kysely'
import { KYSELY } from '../../framework/database/database.module'
import type { DB } from '../../framework/database/types'
import type {
  EngineActivity,
  EngineExecution,
  EngineState,
  EngineTask,
} from './engine-runtime'

/**
 * 并发修改冲突（乐观锁 CAS 失败）。
 *
 * ⚠️ 用**普通 `Error`** 而不是 `EngineException`/`BusinessException`：
 *    - `EngineException` 在本项目映射成 **HTTP 400 + `流程引擎错误: ` 前缀**；
 *    - 而 Java 侧对应的 `FlowableOptimisticLockingException` 是**未被特殊处理的
 *      RuntimeException** ⇒ 全局处理器给 **HTTP 500 + body code 500**。
 *    并发冲突是"重试即可"的瞬时状态，语义上更接近引擎内部错误而不是参数错误，
 *    所以对齐 500。
 *
 * ⚠️ 这个分支**契约网覆盖不到**（契约是串行执行的），由
 *    `test/integration/concurrency.spec.ts` 用真并发请求验证。
 */
export function concurrentModification(instanceId: string): Error {
  return new Error(
    `并发修改冲突：流程实例 ${instanceId} 已被另一个请求更新，请重试`,
  )
}

/**
 * 引擎状态的持久化，把 `EngineState` 映射到 wfe_* 表（spec §4.4）。
 *
 * 设计取舍（P1 阶段）：
 *   每次操作后**整实例覆盖式重写**运行时行（先删后插），而不是逐行 upsert。
 *   理由：EngineState 持有该实例的完整真相，且活动/任务都带时间戳，
 *   重写不会丢历史；而 upsert 要处理「状态回退」（如 or_sign 取消其余子实例）
 *   与「转签删除实例」等场景，容易漏。
 *   代价是实例变大后写入放大 —— 已记入待办，P2 视规模改为增量。
 *
 * 变量单独存 wfe_variable：运行期间会被反复读写，与 token 表分离更清晰。
 */

export interface InstanceRow {
  id: string
  tenant_id: string
  process_def_id: string
  process_key: string
  process_name: string | null
  business_key: string | null
  status: string
  initiator: string | null
  parent_instance_id: string | null
  parent_node_id: string | null
  start_time: Date
  end_time: Date | null
  delete_reason: string | null
}

/** 变量表里 type 的取值。P1 只区分这几种即可。 */
type VariableType = 'string' | 'number' | 'boolean' | 'json' | 'date'

/**
 * 构造 `wfe_variable` 的行（实例级变量）。
 *
 * ⚠️ **必须被 `replaceRuntimeRows` 与 `replaceVariables` 共用**：两条路径对同一个
 *    变量名必须给出同样的 id / type / scope_id，否则「整实例重写」与「只改变量」
 *    会产出不同的行，重载时行为就分叉了。
 */
function buildVariableRows(
  instanceId: string,
  variables: Record<string, unknown>,
  now: Date,
): Array<{
  id: string
  instance_id: string
  execution_id: null
  scope_id: string
  name: string
  type: VariableType
  value_json: string | null
  create_time: Date
  update_time: Date
}> {
  return Object.entries(variables).map(([name, value]) => ({
    id: `${instanceId}_${name}`.slice(0, 64),
    instance_id: instanceId,
    execution_id: null,
    // 注意：实例级变量用空串而非 NULL —— MySQL 唯一索引把多个 NULL 视为互不相同，
    // 用 NULL 会让同一变量名可以重复插入（V32 的注释里已说明）。
    scope_id: '',
    name,
    type: detectType(value),
    value_json: value === undefined ? null : JSON.stringify(value),
    create_time: now,
    update_time: now,
  }))
}

function detectType(value: unknown): VariableType {
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'json'
}

/** 把 id 里的数字序号抽出来，用于重载时 seed 引擎计数器。 */
function maxSeqOf(ids: string[]): number {
  let max = 0
  for (const id of ids) {
    const m = /_(\d+)$/.exec(id)
    if (m !== null) max = Math.max(max, Number(m[1]))
  }
  return max
}

@Injectable()
export class EnginePersistence {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  // ------------------------------------------------------------ 实例

  async insertInstance(row: InstanceRow): Promise<void> {
    const now = new Date()
    await this.db
      .insertInto('wfe_process_instance')
      // lock_version 从 0 起（DB 默认值也是 0，这里显式写出以免依赖默认值）
      .values({ ...row, lock_version: 0, created_at: now, updated_at: now })
      .execute()
  }

  /** 读当前乐观锁版本；实例不存在返回 null。 */
  async currentLockVersion(instanceId: string): Promise<number | null> {
    const row = await this.db
      .selectFrom('wfe_process_instance')
      .select('lock_version')
      .where('id', '=', instanceId)
      .executeTakeFirst()
    return row === undefined ? null : Number(row.lock_version)
  }

  /**
   * compare-and-swap：`lock_version` 等于期望值才 +1，返回是否成功。
   *
   * ⚠️ 必须在**写运行时行的同一个事务**里第一步执行 —— 这行 `UPDATE` 会持有该实例行的写锁，
   *    把并发请求串行化；等它提交后第二个请求读到的是新版本 ⇒ 受影响 0 行 ⇒ 抛并发冲突。
   */
  private async bumpLockVersion(
    trx: Transaction<DB>,
    instanceId: string,
    expected: number,
  ): Promise<boolean> {
    const updated = await trx
      .updateTable('wfe_process_instance')
      .set((eb) => ({ lock_version: eb('lock_version', '+', 1), updated_at: new Date() }))
      .where('id', '=', instanceId)
      .where('lock_version', '=', expected)
      .executeTakeFirst()
    return Number(updated.numUpdatedRows ?? 0) === 1
  }

  async findInstance(instanceId: string, tenantId: string): Promise<InstanceRow | null> {
    const row = await this.db
      .selectFrom('wfe_process_instance')
      .select([
        'id',
        'tenant_id',
        'process_def_id',
        'process_key',
        'process_name',
        'business_key',
        'status',
        'initiator',
        'parent_instance_id',
        'parent_node_id',
        'start_time',
        'end_time',
        'delete_reason',
      ])
      .where('id', '=', instanceId)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst()
    return row ?? null
  }

  async updateInstanceStatus(
    instanceId: string,
    status: string,
    endTime: Date | null,
  ): Promise<void> {
    await this.db
      .updateTable('wfe_process_instance')
      .set({ status, end_time: endTime, updated_at: new Date() })
      .where('id', '=', instanceId)
      .execute()
  }

  /**
   * 终止实例：写状态、结束时间与 `delete_reason`，并**退掉运行时行**。
   *
   * 对齐 Java 的 `runtimeService.deleteProcessInstance(id, reason)` —— Flowable 会删掉
   * 运行时实例（含其执行与任务），只留历史。这里做等价的事：
   *   - 实例行保留（我们用它兼作历史表），但状态置为 `TERMINATED`、写结束时间与原因
   *   - 活跃执行置 `COMPLETED`、活跃活动置 `CANCELLED`、未办任务置 `CANCELLED`
   * 不这么做的话，被终止实例的任务会一直留在待办里 —— `GET /tasks` 就会
   * 返回本该消失的条目。
   */
  async terminateInstance(instanceId: string, reason: string): Promise<void> {
    const now = new Date()
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('wfe_process_instance')
        .set({ status: 'TERMINATED', end_time: now, delete_reason: reason, updated_at: now })
        .where('id', '=', instanceId)
        .execute()
      await trx
        .updateTable('wfe_execution')
        .set({ status: 'COMPLETED', is_active: 0, updated_at: now })
        .where('instance_id', '=', instanceId)
        .where('status', '!=', 'COMPLETED')
        .execute()
      await trx
        .updateTable('wfe_activity')
        .set({ status: 'CANCELLED', end_time: now, updated_at: now })
        .where('instance_id', '=', instanceId)
        .where('status', '=', 'ACTIVE')
        .execute()
      await trx
        .updateTable('wfe_task')
        .set({ status: 'CANCELLED', end_time: now, updated_at: now })
        .where('instance_id', '=', instanceId)
        .where('status', 'in', ['CREATED', 'CLAIMED'])
        .execute()
    })
  }

  /** 实例分页（运行中列表）。 */
  async listRunningInstances(
    tenantId: string,
    offset: number,
    limit: number,
  ): Promise<{ rows: InstanceRow[]; total: number }> {
    const countRow = await this.db
      .selectFrom('wfe_process_instance')
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .where('tenant_id', '=', tenantId)
      .where('status', 'in', ['RUNNING', 'SUSPENDED'])
      .executeTakeFirst()

    const rows = await this.db
      .selectFrom('wfe_process_instance')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('status', 'in', ['RUNNING', 'SUSPENDED'])
      .orderBy('start_time', 'desc')
      .limit(limit)
      .offset(offset)
      .execute()

    return { rows: rows as unknown as InstanceRow[], total: Number(countRow?.c ?? 0) }
  }

  /** 实例分页（全部，含已结束）—— 对应「我发起的」历史列表。 */
  async listAllInstances(
    tenantId: string,
    offset: number,
    limit: number,
  ): Promise<{ rows: InstanceRow[]; total: number }> {
    const countRow = await this.db
      .selectFrom('wfe_process_instance')
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst()

    const rows = await this.db
      .selectFrom('wfe_process_instance')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('start_time', 'desc')
      .limit(limit)
      .offset(offset)
      .execute()

    return { rows: rows as unknown as InstanceRow[], total: Number(countRow?.c ?? 0) }
  }

  // ------------------------------------------------------------ 流程定义

  /** 取某 key 的最新已部署版本（发起流程时用）。 */
  async findLatestDeployedDef(
    tenantId: string,
    processKey: string,
  ): Promise<{ id: string; model_json: string; name: string | null; version: number } | null> {
    const row = await this.db
      .selectFrom('wfe_process_def')
      .select(['id', 'model_json', 'name', 'version'])
      .where('tenant_id', '=', tenantId)
      .where('process_key', '=', processKey)
      .where('status', '=', 'ACTIVE')
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst()
    return row ?? null
  }

  async findProcessDefById(
    processDefId: string,
  ): Promise<{ id: string; model_json: string; name: string | null; process_key: string } | null> {
    const row = await this.db
      .selectFrom('wfe_process_def')
      .select(['id', 'model_json', 'name', 'process_key'])
      .where('id', '=', processDefId)
      .executeTakeFirst()
    return row ?? null
  }

  // ------------------------------------------------------------ 用户姓名

  /** userId → nickname，用于 VO 里的 assigneeName / initiatorName。 */
  async findUserNames(userIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(userIds.filter((id) => id !== ''))]
      .map((id) => Number(id))
      .filter((n) => Number.isFinite(n))
    if (ids.length === 0) return new Map()

    const rows = await this.db
      .selectFrom('sys_user')
      .select(['id', 'nickname', 'username'])
      .where('id', 'in', ids)
      .execute()

    const out = new Map<string, string>()
    for (const row of rows) {
      out.set(String(row.id), row.nickname ?? row.username)
    }
    return out
  }

  // ------------------------------------------------------------ 状态装载/保存

  /**
   * 从库中装载实例的引擎状态。
   *
   * `maxSeq` 用于 `runtime.seedSeq()` —— 否则新建的 runtime 会从 1 开始生成 id，
   * 与库中已有 id 冲突。
   */
  async loadState(instanceId: string): Promise<{
    state: EngineState
    variables: Record<string, unknown>
    maxSeq: number
    /**
     * 乐观锁版本（并发控制）。
     *
     * ⚠️ **必须原样传回**给 `replaceRuntimeRows` / `replaceVariables` —— 它俩靠
     *    `WHERE id = ? AND lock_version = <这个值>` 做 compare-and-swap：
     *    期间若被别的请求改过，落库会失败并抛并发冲突，而不是**静默覆盖**对方的推进。
     */
    lockVersion: number
  }> {
    const [executions, activities, tasks, variables, candidates, instance] = await Promise.all([
      this.db.selectFrom('wfe_execution').selectAll().where('instance_id', '=', instanceId).execute(),
      this.db.selectFrom('wfe_activity').selectAll().where('instance_id', '=', instanceId).execute(),
      this.db.selectFrom('wfe_task').selectAll().where('instance_id', '=', instanceId).execute(),
      this.db.selectFrom('wfe_variable').selectAll().where('instance_id', '=', instanceId).execute(),
      this.db
        .selectFrom('wfe_task_candidate as c')
        .innerJoin('wfe_task as t', 't.id', 'c.task_id')
        .select(['c.task_id', 'c.user_id'])
        .where('t.instance_id', '=', instanceId)
        .execute(),
      this.db
        .selectFrom('wfe_process_instance')
        .select('lock_version')
        .where('id', '=', instanceId)
        .executeTakeFirst(),
    ])

    // taskId → 候选人列表
    const candidatesByTask = new Map<string, string[]>()
    for (const row of candidates) {
      const list = candidatesByTask.get(row.task_id) ?? []
      list.push(row.user_id)
      candidatesByTask.set(row.task_id, list)
    }

    const state: EngineState = {
      status: 'RUNNING',
      executions: executions.map(
        (row): EngineExecution => ({
          id: row.id,
          nodeId: row.node_id,
          arrivedVia: null,
          parentId: row.parent_id,
          scopeId: row.scope_id,
          containerId: row.container_id,
          status: row.status as EngineExecution['status'],
          isScope: row.is_scope === 1,
          miRootId: row.mi_root_id,
          miIndex: row.mi_index,
        }),
      ),
      activities: activities.map(
        (row): EngineActivity => ({
          id: row.id,
          executionId: row.execution_id ?? '',
          nodeId: row.node_id,
          nodeType: row.node_type,
          status: row.status as EngineActivity['status'],
          miRootId: row.mi_root_id,
          miIndex: row.mi_index,
          startTime: row.start_time,
          endTime: row.end_time,
        }),
      ),
      tasks: tasks.map(
        (row): EngineTask => ({
          id: row.id,
          executionId: row.execution_id ?? '',
          nodeId: row.node_id,
          assignee: row.assignee,
          candidateUsers: candidatesByTask.get(row.id) ?? [],
          status: row.status as EngineTask['status'],
          miIndex: row.mi_index,
          createTime: row.create_time,
          claimTime: row.claim_time,
          endTime: row.end_time,
        }),
      ),
      joinArrivals: {},
      activeBranchSets: {},
    }

    /**
     * ⚠️ P1 已知限制：`arrivedVia`（token 经由哪条连线到达当前节点）**没有持久化**。
     *
     * 它只在「同一请求内推进到 join 并挂起」时被用到；跨请求恢复后该字段为 null，
     * 汇聚判定会退化为「按全部入边等待」。对单实例审批链路的契约场景没有影响
     * （这些场景里 join 的挂起与到齐发生在同一次 completeTask 调用内），
     * 但**并行分支跨请求挂起在 join 上**的场景需要在 P2 补持久化列。
     * 已记入 docs/superpowers/specs 的待办。
     */
    const variableMap: Record<string, unknown> = {}
    for (const row of variables) {
      variableMap[row.name] = row.value_json === null ? null : JSON.parse(row.value_json)
    }

    const maxSeq = maxSeqOf([
      ...state.executions.map((e) => e.id),
      ...state.activities.map((a) => a.id),
      ...state.tasks.map((t) => t.id),
    ])

    return { state, variables: variableMap, maxSeq, lockVersion: Number(instance?.lock_version ?? 0) }
  }

  /**
   * 只覆盖实例变量（不触碰执行/活动/任务行）。
   *
   * 变量写入走这条路径而不是整表 `replaceRuntimeRows`：后者会把 executions /
   * activities / tasks 全删重建，对一个只改变量的请求来说是无谓的写放大，
   * 也让「没动过的东西」承担了被写坏的风险。
   *
   * 行构造与 `replaceRuntimeRows` 共用 `buildVariableRows` —— 两处必须完全一致，
   * 否则同一个变量会在两条路径下拿到不同的 id / type，重载时行为就分叉了。
   */
  /**
   * ⚠️ `expectedLockVersion` **必须**是 `loadState` 拿到的那个值（并发控制的核心）。
   *    不传时退化为「读当前版本再 CAS，冲突自动重试」—— 只允许**幂等的变量写**这么做
   *    （见 `BackendLogicHook`：它写的是「设置某个 resultVar」，重试是安全的）。
   */
  async replaceVariables(
    instanceId: string,
    variables: Record<string, unknown>,
    expectedLockVersion?: number,
  ): Promise<void> {
    const now = new Date()
    const attempt = async (lockVersion: number): Promise<boolean> => {
      return await this.db.transaction().execute(async (trx) => {
        if (!(await this.bumpLockVersion(trx, instanceId, lockVersion))) return false
        await trx.deleteFrom('wfe_variable').where('instance_id', '=', instanceId).execute()
        const rows = buildVariableRows(instanceId, variables, now)
        if (rows.length > 0) {
          await trx.insertInto('wfe_variable').values(rows).execute()
        }
        return true
      })
    }

    if (expectedLockVersion !== undefined) {
      if (!(await attempt(expectedLockVersion))) {
        throw concurrentModification(instanceId)
      }
      return
    }
    // 未传版本：读-算-写重试（最多 3 次）。写的是整份变量表，重试语义等价。
    for (let i = 0; i < 3; i++) {
      const current = await this.currentLockVersion(instanceId)
      if (current === null) throw new Error(`流程实例不存在: ${instanceId}`)
      if (await attempt(current)) return
    }
    throw concurrentModification(instanceId)
  }

  /** 覆盖式写入运行时行（先删后插，保留时间戳）。 */
  async replaceRuntimeRows(
    instanceId: string,
    tenantId: string,
    state: EngineState,
    variables: Record<string, unknown>,
    expectedLockVersion: number,
  ): Promise<void> {
    const now = new Date()

    await this.db.transaction().execute(async (trx) => {
      /**
       * ⚠️ **CAS 必须在所有写入之前**，而且必须在这个事务里：
       *    `UPDATE ... WHERE id = ? AND lock_version = ?` 会先取该实例行的写锁 ——
       *    并发的第二个请求会**阻塞**到这里，等第一个提交后拿到 0 行受影响
       *    ⇒ 抛并发冲突。整份运行时行（先删后插）因此不可能被两个请求交错写坏。
       */
      if (!(await this.bumpLockVersion(trx, instanceId, expectedLockVersion))) {
        throw concurrentModification(instanceId)
      }
      // 先取本实例的任务 id，用于清候选人表 ——
      // Kysely 的 DELETE 不支持 JOIN，用子查询形式的 IN 又容易在方言上出问题，
      // 因此显式两步。
      const existingTaskIds = (
        await trx.selectFrom('wfe_task').select('id').where('instance_id', '=', instanceId).execute()
      ).map((r) => r.id)

      if (existingTaskIds.length > 0) {
        await trx
          .deleteFrom('wfe_task_candidate')
          .where('task_id', 'in', existingTaskIds)
          .execute()
      }
      await trx.deleteFrom('wfe_execution').where('instance_id', '=', instanceId).execute()
      await trx.deleteFrom('wfe_activity').where('instance_id', '=', instanceId).execute()
      await trx.deleteFrom('wfe_task').where('instance_id', '=', instanceId).execute()

      if (state.executions.length > 0) {
        await trx
          .insertInto('wfe_execution')
          .values(
            state.executions.map((e) => ({
              id: e.id,
              instance_id: instanceId,
              parent_id: e.parentId,
              node_id: e.nodeId,
              container_id: e.containerId,
              scope_id: e.scopeId,
              status: e.status,
              is_active: e.status === 'ACTIVE' ? 1 : 0,
              is_concurrent: e.parentId !== null ? 1 : 0,
              is_scope: e.isScope ? 1 : 0,
              mi_root_id: e.miRootId,
              mi_index: e.miIndex,
              called_instance_id: null,
              created_at: now,
              updated_at: now,
            })),
          )
          .execute()
      }

      if (state.activities.length > 0) {
        await trx
          .insertInto('wfe_activity')
          .values(
            state.activities.map((a) => ({
              id: a.id,
              instance_id: instanceId,
              execution_id: a.executionId,
              node_id: a.nodeId,
              node_type: a.nodeType,
              node_name: null,
              status: a.status,
              start_time: a.startTime,
              end_time: a.endTime,
              duration_ms:
                a.endTime === null ? null : a.endTime.getTime() - a.startTime.getTime(),
              mi_root_id: a.miRootId,
              mi_index: a.miIndex,
              created_at: now,
              updated_at: now,
            })),
          )
          .execute()
      }

      if (state.tasks.length > 0) {
        await trx
          .insertInto('wfe_task')
          .values(
            state.tasks.map((t) => ({
              id: t.id,
              tenant_id: tenantId,
              instance_id: instanceId,
              execution_id: t.executionId,
              node_id: t.nodeId,
              activity_instance_id: null,
              name: null,
              assignee: t.assignee,
              status: t.status,
              create_time: t.createTime,
              claim_time: t.claimTime,
              end_time: t.endTime,
              due_date: null,
              mi_index: t.miIndex,
              created_at: now,
              updated_at: now,
            })),
          )
          .execute()

        const candidates = state.tasks.flatMap((t) =>
          t.candidateUsers.map((user) => ({
            id: `${t.id}_${user}`,
            task_id: t.id,
            user_id: user,
            created_at: now,
          })),
        )
        if (candidates.length > 0) {
          await trx.insertInto('wfe_task_candidate').values(candidates).execute()
        }
      }

      // 变量：整实例覆盖，保证与引擎内存态一致
      await trx.deleteFrom('wfe_variable').where('instance_id', '=', instanceId).execute()
      const variableRows = buildVariableRows(instanceId, variables, now)
      if (variableRows.length > 0) {
        await trx.insertInto('wfe_variable').values(variableRows).execute()
      }
    })
  }

  /**
   * 按开始时间升序取全部活动实例。
   *
   * ⚠️ 顺序是契约的一部分：Java 的高亮接口按 `orderByHistoricActivityInstanceStartTime asc`
   *    查询，返回的数组是**按时间推进的顺序**。不排序会让两侧的数组顺序不一致
   *    （实测踩到过：completedActivityIds 的元素顺序完全不同）。
   */
  async findActivitiesOrdered(
    instanceId: string,
  ): Promise<Array<{ node_id: string; status: string; start_time: Date; end_time: Date | null }>> {
    return this.db
      .selectFrom('wfe_activity')
      .select(['node_id', 'status', 'start_time', 'end_time'])
      .where('instance_id', '=', instanceId)
      .orderBy('start_time', 'asc')
      .execute()
  }

  /** 运行中的活动实例（供流程图高亮）。 */
  async findActiveActivities(instanceId: string): Promise<Array<{ node_id: string }>> {
    return this.db
      .selectFrom('wfe_activity')
      .select('node_id')
      .where('instance_id', '=', instanceId)
      .where('status', '=', 'ACTIVE')
      .execute()
  }

  /** 已完成的活动实例。 */
  async findCompletedActivities(instanceId: string): Promise<Array<{ node_id: string }>> {
    return this.db
      .selectFrom('wfe_activity')
      .select('node_id')
      .where('instance_id', '=', instanceId)
      .where('status', '=', 'COMPLETED')
      .execute()
  }

  /** 某实例下的任务（供任务列表与详情）。 */
  async findTasks(instanceId: string): Promise<
    Array<{
      id: string
      node_id: string
      assignee: string | null
      status: string
      create_time: Date
      end_time: Date | null
      execution_id: string | null
    }>
  > {
    return this.db
      .selectFrom('wfe_task')
      .select(['id', 'node_id', 'assignee', 'status', 'create_time', 'end_time', 'execution_id'])
      .where('instance_id', '=', instanceId)
      .execute()
  }

  /** 按办理人查待办。 */
  async findOpenTasksByAssignee(
    tenantId: string,
    assignee: string,
    offset: number,
    limit: number,
  ): Promise<{ rows: TaskJoinRow[]; total: number }> {
    const countRow = await this.db
      .selectFrom('wfe_task')
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .where('tenant_id', '=', tenantId)
      .where('assignee', '=', assignee)
      .where('status', 'in', ['CREATED', 'CLAIMED'])
      .executeTakeFirst()

    const rows = await this.db
      .selectFrom('wfe_task as t')
      .innerJoin('wfe_process_instance as i', 'i.id', 't.instance_id')
      .select([
        't.id as task_id',
        't.node_id',
        't.assignee',
        't.status as task_status',
        't.create_time',
        'i.id as instance_id',
        'i.business_key',
        'i.process_def_id',
        'i.process_name',
        'i.initiator',
      ])
      .where('t.tenant_id', '=', tenantId)
      .where('t.assignee', '=', assignee)
      .where('t.status', 'in', ['CREATED', 'CLAIMED'])
      .orderBy('t.create_time', 'desc')
      .limit(limit)
      .offset(offset)
      .execute()

    return { rows: rows as unknown as TaskJoinRow[], total: Number(countRow?.c ?? 0) }
  }

  /** 按办理人查已办。 */
  async findDoneTasksByUser(
    tenantId: string,
    userId: string,
    offset: number,
    limit: number,
  ): Promise<{ rows: TaskJoinRow[]; total: number }> {
    const countRow = await this.db
      .selectFrom('wfe_task')
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .where('tenant_id', '=', tenantId)
      .where('assignee', '=', userId)
      .where('status', '=', 'COMPLETED')
      .executeTakeFirst()

    const rows = await this.db
      .selectFrom('wfe_task as t')
      .innerJoin('wfe_process_instance as i', 'i.id', 't.instance_id')
      .select([
        't.id as task_id',
        't.node_id',
        't.assignee',
        't.status as task_status',
        't.create_time',
        't.end_time',
        'i.id as instance_id',
        'i.business_key',
        'i.process_def_id',
        'i.process_name',
        'i.initiator',
      ])
      .where('t.tenant_id', '=', tenantId)
      .where('t.assignee', '=', userId)
      .where('t.status', '=', 'COMPLETED')
      .orderBy('t.end_time', 'desc')
      .limit(limit)
      .offset(offset)
      .execute()

    return { rows: rows as unknown as TaskJoinRow[], total: Number(countRow?.c ?? 0) }
  }

  /** 按任务 ID 取任务及其实例信息。 */
  /**
   * 按任务 id 取「**活跃**任务」及其所属实例。
   *
   * ⚠️ **必须过滤掉非活跃任务**：Java 侧所有写操作都走 Flowable 的
   *    `taskService.createTaskQuery().taskId(id).singleResult()`，而运行时任务查询
   *    **只返回仍然存在的运行时任务** —— 已完成（COMPLETED）或被终止
   *    （CANCELLED，例如流程被 refuse/terminate）的任务一律查不到，于是
   *    `IllegalStateException("Task not found: ...")` → HTTP 500。
   *    本方法原先不带状态过滤，会让「对已终止流程的任务再操作一次」在 Node 侧
   *    **静默成功**、而 Java 侧报 500 —— 这类偏差在契约里是硬伤。
   *    调用方（claim / complete / reject / refuse / remind）都依赖这个名字，
   *    修在这里即全部生效。
   */
  async findTaskWithInstance(
    taskId: string,
    tenantId: string,
  ): Promise<(TaskJoinRow & { node_id: string }) | null> {
    const row = await this.db
      .selectFrom('wfe_task as t')
      .innerJoin('wfe_process_instance as i', 'i.id', 't.instance_id')
      .select([
        't.id as task_id',
        't.node_id',
        't.assignee',
        't.status as task_status',
        't.create_time',
        'i.id as instance_id',
        'i.business_key',
        'i.process_def_id',
        'i.process_name',
        'i.initiator',
      ])
      .where('t.id', '=', taskId)
      .where('t.tenant_id', '=', tenantId)
      .where('t.status', 'in', ['CREATED', 'CLAIMED'])
      .executeTakeFirst()
    return (row as unknown as TaskJoinRow & { node_id: string }) ?? null
  }

  /**
   * 取任务（**含已结束的**）—— 任务详情的历史回退用。
   *
   * ⚠️ 为什么需要它：Java 的 `GET /tasks/{id}` 在运行时任务已消失时**回退到历史任务**
   *    （`historyService`），而不是 404。实测两处：转签后查原任务、委派任务被完成之后
   *    （`dvTaskAfterComplete`：任务已随流程结束而结束，Java 仍返回 200 + 该任务的
   *    历史快照，assignee 是 resolve 后归还的 owner）。
   *
   * ⚠️ **这个方法不能给写操作路径用**：写操作必须只认「仍在待办」的任务，否则
   *    「对已结束的任务再操作一次」会在 Node 侧静默成功（Java 报 500）—— 那正是
   *    `findTaskWithInstance` 加状态过滤的原因。两者刻意并存，别合并。
   */
  async findTaskIncludingFinished(
    taskId: string,
    tenantId: string,
  ): Promise<(TaskJoinRow & { node_id: string }) | null> {
    const row = await this.db
      .selectFrom('wfe_task as t')
      .innerJoin('wfe_process_instance as i', 'i.id', 't.instance_id')
      .select([
        't.id as task_id',
        't.node_id',
        't.assignee',
        't.status as task_status',
        't.create_time',
        'i.id as instance_id',
        'i.business_key',
        'i.process_def_id',
        'i.process_name',
        'i.initiator',
      ])
      .where('t.id', '=', taskId)
      .where('t.tenant_id', '=', tenantId)
      .executeTakeFirst()
    return (row as unknown as TaskJoinRow & { node_id: string }) ?? null
  }

  /** 任务的候选人。 */
  async findTaskCandidates(taskId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('wfe_task_candidate')
      .select('user_id')
      .where('task_id', '=', taskId)
      .execute()
    return rows.map((r) => r.user_id)
  }

  /**
   * 实例的全部节点活动（用于**流转记录/审批时间线**）。
   *
   * ⚠️ 必须带上 `node_name`：Java 的时间线取的是**历史活动实例**上记的
   *    `activityName`（发放当时 BPMN 里的名字），而不是当前模型里的名字 ——
   *    流程重新部署改了节点名之后，历史记录要保留旧名。
   */
  async findActivitiesForHistory(instanceId: string): Promise<
    Array<{
      node_id: string
      node_name: string | null
      node_type: string
      status: string
      execution_id: string | null
      start_time: Date
      end_time: Date | null
      mi_index: number | null
    }>
  > {
    return this.db
      .selectFrom('wfe_activity')
      .select([
        'node_id',
        'node_name',
        'node_type',
        'status',
        'execution_id',
        'start_time',
        'end_time',
        'mi_index',
      ])
      .where('instance_id', '=', instanceId)
      .orderBy('start_time', 'asc')
      .execute()
  }
}

/** 任务 join 实例后的扁平行。 */
export interface TaskJoinRow {
  task_id: string
  node_id: string
  assignee: string | null
  task_status: string
  create_time: Date
  end_time?: Date | null
  instance_id: string
  business_key: string | null
  process_def_id: string
  process_name: string | null
  initiator: string | null
}
