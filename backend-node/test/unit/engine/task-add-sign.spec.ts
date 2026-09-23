import { describe, expect, it } from 'vitest'
import { TaskService } from '../../../src/engine/task/task.service'
import { runWithTenant } from '../../../src/framework/tenant/tenant-context'

/**
 * 加签（`addSignTask`）的单测。
 *
 * 契约场景「任务加签」已经端到端钉住了 MI 分支（新任务 + MI 计数 2→3 + 时间线上
 * `action='add_sign'` 的意见挂回原活动）与两条错误形态（空 users → 400、任务不存在 → 500）。
 *
 * 这里补契约网**够不到**的地方：
 *   ① **非 MI 分支（加候选人）在本项目完全不可观测** —— `TaskController` 没有候选人
 *      列表端点、`/tasks?assignee=` 只按 assignee 过滤（Java 侧也是 `taskAssignee`）、
 *      Node 的 `claim` 也不校验候选人 ⇒ 只能在这里验证「候选人被写进状态、且**没有**
 *      误走引擎的 MI 路径」（规格 U37）；
 *   ② `users` 多人时 `targetUserId` 是**逗号拼接**（与转签/转办只记一个人不同）；
 *   ③ `userId` 为 null 时不写意见。
 */

interface TaskLike {
  id: string
  executionId: string
  nodeId: string
  assignee: string | null
  candidateUsers: string[]
  status: string
  miIndex: number | null
  createTime: Date
  claimTime: Date | null
  endTime: Date | null
}

function task(id: string, executionId: string): TaskLike {
  return {
    id,
    executionId,
    nodeId: 'Approve_1',
    assignee: '1',
    candidateUsers: [],
    status: 'CREATED',
    miIndex: null,
    createTime: new Date(),
    claimTime: null,
    endTime: null,
  }
}

/** MI 子实例的执行 + 一个 MI 根。 */
function miState(): Record<string, unknown> {
  return {
    status: 'RUNNING',
    executions: [
      {
        id: 'root-1',
        nodeId: 'Approve_1',
        arrivedVia: null,
        parentId: null,
        scopeId: null,
        containerId: null,
        status: 'WAITING',
        isScope: true,
        miRootId: 'root-1',
        miIndex: null,
      },
      {
        id: 'exec-1',
        nodeId: 'Approve_1',
        arrivedVia: null,
        parentId: 'root-1',
        scopeId: 'root-1',
        containerId: null,
        status: 'ACTIVE',
        isScope: false,
        miRootId: 'root-1',
        miIndex: 0,
      },
    ],
    tasks: [task('task-1', 'exec-1')],
    activities: [],
  }
}

/** 单实例执行（非 MI）—— 加签应当走「加候选人」。 */
function singleState(): Record<string, unknown> {
  return {
    status: 'RUNNING',
    executions: [
      {
        id: 'exec-1',
        nodeId: 'Approve_1',
        arrivedVia: null,
        parentId: null,
        scopeId: null,
        containerId: null,
        status: 'ACTIVE',
        isScope: false,
        miRootId: null,
        miIndex: null,
      },
    ],
    tasks: [task('task-1', 'exec-1')],
    activities: [],
  }
}

