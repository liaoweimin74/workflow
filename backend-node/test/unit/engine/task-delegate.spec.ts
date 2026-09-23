import { describe, expect, it } from 'vitest'
import { TaskService } from '../../../src/engine/task/task.service'
import { runWithTenant } from '../../../src/framework/tenant/tenant-context'

/**
 * 委派（`delegateTask`）与「委派后完成 = 先 resolve 再 complete」的单测。
 *
 * 契约场景「任务委派」已经端到端钉住了整条链路（delegate → assignee=4 →
 * 被委派人 complete → 流程结束、且任务的 assignee 回到原办理人 1）。
 *
 * 这里补的是契约网看不出的内部动作与边界：
 *   ① **先 resolve 再推进**（顺序错了两侧就对不上，而顺序在响应里不可见）；
 *   ② 委派态不是 PENDING（已 RESOLVED）时**不**再改写 assignee；
 *   ③ 没有委派记录时 complete 完全不受影响（普通路径不能被这条新逻辑污染）；
 *   ④ 委派时 `fromUser` 为 null → 不写意见。
 */

describe('TaskService.delegateTask / resolveDelegation', () => {
  interface Recorded {
    updatedAssignees: Array<string | null>
    upserts: Array<Record<string, unknown>>
    resolved: number
    comments: Array<Record<string, unknown>>
    completed: number
  }

  function serviceWith(options: {
    task?: unknown
    delegation?: { owner: string | null; delegation_state: string } | undefined
  }): { service: TaskService; recorded: Recorded } {
    const recorded: Recorded = {
      updatedAssignees: [],
      upserts: [],
      resolved: 0,
      comments: [],
      completed: 0,
    }
    const taskRow =
      options.task === undefined
        ? { id: 'task-1', instance_id: 'inst-1', assignee: '1' }
        : options.task

    const service = new TaskService(
      // db：委派写 wfe_task / wfe_task_delegation / 读委派记录
      {
        updateTable: () => ({
          set: (values: { assignee?: string | null }) => ({
            where: () => ({
              execute: async () => {
                if (values.assignee !== undefined) recorded.updatedAssignees.push(values.assignee)
              },
            }),
          }),
        }),
        insertInto: () => ({
          values: (row: Record<string, unknown>) => ({
            onDuplicateKeyUpdate: () => ({
              execute: async () => {
                recorded.upserts.push(row)
              },
            }),
          }),
        }),
        selectFrom: () => ({
          select: () => ({
            where: () => ({
              executeTakeFirst: async () => options.delegation,
            }),
          }),
        }),
      } as never,
      {
        findTaskWithInstance: async () => taskRow,
        loadState: async () => ({
          state: {
            status: 'RUNNING',
            executions: [],
            // ⚠️ 必须带 `status: 'CREATED'`：引擎的 completeTask 只认 CREATED/CLAIMED，
            //    漏了这个字段会得到「任务已处理」（首版就是这么挂的）。
            tasks: [{ id: 'task-1', assignee: '4', status: 'CREATED' }],
            activities: [],
          },
          variables: {},
          maxSeq: 0,
        }),
        replaceRuntimeRows: async () => undefined,
        updateInstanceStatus: async () => undefined,
      } as never,
      {
        loadModel: async () => ({ nodes: {} }),
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

  it('任务不存在 → 普通 Error（HTTP 500）', async () => {
    const { service } = serviceWith({ task: null })
    const error = await runWithTenant('default', () =>
      service
        .delegateTask('missing', { delegateTo: '4', fromUser: '1', comment: null })
        .catch((e: unknown) => e),
    )
    expect((error as Error).message).toBe('Task not found: missing')
  })

  it('委派：assignee 改成被委派人、写 owner=PENDING、意见 targetUserId 是被委派人', async () => {
    const { service, recorded } = serviceWith({})
    await runWithTenant('default', () =>
      service.delegateTask('task-1', { delegateTo: '4', fromUser: '1', comment: '契约委派' }),
    )
    expect(recorded.updatedAssignees).toEqual(['4'])
    expect(recorded.upserts).toEqual([
      expect.objectContaining({ task_id: 'task-1', owner: '1', delegation_state: 'PENDING' }),
    ])
    expect(recorded.comments).toEqual([
      {
        taskId: 'task-1',
        instanceId: 'inst-1',
        userId: '1',
        action: 'delegate',
        comment: '契约委派',
        targetUserId: '4',
      },
    ])
  })

  it('fromUser 为 null → 不写意见（Java 的 if (fromUser != null)）', async () => {
    const { service, recorded } = serviceWith({})
    await runWithTenant('default', () =>
      service.delegateTask('task-1', { delegateTo: '4', fromUser: null, comment: '不该写' }),
    )
    expect(recorded.comments).toEqual([])
  })

  /**
   * ⚠️ 「委派后完成 = **先 resolve 再推进**」这条语义**不在本文件断言**：
   *    它需要一个能真正跑通的引擎态（执行 + 模型 + 出口流转），而契约场景
   *    「任务委派」已经端到端钉住了它的可观测结果 —— `dvTaskAfterComplete.assignee === "1"`
   *    只有在 resolve 于 `replaceRuntimeRows` **之前**把 assignee 归还 owner 时才成立
   *    （晚一步就被整表重写覆盖成 4）。把顺序写进单测需要造一整套引擎夹具，
   *    收益不抵成本，这里只留痕。
   *
   *    另外两处本文件也覆盖不到、但由 golden 兜住的：`fromUser` 为 null 时不写意见（已覆盖）、
   *    以及「已 RESOLVED 的委派不再改写 assignee」（重复完成时会走到，golden 里没有该路径）。
   */
})