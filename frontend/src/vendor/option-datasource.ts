export interface OptionDataSourceConfig {
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
  const byValue = new Map<unknown, OptionNode>()
  records.forEach((_, index) => {
    const node = nodes[index]
    if (node) byValue.set(node.value, node)
  })
  const roots: OptionNode[] = []

  records.forEach((record, index) => {
    const node = nodes[index]
    if (!node || !config.parentField) return
    const parentValue = record[config.parentField]
    const parent = byValue.get(parentValue)
    if (parent && parent !== node) {
      const children = parent.children ? [...parent.children, node] : [node]
      byValue.set(parent.value, { ...parent, children })
      const parentIndex = nodes.indexOf(parent)
      const updatedParent = byValue.get(parent.value)
      if (parentIndex >= 0 && updatedParent) nodes[parentIndex] = updatedParent
    } else {
      roots.push(node)
    }
  })

  return roots
}

export function mapOptionRecords(records: unknown, config: OptionDataSourceConfig): OptionNode[] {
  if (!Array.isArray(records) || records.length === 0) return []
  if (!config.labelField) throw new OptionMappingError('labelField is required')
  if (!config.valueField) throw new OptionMappingError('valueField is required')

  const validRecords = records.filter(isRecord)
  if (config.parentField) return mapFlatTree(validRecords, config)
  return mapRecords(validRecords, config)
}