describe('TaskService.addSignTask', () => {
  interface Recorded {
    comments: Array<Record<string, unknown>>
    replaced: number
  }

  function serviceWith(options: { task?: unknown; state: Record<string, unknown> }): {
    service: TaskService
    recorded: Recorded
  } {
    const recorded: Recorded = { comments: [], replaced: 0 }
    const taskRow =
      options.task === undefined
        ? {
            id: 'task-1',
            instance_id: 'inst-1',
            process_def_id: 'def-1',
            node_id: 'Approve_1',
            assignee: '1',
            initiator: '1',
            business_key: 'bk',
            process_name: 'P',
            create_time: new Date(),
          }
        : options.task

    const service = new TaskService(
      {} as never,
      {
        findTaskWithInstance: async () => taskRow,
        loadState: async () => ({ state: options.state, variables: {}, maxSeq: 0 }),
        replaceRuntimeRows: async () => {
          recorded.replaced += 1
        },
        updateInstanceStatus: async () => undefined,
      } as never,
      {
        loadModel: async () => ({
          nodes: {
            Approve_1: {
              nodeId: 'Approve_1',
              name: '会签节点',
              type: 'userTask',
              isInitiator: false,
              containerId: null,
              assignee: null,
              approval: { userIds: ['1', '2'], roleCodes: [], multiMode: 'countersign' },
            },
          },
        }),
        insertComment: async (_tenant: string, row: Record<string, unknown>) => {
          recorded.comments.push(row)
        },
      } as never,
      {} as never,
      // 后端逻辑钩子：本 spec 不验证它，给一个空实现即可
      { run: async () => 0 } as never,
    )
    return { service, recorded }
  }

  it('users 为空 → IllegalArgumentException 形态（HTTP 400），且不碰引擎', async () => {
    const { service, recorded } = serviceWith({ state: miState() })
    const error = await runWithTenant('default', () =>
      service
        .addSignTask('task-1', { users: [], userId: '1', comment: null })
        .catch((e: unknown) => e),
    )
    expect((error as Error).message).toBe('AddSign users cannot be empty')
    expect((error as Error).name).toBe('IllegalArgumentException')
    expect(recorded.replaced).toBe(0)
  })

  it('users 为 null 也按空处理（Java 的 users == null 分支）', async () => {
    const { service } = serviceWith({ state: miState() })
    const error = await runWithTenant('default', () =>
      service
        .addSignTask('task-1', { users: null, userId: '1', comment: null })
        .catch((e: unknown) => e),
    )
    expect((error as Error).message).toBe('AddSign users cannot be empty')
  })

  it('任务不存在 → 普通 Error（HTTP 500）', async () => {
    const { service } = serviceWith({ task: null, state: miState() })
    const error = await runWithTenant('default', () =>
      service
        .addSignTask('missing', { users: ['4'], userId: '1', comment: null })
        .catch((e: unknown) => e),
    )
    expect((error as Error).message).toBe('Task not found: missing')
    expect((error as Error).name).toBe('Error')
  })

  it('MI 节点：新增子实例 + 意见的 targetUserId 是**逗号拼接**的多人', async () => {
    const { service, recorded } = serviceWith({ state: miState() })
    await runWithTenant('default', () =>
      service.addSignTask('task-1', { users: ['4', '5'], userId: '1', comment: '契约加签' }),
    )
    expect(recorded.replaced).toBe(1)
    expect(recorded.comments).toEqual([
      {
        taskId: 'task-1',
        instanceId: 'inst-1',
        userId: '1',
        action: 'add_sign',
        comment: '契约加签',
        targetUserId: '4,5',
      },
    ])
  })

  it('非 MI 节点：写候选人、**不**新增子实例（规格 U37：该分支无端点可观测）', async () => {
    const state = singleState()
    const { service, recorded } = serviceWith({ state })
    await runWithTenant('default', () =>
      service.addSignTask('task-1', { users: ['4', '5'], userId: '1', comment: '加候选人' }),
    )
    const tasks = state.tasks as TaskLike[]
    expect(tasks[0].candidateUsers).toEqual(['4', '5'])
    // 关键：执行数没有变（没有误走 MI 分支为每个用户建子实例）
    expect((state.executions as unknown[]).length).toBe(1)
    expect(recorded.replaced).toBe(1)
    expect(recorded.comments[0]).toMatchObject({ action: 'add_sign', targetUserId: '4,5' })
  })

  it('重复加同一个人不会产生重复候选人', async () => {
    const state = singleState()
    const { service } = serviceWith({ state })
    await runWithTenant('default', () =>
      service.addSignTask('task-1', { users: ['4', '4'], userId: '1', comment: null }),
    )
    expect((state.tasks as TaskLike[])[0].candidateUsers).toEqual(['4'])
  })

  it('userId 为 null → 不写意见（Java 的 if (userId != null)）', async () => {
    const { service, recorded } = serviceWith({ state: miState() })
    await runWithTenant('default', () =>
      service.addSignTask('task-1', { users: ['4'], userId: null, comment: '不该写' }),
    )
    expect(recorded.replaced).toBe(1)
    expect(recorded.comments).toEqual([])
  })
})
