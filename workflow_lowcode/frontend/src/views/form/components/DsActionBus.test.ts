import { describe, it, expect, vi } from 'vitest'
import { createActionBus, type DsLink, type DsStep, type ActionExecutor } from './DsActionBus'
import type { TemplateContext } from './templateResolver'

/** 构造记录 executor 调用的辅助函数 */
function createRecordingExecutor() {
  const calls: Array<{ op: DsStep['op']; target: string; resolved: Record<string, string> }> = []
  const executor: ActionExecutor = (op, target, resolved) => {
    calls.push({ op, target, resolved: { ...resolved } })
  }
  return { calls, executor }
}

describe('DsActionBus 表格-容器联动扩展', () => {
  describe('新动作类型分发', () => {
    it('open-container 动作分发到 executor 并传递 displayMode', async () => {
      const { calls, executor } = createRecordingExecutor()
      const bus = createActionBus(executor)
      const link: DsLink = {
        trigger: 'row-edit',
        steps: [{ op: 'open-container', target: 'form1', displayMode: 'dialog' }],
      }
      bus.register([link])

      await bus.emit('row-edit', {})

      expect(calls).toHaveLength(1)
      expect(calls[0].op).toBe('open-container')
      expect(calls[0].target).toBe('form1')
      expect(calls[0].resolved.displayMode).toBe('dialog')
    })

    it('load-record 动作将 recordId 模板解析后传递', async () => {
      const { calls, executor } = createRecordingExecutor()
      const bus = createActionBus(executor)
      const link: DsLink = {
        trigger: 'row-edit',
        steps: [{ op: 'load-record', target: 'form1', recordId: '{row.id}' }],
      }
      bus.register([link])

      const ctx: TemplateContext = { row: { id: 'REC-001' } }
      await bus.emit('row-edit', ctx)

      expect(calls).toHaveLength(1)
      expect(calls[0].op).toBe('load-record')
      expect(calls[0].resolved.recordId).toBe('REC-001')
    })

    it('save-container 动作分发到 executor', async () => {
      const { calls, executor } = createRecordingExecutor()
      const bus = createActionBus(executor)
      bus.register([{ trigger: 'row-edit', steps: [{ op: 'save-container', target: 'form1' }] }])

      await bus.emit('row-edit', {})

      expect(calls).toHaveLength(1)
      expect(calls[0].op).toBe('save-container')
    })

    it('close-container 动作分发到 executor', async () => {
      const { calls, executor } = createRecordingExecutor()
      const bus = createActionBus(executor)
      bus.register([{ trigger: 'row-edit', steps: [{ op: 'close-container', target: 'form1' }] }])

      await bus.emit('row-edit', {})

      expect(calls).toHaveLength(1)
      expect(calls[0].op).toBe('close-container')
    })
  })

  describe('表格联动触发器', () => {
    it.each(['row-edit', 'row-view', 'row-click', 'row-create'])(
      '%s 触发器可注册并触发动作链',
      async (trigger) => {
        const { calls, executor } = createRecordingExecutor()
        const bus = createActionBus(executor)
        bus.register([{ trigger, steps: [{ op: 'open-container', target: 'form1' }] }])

        await bus.emit(trigger, {})

        expect(calls).toHaveLength(1)
        expect(calls[0].op).toBe('open-container')
      },
    )

    it('row-create 触发时无 row 上下文，动作链仍执行', async () => {
      const { calls, executor } = createRecordingExecutor()
      const bus = createActionBus(executor)
      bus.register([{ trigger: 'row-create', steps: [{ op: 'open-container', target: 'form1' }] }])

      await bus.emit('row-create', {})

      expect(calls).toHaveLength(1)
    })
  })

  describe('向后兼容', () => {
    it('现有 set-filter 动作行为不变（field/value 解析）', async () => {
      const { calls, executor } = createRecordingExecutor()
      const bus = createActionBus(executor)
      bus.register([
        { trigger: 'node-click', steps: [{ op: 'set-filter', target: 'ds1', field: 'deptId', value: '{node.id}' }] },
      ])

      await bus.emit('node-click', { node: { id: 'N1' } })

      expect(calls).toHaveLength(1)
      expect(calls[0].op).toBe('set-filter')
      expect(calls[0].resolved.field).toBe('deptId')
      expect(calls[0].resolved.value).toBe('N1')
    })

    it('多步骤事件链按顺序全部执行', async () => {
      const { calls, executor } = createRecordingExecutor()
      const bus = createActionBus(executor)
      bus.register([
        {
          trigger: 'row-edit',
          steps: [
            { op: 'open-container', target: 'form1', displayMode: 'dialog' },
            { op: 'load-record', target: 'form1', recordId: '{row.id}' },
          ],
        },
      ])

      await bus.emit('row-edit', { row: { id: 'R9' } })

      expect(calls).toHaveLength(2)
      expect(calls[0].op).toBe('open-container')
      expect(calls[1].op).toBe('load-record')
      expect(calls[1].resolved.recordId).toBe('R9')
    })

    it('register 清空旧链后重新注册', async () => {
      const { calls, executor } = createRecordingExecutor()
      const bus = createActionBus(executor)
      bus.register([{ trigger: 'row-edit', steps: [{ op: 'open-container', target: 'form1' }] }])
      bus.register([{ trigger: 'row-view', steps: [{ op: 'open-container', target: 'form2' }] }])

      await bus.emit('row-edit', {})
      await bus.emit('row-view', {})

      expect(calls).toHaveLength(1)
      expect(calls[0].target).toBe('form2')
    })
  })
})
