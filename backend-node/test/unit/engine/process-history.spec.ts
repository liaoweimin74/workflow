import { describe, expect, it } from 'vitest'
import { ProcessInstanceService } from '../../../src/engine/runtime/process-instance.service'
import { runWithTenant } from '../../../src/framework/tenant/tenant-context'

/**
 * 审批时间线的单测（规格 U26）。
 *
 * 契约场景「任务驳回」的 `rjHistory` 已经端到端钉住了主干：驳回后 Java 返回 **3** 条
 * （发起人提交 / 审批人驳回 / **发起人节点被重新激活且还没有意见**），
 * 而旧实现按 `wf_task_comment` 逐条映射只能给出 2 条 —— 契约里表现为**长度告警**。
 *
 * 这里补契约网够不到的三件事：
 *   ① 「活跃但无意见」的节点必须在列表里（这是 U26 的全部要点）；
 *   ② **同一执行同一节点的多次激活**要各自认领一个任务（`wfe_activity` 没有
 *      task_id/assignee 列，靠时间序配对，配对错了会把意见挂到错误的一次激活上）；
 *   ③ 同一 taskId 有多条意见时取**最后一条**；只取 `userTask` 活动（忽略
 *      startEvent/sequenceFlow 等）。
 */

interface ActivityRow {
  node_id: string
  node_name: string | null
  node_type: string
  status: string
  execution_id: string | null
  start_time: Date
  end_time: Date | null
  mi_index: number | null
}

function activity(
  nodeId: string,
  executionId: string,
  startedMs: number,
  options: { type?: string; name?: string | null; endedMs?: number | null } = {},
): ActivityRow {
  return {
    node_id: nodeId,
    node_name: options.name === undefined ? nodeId : options.name,
    node_type: options.type ?? 'userTask',
    status: options.endedMs === null ? 'ACTIVE' : 'COMPLETED',
    execution_id: executionId,
    start_time: new Date(startedMs),
    end_time: options.endedMs === null ? null : new Date(options.endedMs ?? startedMs + 1),
    mi_index: null,
  }
}

function serviceWith(data: {
  activities: ActivityRow[]
  tasks: Array<{
    id: string
    node_id: string
    assignee: string | null
    create_time: Date
    execution_id: string | null
  }>
  comments: Array<{ task_id: string; user_id: string; action: string; comment: string | null; created_at: Date }>
  instance?: unknown
}): ProcessInstanceService {
  // ⚠️ 构造函数是 (db, persistence) —— 与 TaskService 一样，Kysely 在**第一位**
  return new ProcessInstanceService(
    {
      selectFrom: () => ({
        selectAll: () => ({
          where: () => ({ orderBy: () => ({ execute: async () => data.comments }) }),
        }),
      }),
    } as never,
    {
      findInstance: async () =>
        data.instance === undefined ? { id: 'inst-1', process_def_id: 'def-1' } : data.instance,
      findActivitiesForHistory: async () => data.activities,
      findTasks: async () => data.tasks,
      // `loadModel` 只在活动没有 node_name 时才会被用到；这里返回 null 模型，
      // 用来验证「活动上的名字优先/回退」两条路径都不炸。
      findProcessDefById: async () => null,
      findUserNames: async (ids: string[]) =>
        new Map(ids.map((id) => [id, id === '1' ? '管理员' : `用户${id}`])),
      loadState: async () => ({ state: {}, variables: {}, maxSeq: 0 }),
    } as never,
    // 后端逻辑钩子：本 spec 不验证它，给一个空实现即可
    { run: async () => 0 } as never,
  )
}

const T = (id: string, nodeId: string, assignee: string | null, ms: number, executionId = 'exec-1') => ({
  id,
  node_id: nodeId,
  assignee,
  create_time: new Date(ms),
  execution_id: executionId,
})

