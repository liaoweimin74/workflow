import { describe, expect, it } from 'vitest'
import { TaskService } from '../../../src/engine/task/task.service'
import { runWithTenant } from '../../../src/framework/tenant/tenant-context'

/**
 * 转办的单测。
 *
 * golden（场景「任务转办与操作权限」）覆盖了四条 HTTP 路径：权限拒绝、同人 400、
 * 任务不存在 500、成功转办且 `assignee` 变为 2。
 * 这里补契约网**完全看不到**的部分 —— 转办写下的两张审计记录：
 *   - `wf_task_transfer.from_user` 取的是**改之前的 assignee**（不是入参 fromUser）；
 *   - `wf_task_comment.user_id` 取的是**入参 fromUser**，`target_user_id` 是 toUser；
 *   两者在「管理员替别人转办」时不同，且**没有任何端点回显**，只能靠单测锁住。
 */

const TASK = {
  task_id: 'task-1',
  instance_id: 'inst-1',
  assignee: '1',
  node_id: 'Approve_1',
  process_def_id: 'def-1',
}

function serviceWith(options: { assignee?: string | null; allowTransfer?: boolean } = {}) {
  const calls: string[] = []
  const task = { ...TASK, assignee: options.assignee === undefined ? '1' : options.assignee }
  const service = new TaskService(
    {
      updateTable: () => ({
        set: (patch: { assignee: string }) => ({
          where: () => ({
            execute: async () => {
              calls.push(`assignee:${patch.assignee}`)
            },
          }),
        }),
      }),
    } as never,
    { findTaskWithInstance: async () => task } as never,
    {
      insertTaskTransfer: async (
        _tenant: string,
        p: { fromUser: string; toUser: string; reason: string | null },
      ) => {
        calls.push(`transfer:${p.fromUser}->${p.toUser}:${p.reason ?? 'null'}`)
      },
      insertComment: async (
        _tenant: string,
        p: { userId: string; action: string; targetUserId: string | null },
      ) => {
        calls.push(`comment:${p.action}:${p.userId}->${p.targetUserId}`)
      },
    } as never,
    // loadOperations 走这两个仓库方法；直接给 __PROCESS__ 为 null 以简化
    {
      findNodeConfig: async () => {
        throw new Error('unused')
      },
    } as never,
    // 后端逻辑钩子：本 spec 不验证它，给一个空实现即可
    { run: async () => 0 } as never,
  )
  // 用受保护的私有方法不好打桩，这里整体替换成一个固定返回的实现
  ;(service as unknown as { loadOperations: () => Promise<Record<string, boolean>> }).loadOperations =
    async () => ({
      allowReject: true,
      allowAddSign: false,
      allowTransfer: options.allowTransfer ?? true,
      allowDelegate: false,
    })
  return { service, calls }
}

describe('transferTask', () => {
  it('审计里的 from_user 是**改之前**的 assignee，不是入参 fromUser', async () => {
    const { service, calls } = serviceWith({ assignee: '9' })
    // 管理员(7) 替 9 转办给 2
    await runWithTenant('default', () =>
      service.transferTask('task-1', { fromUser: '7', toUser: '2', reason: 'r' }),
    )
    expect(calls).toContain('assignee:2')
    // ⚠️ 关键：审计的 from 是 9（原办理人），而意见的 user 是 7（操作人）
    expect(calls).toContain('transfer:9->2:r')
    expect(calls).toContain('comment:transfer:7->2')
  })

  it('同人校验在查任务**之前**：任务不存在也先报同人错误', async () => {
    const { service, calls } = serviceWith()
    await expect(
      runWithTenant('default', () =>
        service.transferTask('ghost', { fromUser: '2', toUser: '2' }),
      ),
    ).rejects.toMatchObject({
      name: 'IllegalArgumentException',
      message: 'Cannot transfer to the same user: 2',
    })
    expect(calls).toEqual([])
  })

  it('fromUser 为空串时不做同人校验（Java 是 `fromUser != null && equals`）', async () => {
    const { service } = serviceWith()
    // toUser 也是空串 —— 若误用「两边都是空即相同」就会抛错
    await expect(
      runWithTenant('default', () => service.transferTask('task-1', { fromUser: '', toUser: '' })),
    ).resolves.toBeUndefined()
  })

  it('权限拒绝时**不产生任何副作用**（不改 assignee、不写审计、不写意见）', async () => {
    const { service, calls } = serviceWith({ allowTransfer: false })
    await expect(
      runWithTenant('default', () => service.transferTask('task-1', { fromUser: '1', toUser: '2' })),
    ).rejects.toMatchObject({ code: 400, message: '该节点不允许转办' })
    expect(calls).toEqual([])
  })

  // ⚠️ 任务不存在是 IllegalStateException 的等价物（普通 Error → HTTP 500），
  //    与「不允许转办」的 BusinessException(400) 形态不同 —— 别统一。
  it('任务不存在 → 普通 Error（HTTP 500），不带 code 字段', async () => {
    const { service } = serviceWith()
    ;(service as unknown as { persistence: unknown }).persistence = {
      findTaskWithInstance: async () => null,
    }
    await expect(
      runWithTenant('default', () => service.transferTask('ghost', { fromUser: '1', toUser: '2' })),
    ).rejects.toThrow('Task not found: ghost')
  })

  it('未传 fromUser 时不写审批意见（Java 只在 fromUser != null 时才写）', async () => {
    const { service, calls } = serviceWith()
    await runWithTenant('default', () => service.transferTask('task-1', { toUser: '2' }))
    expect(calls.filter((c) => c.startsWith('comment:'))).toEqual([])
    expect(calls).toContain('transfer:1->2:null')
  })
})
