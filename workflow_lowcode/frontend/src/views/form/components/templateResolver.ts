export interface TemplateContext {
  node?: { id?: string }
  row?: Record<string, unknown>
  field?: Record<string, unknown>
  record?: Record<string, unknown>
  param?: Record<string, unknown>
}

const SEGMENTS = ['node', 'row', 'field', 'record', 'param'] as const

export function resolveTemplate(str: string, ctx: TemplateContext): string {
  return str.replace(/\{(\w+)\.(\w+)\}/g, (_, seg: string, key: string) => {
    if (!(SEGMENTS as readonly string[]).includes(seg)) return ''
    const holder = ctx[seg as keyof TemplateContext]
    const value = holder && typeof holder === 'object' ? (holder as Record<string, unknown>)[key] : undefined
    return value === undefined || value === null ? '' : String(value)
  })
}
