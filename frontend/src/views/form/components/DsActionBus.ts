import { resolveTemplate, type TemplateContext } from './templateResolver'

export interface DsStep {
  op: 'set-filter' | 'refresh' | 'reload-record' | 'set-value' | 'save-record'
  target: string
  field?: string
  value?: string
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
        await executor(step.op, step.target, resolved, ctx)
      }
    }
  }

  return { register, emit }
}
