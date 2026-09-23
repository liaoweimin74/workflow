import { describe, expect, it } from 'vitest'
import { TaskService } from '../../../src/engine/task/task.service'
import { runWithTenant } from '../../../src/framework/tenant/tenant-context'

/**
 * 转签（`forwardSignTask`）的单测。
 *
 * 契约场景「任务转签」已经端到端钉住了主干与两条错误形态（空 toUser → 400、
 * 任务不存在 → 500），以及**转签后 MI 计数不变**这件事（`fsTask3Get` 的
 * `nrOfInstances/nrOfActiveInstances/nrOfCompletedInstances/loopCounter` 是严格比对的）。
 *
 * 这里补契约网够不到的三条：
 *   ① `userId` 为 null 时**不写**审批意见（Java 的 `if (userId != null)`）；
 *   ② 节点**不是多实例**时引擎抛错，服务层必须转成**普通 Error**（500）而不是
 *      让 `EngineException` 冒出去（那会被过滤器加上前缀并给 400，与 Java 分叉）；
 *   ③ 引擎异常与「任务不存在」都走 500，但消息不同，不能混。
 */

/**
 * 一个最小的**会签**状态：MI 根 + 两个子实例（各一个任务）。
 * 成功路径必须给它 —— 引擎的 `forwardSign` 要求任务是 MI 子实例上的活任务。
 */
function miState(): Record<string, unknown> {
  const execution = (id: string, miIndex: number): Record<string, unknown> => ({
    id,
    nodeId: 'Approve_1',
    arrivedVia: null,
    parentId: 'root-1',
    scopeId: 'root-1',
    containerId: null,
    status: 'ACTIVE',
    isScope: false,
    miRootId: 'root-1',
    miIndex,
  })
  const task = (id: string, executionId: string, assignee: string): Record<string, unknown> => ({
    id,
    executionId,
    nodeId: 'Approve_1',
    assignee,
    status: 'CREATED',
    createTime: new Date(),
    endTime: null,
    name: '会签节点',
    description: null,
    formKey: null,
    variables: null,
    miRootId: 'root-1',
    miIndex: null,
  })
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
      execution('c1', 0),
      execution('c2', 1),
    ],
    tasks: [task('task-1', 'c1', '1'), task('task-2', 'c2', '2')],
    activities: [],
  }
}

describe('TaskService.forwardSignTask', () => {
  interface Recorded {
    comments: Array<Record<string, unknown>>
    replaced: number
  }

  function serviceWith(
    options: { task?: unknown; state?: Record<string, unknown> } = {},
  ): {
    service: TaskService
    recorded: Recorded
  } {
    const recorded: Recorded = { comments: [], replaced: 0 }
    const task =
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

    // ⚠️ 构造函数是 (db, persistence, instances, designRepo) 四参 —— 一开始按
    //    「persistence 在前」猜着写，结果 4 个用例全被 "is not a function" 打回。
    const service = new TaskService(
      {} as never,
      {
        findTaskWithInstance: async () => task,
        loadState: async () => ({
          state: options.state ?? {
            status: 'RUNNING',
            executions: [],
            tasks: [],
            activities: [],
          },
          variables: { initiator: '1' },
          maxSeq: 0,
        }),
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

  it('toUser 为空 → IllegalArgumentException 形态（HTTP 400），且不碰引擎', async () => {
    const { service, recorded } = serviceWith()
    const error = await runWithTenant('default', () =>
      service
        .forwardSignTask('task-1', { userId: '1', toUser: '  ', comment: null })
        .catch((e: unknown) => e),
    )
    expect((error as Error).message).toBe('toUser cannot be null or blank')
    expect((error as Error).name).toBe('IllegalArgumentException')
    expect(recorded.replaced).toBe(0)
  })

  it('任务不存在 → 普通 Error（HTTP 500），消息带 taskId', async () => {
    const { service } = serviceWith({ task: null })
    const error = await runWithTenant('default', () =>
      service
        .forwardSignTask('missing', { userId: '1', toUser: '3', comment: null })
        .catch((e: unknown) => e),
    )
    expect((error as Error).message).toBe('Task not found: missing')
    // ⚠️ 必须是**普通 Error**：BusinessException 会变成业务 404，与 Java 的 500 分叉
    expect((error as Error).name).toBe('Error')
  })

  it('非多实例节点 → 引擎错误被转成普通 Error（500，消息不加前缀）', async () => {
    // 造一个「任务挂在**非 MI** 执行上」的状态：引擎的 forwardSign 会抛
    // `转签仅适用于多实例节点`，服务层必须把它转成普通 Error
    // （让 EngineException 冒出去会被过滤器加前缀并给 400，与 Java 分叉）。
    const { service, recorded } = serviceWith({
      state: {
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
        tasks: [
          {
            id: 'task-1',
            executionId: 'exec-1',
            nodeId: 'Approve_1',
            assignee: '1',
            status: 'CREATED',
            createTime: new Date(),
            endTime: null,
            name: '会签节点',
            description: null,
            formKey: null,
            variables: null,
            miRootId: null,
            miIndex: null,
          },
        ],
        activities: [],
      },
    })
    const error = await runWithTenant('default', () =>
      service
        .forwardSignTask('task-1', { userId: '1', toUser: '3', comment: null })
        .catch((e: unknown) => e),
    )
    expect((error as Error).message).toBe('转签仅适用于多实例节点')
    expect((error as Error).name).toBe('Error')
    expect(recorded.replaced).toBe(0)
  })

  it('成功：写一条 forward_sign 意见，targetUserId 记的是**转给谁**', async () => {
    const { service, recorded } = serviceWith({ state: miState() })
    await runWithTenant('default', () =>
      service.forwardSignTask('task-1', { userId: '1', toUser: '3', comment: '契约转签' }),
    )
    expect(recorded.replaced).toBe(1)
    expect(recorded.comments).toEqual([
      {
        taskId: 'task-1',
        instanceId: 'inst-1',
        userId: '1',
        action: 'forward_sign',
        comment: '契约转签',
        targetUserId: '3',
      },
    ])
  })

  it('userId 为 null → 不写意见（Java 的 if (userId != null)）', async () => {
    const { service, recorded } = serviceWith({ state: miState() })
    await runWithTenant('default', () =>
      service.forwardSignTask('task-1', { userId: null, toUser: '3', comment: '不该写' }),
    )
    expect(recorded.replaced).toBe(1)
    expect(recorded.comments).toEqual([])
  })
})
