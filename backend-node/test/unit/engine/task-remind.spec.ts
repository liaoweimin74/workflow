import { describe, expect, it } from 'vitest'
import { TaskService } from '../../../src/engine/task/task.service'
import { runWithTenant } from '../../../src/framework/tenant/tenant-context'

/**
 * 催办逻辑的单测。
 *
 * golden 覆盖了端到端四态（成功 / 频率限制 / 任务不存在 / 按实例无待办），
 * 但下面这些**契约网够不到**的分支只能在这里锁住：
 *   - 频率限制的**边界**（23h59m vs 24h01m）；
 *   - 没有 assignee 的报错（场景里任务已被 claim，永远走不到）；
 *   - 按实例催办时「部分成功」的语义（Java 只吞频率限制与无办理人，其余照抛）；
 *   - 「活跃任务」的判定（COMPLETED 不算）。
 */

interface RemindRow {
  id: string
  tenant_id: string
  task_id: string
  process_instance_id: string
  remind_from: string
  remind_to: string
  remind_time: Date
}

/**
 * 极简 Kysely 替身。
 *
 * 只支持两条链：`selectFrom('wf_task_remind').select(...).where(...).orderBy(...).limit(...).executeTakeFirst()`
 * 与 `insertInto('wf_task_remind').values(...).execute()`。
 * 刻意用**链式对象**而不是"记录调用参数"，这样服务里的查询条件（尤其是 orderBy desc）
 * 真的会参与结果计算 —— 否则一个把最新记录取成最旧记录的 bug 会静默通过。
 */
function fakeDb(reminds: RemindRow[]) {
  const inserted: RemindRow[] = []
  return {
    inserted,
    selectFrom: () => {
      let taskId: string | null = null
      let desc = false
      const builder = {
        select: () => builder,
        where: (col: string, _op: string, value: unknown) => {
          if (col === 'task_id') taskId = String(value)
          return builder
        },
        orderBy: (_col: string, dir: string) => {
          desc = dir === 'desc'
          return builder
        },
        limit: () => builder,
        executeTakeFirst: async () => {
          const matched = reminds
            .filter((r) => r.task_id === taskId)
            .sort((a, b) =>
              desc
                ? b.remind_time.getTime() - a.remind_time.getTime()
                : a.remind_time.getTime() - b.remind_time.getTime(),
            )
          const first = matched[0]
          return first === undefined ? undefined : { remind_time: first.remind_time }
        },
      }
      return builder
    },
    insertInto: () => ({
      values: (row: RemindRow) => ({
        execute: async () => {
          inserted.push(row)
        },
      }),
    }),
  }
}

function serviceWith(options: {
  task?: { id: string; assignee: string | null; status: string } | null
  tasks?: Array<{ id: string; assignee: string | null; status: string }>
  reminds?: RemindRow[]
}) {
  const db = fakeDb(options.reminds ?? [])
  const service = new TaskService(
    db as never,
    {
      // ⚠️ 替身也要**按 id 查**：第一版直接返回 `options.task`，
      //    于是只给 tasks、不给 task 的用例里，「已知任务」也被判成不存在，
      //    remindByInstance 的「部分成功」用例因此假失败（实现没问题，是替身不对）。
      findTaskWithInstance: async (taskId: string) => {
        if (options.task !== undefined) return options.task
        return (options.tasks ?? []).find((t) => t.id === taskId) ?? null
      },
      findTasks: async () => options.tasks ?? [],
    } as never,
    {} as never,
    {} as never,
    // 后端逻辑钩子：本 spec 不验证它，给一个空实现即可
    { run: async () => 0 } as never,
  )
  return { service, db }
}

const TASK = { id: 'task-1', assignee: '1', status: 'CLAIMED' }

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3_600_000)
}

