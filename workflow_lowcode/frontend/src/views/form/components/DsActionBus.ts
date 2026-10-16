import { resolveTemplate, type TemplateContext } from './templateResolver'
import type { ActionLink, BusOp } from '@/types/pageActionCatalog'

export type ActionExecutor = (
  op: BusOp,
  target: string,
  resolved: Record<string, string>,
  ctx: TemplateContext,
) => void | Promise<void>

export function createActionBus(executor: ActionExecutor) {
  const linksByTrigger = new Map<string, ActionLink[]>()

  function register(links: ActionLink[]) {
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
        if (step.displayMode !== undefined) resolved.displayMode = step.displayMode as string
        if (step.recordId !== undefined) resolved.recordId = resolveTemplate(step.recordId, ctx)
        await executor(step.op, step.target, resolved, ctx)
      }
    }
  }

  return { register, emit }
}
