/**
 * @lc/runtime-uni/picker：查找选择器移动端数据层与回写（Task 11.2）。
 *
 * 语义对位 web src/components/business/LookupPicker.vue：
 *  · 取数复用列表数据层 useUniList（GET /v1/data-sources/:refId/data，page/size/filter），
 *    搜索 = searchColumns like —— 与列表页同一份查询口径，不为选择器另造一套；
 *  · 选中回写（:273-295）：idField ← row.id，returnFields 方向 key=被查表源字段、
 *    value=表单目标字段；自身字段承载「显示文本」（:268-270）由 emit 产物按
 *    uniPickerTextOf 置值；
 *  · 清除（:302-315）：同一批目标字段一律置 null（自身字段置空串由产物负责）；
 *  · 回写拆成纯函数：无 vue / uni 全局依赖，单测不需要运行时环境。
 */
import { ref } from 'vue'

import { uniRequest, type R, type UniRequestCall } from './http'
import { useUniList, type UniListSearchField } from './list'

export interface UniPickerWriteSpec {
  /** 承载选中记录 id 的表单字段名（契约 idField） */
  idField?: string
  /** returnFields：key = 被查表的源字段、value = 表单里的目标字段（别写反） */
  returnFields?: Record<string, string>
  /** 弹层行与自身字段展示用的列（契约 displayField；取不到时退回行 id） */
  displayField?: string
}

/** 回写涉及的表单字段（idField + returnFields 的值，去重保序）——清除时同一批复位 */
export function pickerWriteTargets(spec: UniPickerWriteSpec): string[] {
  const targets = new Set<string>()
  if (spec.idField) targets.add(spec.idField)
  for (const target of Object.values(spec.returnFields ?? {})) targets.add(target)
  return [...targets]
}

/** 选中回写：idField ← row.id；returnFields 的源字段值 → 目标字段（源缺失记 null，不留 undefined） */
export function applyUniPickerWrites(
  form: Record<string, unknown>,
  row: Record<string, unknown> | null | undefined,
  spec: UniPickerWriteSpec,
): void {
  if (!form || !row) return
  if (spec.idField) form[spec.idField] = row.id ?? null
  for (const [source, target] of Object.entries(spec.returnFields ?? {})) {
    form[target] = row[source] ?? null
  }
}

/** 清除回写：同一批目标字段一律置 null（对位 LookupPicker.vue:302-315 的清空回填） */
export function clearUniPickerWrites(form: Record<string, unknown>, spec: UniPickerWriteSpec): void {
  for (const target of pickerWriteTargets(spec)) form[target] = null
}

/**
 * 自身字段的显示文本：displayField 取值；未配置、取不到或取到空串时退回行 id ——
 * 选中后触发框必须可见，不然用户看着空框却已经带回了隐藏字段（web 侧留 null 由组件
 * 自己的 displayText 兜，产物没有那层组件，兜底放在这里）。
 */
export function uniPickerTextOf(
  row: Record<string, unknown> | null | undefined,
  displayField?: string,
): string {
  if (!row) return ''
  const picked = displayField ? row[displayField] : row.id
  const value = picked === null || picked === undefined || picked === '' ? row.id : picked
  return value === null || value === undefined ? '' : String(value)
}

export interface UniPickerOptions {
  refId: string
  /** 页大小（缺省 20，与列表页 defaultPageSize 同口径） */
  pageSize?: number
  /** 搜索条关键字命中的字段面（emit 侧从契约 searchColumns 生成） */
  searchFields?: UniListSearchField[]
  /** 请求器注入（缺省 uniRequest 缺省配置：token + 租户头，baseURL=/api 平台前缀） */
  request?: <T>(call: UniRequestCall) => Promise<R<T>>
}

/**
 * 选择器弹层的状态与动作：取数面整体复用 useUniList（rows/keyword/loading/finished/
 * onSearch/loadMore…），只加弹层开关。首开才取数——同一次会话里反复开关不重复查表；
 * 搜索确认（onSearch）与触底（loadMore）沿用列表数据层语义。
 */
export function useUniPicker(options: UniPickerOptions) {
  const list = useUniList({
    refId: options.refId,
    pageSize: options.pageSize ?? 20,
    searchFields: options.searchFields,
    request: options.request,
  })
  const visible = ref(false)
  const loaded = ref(false)

  /** 打开弹层：首开先取数，之后重开沿用上次结果（搜/触底可再拉） */
  async function open(): Promise<void> {
    visible.value = true
    if (loaded.value) return
    loaded.value = true
    await list.reload()
  }

  function close(): void {
    visible.value = false
  }

  return { ...list, visible, loaded, open, close }
}