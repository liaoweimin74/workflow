import { describe, expect, it } from 'vitest'
import { TaskService } from '../../../src/engine/task/task.service'
import { runWithTenant } from '../../../src/framework/tenant/tenant-context'

/**
 * 「拒绝（终止流程）」的单测。
 *
 * golden（场景「流程定义与实例全链路」的 refuse* 步骤）覆盖了端到端：
 * claim → refuse → 实例终止 → 待办消失 → 再 refuse 报 500。
 * 这里补契约网够不到的三件事：
 *   ① 错误的**异常形态**（普通 Error，不是 BusinessException）；
 *   ② 「先写意见、再终止」的**顺序**；
 *   ③ 终止原因的**空值兜底文案**（Java 的 '审批拒绝，流程终止' 与
 *      ProcessInstanceService 自己的 'User terminated' 不同，必须显式传）。
 */

const TASK = {
  task_id: 'task-1',
  instance_id: 'inst-1',
  assignee: '1',
  node_id: 'Node_1',
  process_def_id: 'def-1',
}

function serviceWith(overrides: {
  task?: typeof TASK | null
} = {}) {
  const calls: string[] = []
  const service = new TaskService(
    {} as never,
    {
      findTaskWithInstance: async () => (overrides.task === undefined ? TASK : overrides.task),
    } as never,
    {
      insertComment: async (
        _tenant: string,
        row: { action: string; userId: string; comment: string | null },
      ) => {
        calls.push(`comment:${row.action}:${row.userId}:${row.comment ?? 'null'}`)
      },
      terminateInstance: async (instanceId: string, reason: string | null) => {
        calls.push(`terminate:${instanceId}:${reason ?? 'null'}`)
      },
    } as never,
    {} as never,
    // 后端逻辑钩子：本 spec 不验证它，给一个空实现即可
    { run: async () => 0 } as never,
  )
  return { service, calls }
}

describe('refuseTask', () => {
  it('先写 refuse 意见、再终止实例，且用调用方给的原因', async () => {
    const { service, calls } = serviceWith()
    await runWithTenant('default', () => service.refuseTask('task-1', '7', '契约拒绝原因'))
    expect(calls).toEqual([
      'comment:refuse:7:契约拒绝原因',
      'terminate:inst-1:契约拒绝原因',
    ])
  })

  // ⚠️ 顺序是契约：Java 先 saveTaskComment 再 terminateProcessInstance。
  //    这里用「调用序列」直接钉住，而不是只看最终状态 —— 两者在成功路径上看不出差别，
  //    但终止失败时（例如实例已被终止）结果不同。
  it('顺序固定为「意见 → 终止」', async () => {
    const { service, calls } = serviceWith()
    await runWithTenant('default', () => service.refuseTask('task-1', '1', 'x'))
    expect(calls[0].startsWith('comment:')).toBe(true)
    expect(calls[1].startsWith('terminate:')).toBe(true)
  })

  it('原因为 null 时用 Java 的兜底文案（不是下游的 User terminated）', async () => {
    const { service, calls } = serviceWith()
    await runWithTenant('default', () => service.refuseTask('task-1', '1', null))
    expect(calls[1]).toBe('terminate:inst-1:审批拒绝，流程终止')
  })

  // ⚠️ 必须是普通 Error：Java 抛 IllegalStateException → HTTP 500 + body code 500。
  //    写成 BusinessException 会变成 HTTP 200 + body code（那是 reject 的形态），契约不同。
  it('任务不存在 → 普通 Error「Task not found: id」（不是 BusinessException）', async () => {
    const { service, calls } = serviceWith({ task: null })
    await expect(
      runWithTenant('default', () => service.refuseTask('ghost', '1', 'r')),
    ).rejects.toThrow('Task not found: ghost')
    await expect(
      runWithTenant('default', () => service.refuseTask('ghost', '1', 'r')),
    ).rejects.not.toHaveProperty('code')
    // 任务不存在时不应写任何意见、也不应终止任何实例
    expect(calls).toEqual([])
  })
})
