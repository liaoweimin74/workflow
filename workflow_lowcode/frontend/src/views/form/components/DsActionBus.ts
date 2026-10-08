import { resolveTemplate, type TemplateContext } from './templateResolver'

/** 表格-容器联动触发器（与既有触发器并列，供配置面板与调用方约束类型） */
export type DsTrigger =
  | 'node-click'
  | 'row-click'
  | 'row-edit'
  | 'row-view'
  | 'row-create'
  | 'field-change'
  | 'record-change'

/** 容器显示模式 */
export type ContainerDisplayMode = 'dialog' | 'newTab' | 'inline'

export interface DsStep {
  op:
    | 'set-filter'
    | 'refresh'
    | 'reload-record'
    | 'set-value'
    | 'save-record'
    | 'open-container'
    | 'load-record'
    | 'save-container'
    | 'close-container'
  target: string
  field?: string
  value?: string
  /** open-container：显示模式（缺省由容器自身配置决定） */
  displayMode?: ContainerDisplayMode
  /** load-record：记录ID模板（如 {row.id}） */
  recordId?: string
}

export interface DsLink {
  trigger: string
  steps: DsStep[]
}

export type ActionExecutor = (
  op: DsStep['op'],
  target: string,
  resolved: Record<string, string>,
  ctx: TemplateContext,
) => void | Promise<void>

export function createActionBus(executor: ActionExecutor) {
  const linksByTrigger = new Map<string, DsLink[]>()

  function register(links: DsLink[]) {
    linksByTrigger.clear()
    for (const link of links) {
      const arr = linksByTrigger.get(link.trigger) || []
      arr.push(link)
      linksByTrigger.set(link.trigger, arr)
    }
  }

  async function emit(trigger: string, ctx: TemplateContext) {
    const links = linksByTrigger.get(trigger) || []
    for (const link of links) {
      for (const step of link.steps) {
        const resolved: Record<string, string> = {}
        if (step.field) resolved.field = step.field
        if (step.value !== undefined) resolved.value = resolveTemplate(step.value, ctx)
        if (step.displayMode !== undefined) resolved.displayMode = step.displayMode
        if (step.recordId !== undefined) resolved.recordId = resolveTemplate(step.recordId, ctx)
        await executor(step.op, step.target, resolved, ctx)
      }
    }
  }

  return { register, emit }
}
