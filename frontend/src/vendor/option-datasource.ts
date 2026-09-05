import { dataSourceApi } from '@/api/data-source'
import { activeDsBindings } from '@/utils/formDsBindingsStore'
import type { DataSourceBindingContext } from '@/components/business/types'
import type { Rule } from '@form-create/element-ui'

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
  // queryData 返回的 records 为 BizDataVO（{ id, data:{...}, version }）嵌套结构，
  // 展开 data 为扁平记录后再映射选项（labelField/valueField 指向业务列，位于 data 内）
  const flatRecords = Array.isArray(records)
    ? records.map((r) => {
        const inner = (r.data && typeof r.data === 'object' && !Array.isArray(r.data))
          ? r.data
          : {}
        // 业务列优先；仅当 data 无 id 列时才回退记录主键（避免外层记录主键覆盖业务 id 列，如 valueField=id 的部门树）
        return { ...inner, version: r.version, id: ('id' in inner) ? inner.id : r.id }
      })
    : records
  return mapOptionRecords(flatRecords, config)
}

/** 递归判断 rule 树中是否存在选项数据源（effect.datasource）节点 */
export function hasOptionDatasource(rules: Rule[]): boolean {
  return rules.some((rule) => {
    const node = rule as Rule & { effect?: Record<string, unknown>; children?: Rule[]; props?: Record<string, any> }
    return Boolean(node.effect?.datasource)
      || (Array.isArray(node.children) && hasOptionDatasource(node.children))
      || (Array.isArray(node.props?.rule) && hasOptionDatasource(node.props.rule))
  })
}

/** 按组件类型返回选项承载字段：select 类用 rule.options，树/穿梭/级联用 props 下的字段 */
function optionTarget(type?: string): { key?: undefined; propsKey?: 'data' | 'options' } {
  if (type === 'elTreeSelect' || type === 'elTransfer' || type === 'tree' || type === 'el-transfer' || type === 'transfer') {
    return { propsKey: 'data' }
  }
  if (type === 'el-cascader' || type === 'cascader') {
    return { propsKey: 'options' }
  }
  return {}
}

/**
 * 将 rule 树中的选项数据源节点解析为可渲染选项列表。
 * @param bindings 页内数据源绑定（id → 全局 refId）。缺省回退全局 activeDsBindings。
 *                 由调用方传入当前表单/页面的绑定位，避免依赖全局 store 的写入时序。
 */
export async function resolveOptionRules(
  rules: Rule[],
  bindings?: DataSourceBindingContext[],
): Promise<Rule[]> {
  const resolved = await Promise.all(rules.map(async (rule) => {
    const node = { ...rule } as Rule & { effect?: Record<string, unknown>; options?: unknown[]; children?: Rule[]; props?: Record<string, any> }
    const datasource = node.effect?.datasource
    if (datasource && typeof datasource === 'object') {
      const opts = await resolveOptionDataSource(
        datasource as OptionDataSourceConfig,
        bindings,
      )
      const target = optionTarget(node.type)
      if (target.propsKey) {
        // 树/级联/穿梭组件：选项承载在 props.data / props.options（elTreeSelect 读 props.data，el-cascader 读 props.options）
        node.props = { ...(node.props || {}), [target.propsKey]: opts }
      } else {
        node.options = opts
      }
    }
    if (Array.isArray(node.children)) node.children = await resolveOptionRules(node.children as Rule[], bindings)
    if (node.props && Array.isArray(node.props.rule)) {
      node.props = { ...node.props, rule: await resolveOptionRules(node.props.rule as Rule[], bindings) }
    }
    return node as unknown as Rule
  }))
  return resolved
}
