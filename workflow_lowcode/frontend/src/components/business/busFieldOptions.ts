// ----- 总线 set-filter 字段候选：按目标数据源取实际列 -----
// 与仪表盘/数据绑定配置同一口径（getMetadata 列清单，http 层 30s 缓存）。

import { dataSourceApi } from '@/api/data-source'

export interface BusFieldOption {
  /** 物理列名（filter 按列名生效） */
  value: string
  /** 展示名：列名（中文名） */
  label: string
}

const cache = new Map<string, BusFieldOption[]>()
const inflight = new Map<string, Promise<BusFieldOption[]>>()

/** 目标数据源（全局 refId）的可筛列；未登记类型与子表占位列不进候选 */
export function loadBusFieldOptions(refId: string): Promise<BusFieldOption[]> {
  const cached = cache.get(refId)
  if (cached) return Promise.resolve(cached)
  const pending = inflight.get(refId)
  if (pending) return pending

  const task = (async () => {
    try {
      const res = await dataSourceApi.getMetadata(refId)
      const byKey = new Map<string, BusFieldOption>()
      for (const col of res.data?.columns || []) {
        const key = String(col?.key ?? '')
        if (!key || col.unsupported || byKey.has(key)) continue
        const cn = col.label && col.label !== key ? col.label : ''
        byKey.set(key, { value: key, label: cn ? `${key}（${cn}）` : key })
      }
      const options = [...byKey.values()]
      cache.set(refId, options)
      return options
    } catch {
      // 不缓存失败结果：下次展开重试；期间下拉为空，字段名仍可手输
      return []
    } finally {
      inflight.delete(refId)
    }
  })()

  inflight.set(refId, task)
  return task
}

/** 仅测试用：清空缓存与在途请求 */
export function resetBusFieldCache(): void {
  cache.clear()
  inflight.clear()
}
