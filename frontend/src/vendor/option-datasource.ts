import { dataSourceApi } from '@/api/data-source'
import { activeDsBindings } from '@/utils/formDsBindingsStore'
import type { DataSourceBindingContext } from '@/components/business/types'

export interface OptionDataSourceConfig {
  readonly dataSourceId?: string
  readonly filters?: string
  readonly labelField: string
  readonly valueField: string
  readonly childrenField?: string
  readonly parentField?: string
}

export interface OptionNode {
  readonly label: unknown
  readonly value: unknown
  readonly children?: OptionNode[]
}

export class OptionMappingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OptionMappingError'
  }
}

type DataRecord = Record<string, unknown>

function isRecord(value: unknown): value is DataRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRequired(record: DataRecord, field: string, kind: 'label' | 'value'): unknown {
  if (!(field in record)) {
    throw new OptionMappingError(`Missing required ${kind} field: ${field}`)
  }
  return record[field]
}

function mapRecord(record: DataRecord, config: OptionDataSourceConfig): OptionNode {
  const node: OptionNode = {
    label: readRequired(record, config.labelField, 'label'),
    value: readRequired(record, config.valueField, 'value'),
  }

  if (config.childrenField && Array.isArray(record[config.childrenField])) {
    return {
      ...node,
      children: mapRecords(record[config.childrenField], { ...config, parentField: undefined }),
    }
  }

  return node
}

function mapRecords(records: unknown, config: OptionDataSourceConfig): OptionNode[] {
  if (!Array.isArray(records)) return []
  return records.filter(isRecord).map((record) => mapRecord(record, config))
}

function mapFlatTree(records: DataRecord[], config: OptionDataSourceConfig): OptionNode[] {
  const nodes = records.map((record) => mapRecord(record, { ...config, parentField: undefined }))
  const nodeByValue = new Map<unknown, OptionNode>()
  const parentByValue = new Map<unknown, unknown>()
  records.forEach((record, index) => {
    const node = nodes[index]
    if (!node || !config.parentField) return
    nodeByValue.set(node.value, node)
    parentByValue.set(node.value, record[config.parentField])
  })

  const childrenByParent = new Map<unknown, OptionNode[]>()
  for (const node of nodes) {
    const parentValue = parentByValue.get(node.value)
    if (nodeByValue.has(parentValue)) {
      const children = childrenByParent.get(parentValue) ?? []
      children.push(node)
      childrenByParent.set(parentValue, children)
    }
  }

  const attachChildren = (node: OptionNode): OptionNode => {
    const children = childrenByParent.get(node.value)
    return children && children.length > 0
      ? { ...node, children: children.map(attachChildren) }
      : node
  }

  return nodes
    .filter((node) => !nodeByValue.has(parentByValue.get(node.value)))
    .map(attachChildren)
}

export function mapOptionRecords(records: unknown, config: OptionDataSourceConfig): OptionNode[] {
  if (!Array.isArray(records) || records.length === 0) return []
  if (!config.labelField) throw new OptionMappingError('labelField is required')
  if (!config.valueField) throw new OptionMappingError('valueField is required')

  const validRecords = records.filter(isRecord)
  if (config.parentField) return mapFlatTree(validRecords, config)
  return mapRecords(validRecords, config)
}

/**
 * 解析选项数据源为 render 可用的选项列表。
 * @param bindings 当前表单/表单级数据源绑定（页内 id → 全局 refId）。缺省回退全局 activeDsBindings。
 *                 推荐由调用方传入当前表单绑定位，避免依赖全局 store 的写入时序。
 */
export async function resolveOptionDataSource(
  config: OptionDataSourceConfig,
  bindings?: DataSourceBindingContext[],
): Promise<OptionNode[]> {
  if (!config.dataSourceId) return []
  const lookup = bindings ?? activeDsBindings.value
  const binding = lookup.find((item) => item.id === config.dataSourceId)
  const sourceId = binding?.refId ?? config.dataSourceId
  const response = await dataSourceApi.queryData(sourceId, {
    page: 1,
    size: 1000,
    ...(config.filters ? { filter: config.filters } : {}),
  })
  const records = response.data?.records
  return mapOptionRecords(records, config)
}