describe('remindTask', () => {
  it('任务不存在 → 「Task not found: <id>」（普通 Error，走 HTTP 500）', async () => {
    const { service } = serviceWith({ task: null })
    await expect(runWithTenant('default', () => service.remindTask('ghost', '1'))).rejects.toThrow(
      'Task not found: ghost',
    )
  })

  it('写入催办记录，字段取自任务与调用方', async () => {
    const { service, db } = serviceWith({ task: TASK })
    await runWithTenant('default', () => service.remindTask('task-1', '7'))
    expect(db.inserted).toHaveLength(1)
    const row = db.inserted[0]
    expect(row.task_id).toBe('task-1')
    expect(row.remind_from).toBe('7')
    expect(row.remind_to).toBe('1')
    expect(row.tenant_id).toBe('default')
    expect(row.remind_time).toBeInstanceOf(Date)
  })

  it('没有 assignee → 「has no assignee or owner to remind」', async () => {
    const { service } = serviceWith({ task: { ...TASK, assignee: null } })
    await expect(
      runWithTenant('default', () => service.remindTask('task-1', '1')),
    ).rejects.toThrow('Task task-1 has no assignee or owner to remind')
  })

  it('assignee 是空白串也按「没有」处理', async () => {
    const { service } = serviceWith({ task: { ...TASK, assignee: '  ' } })
    await expect(
      runWithTenant('default', () => service.remindTask('task-1', '1')),
    ).rejects.toThrow('has no assignee or owner to remind')
  })

  it('24h 内已催办 → 报错，文案含时长与限制（Java 用 toHours 向下取整）', async () => {
    const { service } = serviceWith({
      task: TASK,
      reminds: [
        {
          id: 'r1',
          tenant_id: 'default',
          task_id: 'task-1',
          process_instance_id: 'pi',
          remind_from: '1',
          remind_to: '1',
          remind_time: hoursAgo(0.5),
        },
      ],
    })
    await expect(
      runWithTenant('default', () => service.remindTask('task-1', '1')),
    ).rejects.toThrow('Task task-1 was reminded 0h ago, within the 24h frequency limit')
  })

  it('边界：23 小时前 → 仍被拒；25 小时前 → 放行', async () => {
    const at = (hours: number) =>
      serviceWith({
        task: TASK,
        reminds: [
          {
            id: 'r1',
            tenant_id: 'default',
            task_id: 'task-1',
            process_instance_id: 'pi',
            remind_from: '1',
            remind_to: '1',
            remind_time: hoursAgo(hours),
          },
        ],
      })
    await expect(
      runWithTenant('default', () => at(23).service.remindTask('task-1', '1')),
    ).rejects.toThrow('within the 24h frequency limit')

    const allowed = at(25)
    await runWithTenant('default', () => allowed.service.remindTask('task-1', '1'))
    expect(allowed.db.inserted).toHaveLength(1)
  })

  it('频率限制看的是**最近一条**记录（按 remind_time 倒序取首条）', async () => {
    const { service } = serviceWith({
      task: TASK,
      reminds: [
        {
          id: 'old',
          tenant_id: 'default',
          task_id: 'task-1',
          process_instance_id: 'pi',
          remind_from: '1',
          remind_to: '1',
          remind_time: hoursAgo(30),
        },
        {
          id: 'new',
          tenant_id: 'default',
          task_id: 'task-1',
          process_instance_id: 'pi',
          remind_from: '1',
          remind_to: '1',
          remind_time: hoursAgo(1),
        },
      ],
    })
    await expect(
      runWithTenant('default', () => service.remindTask('task-1', '1')),
    ).rejects.toThrow('within the 24h frequency limit')
  })

  it('别的任务的催办记录不影响本任务', async () => {
    const { service } = serviceWith({
      task: TASK,
      reminds: [
        {
          id: 'other',
          tenant_id: 'default',
          task_id: 'task-2',
          process_instance_id: 'pi',
          remind_from: '1',
          remind_to: '1',
          remind_time: hoursAgo(0.1),
        },
      ],
    })
    await runWithTenant('default', () => service.remindTask('task-1', '1'))
  })
})

describe('remindByInstance', () => {
  const active = (id: string) => ({ id, assignee: '1', status: 'CLAIMED' })

  it('没有活跃任务 → noTasks', async () => {
    const { service } = serviceWith({ tasks: [] })
    await expect(
      runWithTenant('default', () => service.remindByInstance('pi', '1')),
    ).resolves.toBe('noTasks')
  })

  it('已完成的任务不算活跃', async () => {
    const { service } = serviceWith({
      tasks: [{ id: 't1', assignee: '1', status: 'COMPLETED' }],
    })
    await expect(
      runWithTenant('default', () => service.remindByInstance('pi', '1')),
    ).resolves.toBe('noTasks')
  })

  it('有活跃任务且全部被跳过 → allSkipped', async () => {
    const { service } = serviceWith({
      tasks: [active('t1')],
      reminds: [
        {
          id: 'r1',
          tenant_id: 'default',
          task_id: 't1',
          process_instance_id: 'pi',
          remind_from: '1',
          remind_to: '1',
          remind_time: hoursAgo(1),
        },
      ],
    })
    await expect(
      runWithTenant('default', () => service.remindByInstance('pi', '1')),
    ).resolves.toBe('allSkipped')
  })

  it('只要有一个成功就是 ok（其余的被跳过，不影响结果）', async () => {
    // t1 有 assignee 可催办；t2 没有 assignee → 抛错被吞
    const { service, db } = serviceWith({
      tasks: [active('t1'), { id: 't2', assignee: null, status: 'CREATED' }],
    })
    await expect(
      runWithTenant('default', () => service.remindByInstance('pi', '1')),
    ).resolves.toBe('ok')
    expect(db.inserted.map((r) => r.task_id)).toEqual(['t1'])
  })
})