describe('ProcessInstanceService.getHistory', () => {
  it('活跃但无意见的节点也在时间线里（U26 的核心）', async () => {
    const service = serviceWith({
      activities: [
        activity('Initiator_1', 'exec-1', 1000, { name: '发起节点', endedMs: 2000 }),
        activity('Approve_1', 'exec-1', 3000, { name: '审批节点', endedMs: 4000 }),
        // 被驳回后发起人节点**重新激活**：同一执行、同一节点、第二次活动
        activity('Initiator_1', 'exec-1', 5000, { name: '发起节点', endedMs: null }),
      ],
      tasks: [T('t1', 'Initiator_1', '1', 1100), T('t2', 'Approve_1', '1', 3100), T('t3', 'Initiator_1', '1', 5100)],
      comments: [
        { task_id: 't1', user_id: '1', action: 'submit', comment: null, created_at: new Date(1500) },
        { task_id: 't2', user_id: '1', action: 'reject', comment: '契约驳回原因', created_at: new Date(3500) },
      ],
    })

    const history = await runWithTenant('default', () => service.getHistory('inst-1'))
    expect(history).toHaveLength(3)
    expect(history[0]).toMatchObject({ activityId: 'Initiator_1', action: 'submit', endTime: new Date(2000) })
    expect(history[1]).toMatchObject({
      activityId: 'Approve_1',
      action: 'reject',
      comment: '契约驳回原因',
      assigneeName: '管理员',
    })
    // 第三条：活跃、无意见 —— 旧实现会整条丢掉
    expect(history[2]).toMatchObject({
      activityId: 'Initiator_1',
      activityName: '发起节点',
      action: null,
      comment: null,
      endTime: null,
      assignee: '1',
    })
  })

  it('同执行同节点多次激活：按时间序各认领一个任务（意见不会挂错激活）', async () => {
    const service = serviceWith({
      activities: [
        activity('Initiator_1', 'exec-1', 1000),
        activity('Initiator_1', 'exec-1', 5000),
      ],
      // 故意把任务顺序打乱传入：实现内部必须自己按 create_time 排序
      tasks: [T('t3', 'Initiator_1', '2', 5100), T('t1', 'Initiator_1', '1', 1100)],
      comments: [{ task_id: 't3', user_id: '2', action: 'submit', comment: '第二次', created_at: new Date(5200) }],
    })

    const history = await runWithTenant('default', () => service.getHistory('inst-1'))
    expect(history.map((h) => h.assignee)).toEqual(['1', '2'])
    // 第一条（第一次激活）没有意见，第二条拿到了 t3 的意见
    expect(history[0]).toMatchObject({ action: null, comment: null })
    expect(history[1]).toMatchObject({ action: 'submit', comment: '第二次' })
  })

  it('同一 taskId 多条意见 → 取最后一条', async () => {
    const service = serviceWith({
      activities: [activity('Approve_1', 'exec-1', 1000)],
      tasks: [T('t1', 'Approve_1', '1', 1100)],
      comments: [
        { task_id: 't1', user_id: '1', action: 'claim', comment: null, created_at: new Date(1200) },
        { task_id: 't1', user_id: '1', action: 'approve', comment: '同意', created_at: new Date(1300) },
      ],
    })
    const history = await runWithTenant('default', () => service.getHistory('inst-1'))
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ action: 'approve', comment: '同意' })
  })

  it('只取 userTask 活动（startEvent / sequenceFlow 不进时间线）', async () => {
    const service = serviceWith({
      activities: [
        activity('Start_1', 'exec-1', 900, { type: 'startEvent', name: '开始' }),
        activity('Flow_1', 'exec-1', 950, { type: 'sequenceFlow', name: null }),
        activity('Approve_1', 'exec-1', 1000, { type: 'userTask', name: '审批节点' }),
      ],
      tasks: [T('t1', 'Approve_1', '1', 1100)],
      comments: [],
    })
    const history = await runWithTenant('default', () => service.getHistory('inst-1'))
    expect(history.map((h) => h.activityId)).toEqual(['Approve_1'])
  })

  it('实例不存在 → 400（BusinessException），不是空数组', async () => {
    const service = serviceWith({
      activities: [],
      tasks: [],
      comments: [],
      instance: null,
    })
    const error = await runWithTenant('default', () =>
      service.getHistory('missing').catch((e: unknown) => e),
    )
    expect((error as Error).message).toBe('流程实例不存在: missing')
  })
})
