import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    queryData: vi.fn(),
  },
}))

import {
  mapOptionRecords,
  resolveOptionDataSource,
  resolveOptionRules,
  hasOptionDatasource,
  OptionDataSourceConfig,
  OptionMappingError,
} from '../option-datasource'
import { dataSourceApi } from '@/api/data-source'
import { activeDsBindings } from '@/utils/formDsBindingsStore'

beforeEach(() => {
  vi.clearAllMocks()
  activeDsBindings.value = []
})

describe('mapOptionRecords', () => {
  it('returns empty array for null input', () => {
    const config: OptionDataSourceConfig = {
      labelField: 'label',
      valueField: 'value'
    }
    expect(mapOptionRecords(null, config)).toEqual([])
  })

  it('returns empty array for undefined input', () => {
    const config: OptionDataSourceConfig = {
      labelField: 'label',
      valueField: 'value'
    }
    expect(mapOptionRecords(undefined, config)).toEqual([])
  })

  it('returns empty array for non-array input', () => {
    const config: OptionDataSourceConfig = {
      labelField: 'label',
      valueField: 'value'
    }
    expect(mapOptionRecords({}, config)).toEqual([])
  })

  it('returns empty array for empty array input', () => {
    const config: OptionDataSourceConfig = {
      labelField: 'label',
      valueField: 'value'
    }
    expect(mapOptionRecords([], config)).toEqual([])
  })

  it('maps simple records with label and value fields', () => {
    const config: OptionDataSourceConfig = {
      labelField: 'name',
      valueField: 'id'
    }
    const records = [
      { id: 1, name: 'Option 1' },
      { id: 2, name: 'Option 2' },
      { id: 3, name: 'Option 3' }
    ]
    const result = mapOptionRecords(records, config)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ label: 'Option 1', value: 1 })
    expect(result[1]).toEqual({ label: 'Option 2', value: 2 })
    expect(result[2]).toEqual({ label: 'Option 3', value: 3 })
  })

  it('maps string values correctly', () => {
    const config: OptionDataSourceConfig = {
      labelField: 'displayName',
      valueField: 'key'
    }
    const records = [
      { key: 'a', displayName: 'Alpha' },
      { key: 'b', displayName: 'Beta' }
    ]
    const result = mapOptionRecords(records, config)
    expect(result).toEqual([
      { label: 'Alpha', value: 'a' },
      { label: 'Beta', value: 'b' }
    ])
  })

  it('throws error when label field is missing', () => {
    const config: OptionDataSourceConfig = {
      labelField: 'name',
      valueField: 'id'
    }
    const records = [{ id: 1 }] // missing 'name' field
    expect(() => mapOptionRecords(records, config)).toThrow(OptionMappingError)
    expect(() => mapOptionRecords(records, config)).toThrow('Missing required label field: name')
  })

  it('throws error when value field is missing', () => {
    const config: OptionDataSourceConfig = {
      labelField: 'name',
      valueField: 'id'
    }
    const records = [{ name: 'Test' }] // missing 'id' field
    expect(() => mapOptionRecords(records, config)).toThrow(OptionMappingError)
    expect(() => mapOptionRecords(records, config)).toThrow('Missing required value field: id')
  })

  it('maps nested records with childrenField', () => {
    const config: OptionDataSourceConfig = {
      labelField: 'name',
      valueField: 'id',
      childrenField: 'subItems'
    }
    const records = [
      {
        id: 1,
        name: 'Parent',
        subItems: [
          { id: 'a', name: 'Child A' },
          { id: 'b', name: 'Child B' }
        ]
      }
    ]
    const result = mapOptionRecords(records, config)
    expect(result).toHaveLength(1)
    expect(result[0].children).toHaveLength(2)
    expect(result[0].children![0]).toEqual({ label: 'Child A', value: 'a' })
    expect(result[0].children![1]).toEqual({ label: 'Child B', value: 'b' })
  })

  it('filters out null records', () => {
    const config: OptionDataSourceConfig = {
      labelField: 'name',
      valueField: 'id'
    }
    const records = [
      { id: 1, name: 'Valid' },
      null,
      undefined,
      { id: 2, name: 'Also Valid' }
    ]
    const result = mapOptionRecords(records, config)
    expect(result).toHaveLength(2)
  })

  it('builds flat trees when children appear before their parents', () => {
    const config: OptionDataSourceConfig = {
      labelField: 'name',
      valueField: 'id',
      parentField: 'parentId',
    }
    const result = mapOptionRecords([
      { id: 'child', parentId: 'root', name: 'Child' },
      { id: 'root', parentId: null, name: 'Root' },
    ], config)
    expect(result).toEqual([{ label: 'Root', value: 'root', children: [{ label: 'Child', value: 'child' }] }])
  })
})

describe('resolveOptionDataSource — BizDataVO 嵌套 data 展开', () => {
  const config: OptionDataSourceConfig = { dataSourceId: 'ds_1', labelField: 'name', valueField: 'name' }

  it('将 queryData 返回的 { id, data:{...} } 嵌套记录展开后映射 label/value', async () => {
    activeDsBindings.value = [{ id: 'ds_1', refId: 'ref_emp' }]
    ;(dataSourceApi.queryData as any).mockResolvedValue({
      data: {
        records: [
          { id: 'r1', data: { name: '张三', dept: '研发' }, version: 1 },
          { id: 'r2', data: { name: '李四', dept: '财务' }, version: 1 },
        ],
      },
    })

    const result = await resolveOptionDataSource(config)
    expect(result).toEqual([
      { label: '张三', value: '张三' },
      { label: '李四', value: '李四' },
    ])
    // 展开后用解析后的全局 refId 调接口
    expect(dataSourceApi.queryData).toHaveBeenCalledWith('ref_emp', expect.objectContaining({ page: 1, size: 1000 }))
  })

  it('dataSourceId 在绑定位缺失时回退用 dataSourceId 作为全局 refId', async () => {
    activeDsBindings.value = []
    ;(dataSourceApi.queryData as any).mockResolvedValue({
      data: { records: [{ id: 'r1', data: { name: '电子产品' }, version: 1 }] },
    })
    const result = await resolveOptionDataSource({ ...config, dataSourceId: 'cat_1' })
    expect(dataSourceApi.queryData).toHaveBeenCalledWith('cat_1', expect.anything())
    expect(result).toEqual([{ label: '电子产品', value: '电子产品' }])
  })

  it('业务列缺失时抛出 OptionMappingError（展开后仍校验 label/value 字段）', async () => {
    activeDsBindings.value = [{ id: 'ds_1', refId: 'ref_emp' }]
    ;(dataSourceApi.queryData as any).mockResolvedValue({
      data: { records: [{ id: 'r1', data: { dept: '研发' }, version: 1 }] },
    })
    await expect(resolveOptionDataSource(config)).rejects.toThrow(OptionMappingError)
    await expect(resolveOptionDataSource(config)).rejects.toThrow('Missing required label field: name')
  })
})

describe('hasOptionDatasource — 递归检测 effect.datasource', () => {
  it('顶层节点含 datasource 返回 true', () => {
    expect(hasOptionDatasource([{ type: 'select', field: 's', effect: { datasource: { dataSourceId: 'ds' } } } as any])).toBe(true)
  })

  it('children 递归命中', () => {
    const rules = [{ type: 'fcRow', field: 'r', children: [{ type: 'select', field: 's', effect: { datasource: { dataSourceId: 'ds' } } }] } as any]
    expect(hasOptionDatasource(rules)).toBe(true)
  })

  it('props.rule 递归命中（group/子表）', () => {
    const rules = [{ type: 'group', field: 'g', props: { rule: [{ type: 'select', field: 's', effect: { datasource: { dataSourceId: 'ds' } } }] } } as any]
    expect(hasOptionDatasource(rules)).toBe(true)
  })

  it('无 datasource 返回 false', () => {
    expect(hasOptionDatasource([{ type: 'input', field: 'a' } as any])).toBe(false)
  })
})

describe('resolveOptionRules — 共享选项解析', () => {
  it('解析顶层 select，传绑定上下文', async () => {
    const bindings = [{ id: 'ds_1', refId: 'ref_emp' }]
    ;(dataSourceApi.queryData as any).mockResolvedValue({
      data: { records: [{ id: 'r1', data: { name: '张三' }, version: 1 }] },
    })
    const rules = [{ type: 'select', field: 's', effect: { datasource: { dataSourceId: 'ds_1', labelField: 'name', valueField: 'name' } } } as any]
    const resolved = await resolveOptionRules(rules, bindings)
    expect(resolved[0].options).toEqual([{ label: '张三', value: '张三' }])
  })

  it('递归解析 children 与 props.rule', async () => {
    const bindings = [{ id: 'ds_1', refId: 'ref_emp' }]
    ;(dataSourceApi.queryData as any).mockResolvedValue({
      data: { records: [{ id: 'r1', data: { name: '李四' }, version: 1 }] },
    })
    const rules = [{
      type: 'fcRow', field: 'r',
      children: [{ type: 'select', field: 's', effect: { datasource: { dataSourceId: 'ds_1', labelField: 'name', valueField: 'name' } } } as any],
    } as any]
    const resolved = await resolveOptionRules(rules, bindings)
    expect(resolved[0].children[0].options).toEqual([{ label: '李四', value: '李四' }])
  })

  it('未传 bindings 时回退全局 activeDsBindings', async () => {
    activeDsBindings.value = [{ id: 'ds_1', refId: 'ref_emp' }]
    ;(dataSourceApi.queryData as any).mockResolvedValue({
      data: { records: [{ id: 'r1', data: { name: '王五' }, version: 1 }] },
    })
    const rules = [{ type: 'select', field: 's', effect: { datasource: { dataSourceId: 'ds_1', labelField: 'name', valueField: 'name' } } } as any]
    const resolved = await resolveOptionRules(rules)
    expect(resolved[0].options).toEqual([{ label: '王五', value: '王五' }])
  })
})

describe('resolveOptionRules — 树形/级联组件选项承载字段', () => {
  const bindings = [{ id: 'ds_1', refId: 'ref_emp' }]

  it('elTreeSelect 的选项写入 props.data 而非 rule.options', async () => {
    ;(dataSourceApi.queryData as any).mockResolvedValue({
      data: {
        records: [
          { id: 'r1', data: { id: '1', parentId: '', label: '总公司' }, version: 1 },
          { id: 'r2', data: { id: '2', parentId: '1', label: '武汉分公司' }, version: 1 },
        ],
      },
    })
    const rules = [{
      type: 'elTreeSelect', field: 'org',
      effect: { datasource: { dataSourceId: 'ds_1', labelField: 'label', valueField: 'id', parentField: 'parentId' } },
      props: { nodeKey: 'value', data: [] },
    } as any]
    const resolved = await resolveOptionRules(rules, bindings)
    // 写入 props.data，构造 parentId 树
    expect((resolved[0] as any).props.data).toEqual([
      { label: '总公司', value: '1', children: [{ label: '武汉分公司', value: '2' }] },
    ])
    // 不写入 rule.options
    expect((resolved[0] as any).options).toBeUndefined()
  })

  it('elTransfer 的选项写入 props.data 且补 key=value（key 为选中标识，防全选联动）', async () => {
    ;(dataSourceApi.queryData as any).mockResolvedValue({
      data: {
        records: [
          { id: 'r1', data: { id: '1', parentId: '', label: '研发部' }, version: 1 },
          { id: 'r2', data: { id: '2', parentId: '1', label: '前端组' }, version: 1 },
        ],
      },
    })
    const rules = [{
      type: 'elTransfer', field: 'team',
      effect: { datasource: { dataSourceId: 'ds_1', labelField: 'label', valueField: 'id', parentField: 'parentId' } },
      props: { data: [] },
    } as any]
    const resolved = await resolveOptionRules(rules, bindings)
    // 穿梭框读 props.data 且用 key 作为选中值标识（无 key 时所有项 key 相同 → 全选联动）；
    // 数据源映射生成 {label,value} → 需补 key=value（递归 children），保留 value 供显示映射
    expect((resolved[0] as any).props.data).toEqual([
      { label: '研发部', value: '1', key: '1', children: [{ label: '前端组', value: '2', key: '2' }] },
    ])
    expect((resolved[0] as any).options).toBeUndefined()
  })

  it('el-cascader 的选项写入 props.options', async () => {
    ;(dataSourceApi.queryData as any).mockResolvedValue({
      data: { records: [{ id: 'r1', data: { id: 'a', name: '电子产品' }, version: 1 }] },
    })
    const rules = [{
      type: 'el-cascader', field: 'cat',
      effect: { datasource: { dataSourceId: 'ds_1', labelField: 'name', valueField: 'id' } },
    } as any]
    const resolved = await resolveOptionRules(rules, bindings)
    expect((resolved[0] as any).props.options).toEqual([{ label: '电子产品', value: 'a' }])
    expect((resolved[0] as any).options).toBeUndefined()
  })

  it('select 仍写入 rule.options（回归）', async () => {
    ;(dataSourceApi.queryData as any).mockResolvedValue({
      data: { records: [{ id: 'r1', data: { name: '张三' }, version: 1 }] },
    })
    const rules = [{ type: 'select', field: 's', effect: { datasource: { dataSourceId: 'ds_1', labelField: 'name', valueField: 'name' } } } as any]
    const resolved = await resolveOptionRules(rules, bindings)
    expect((resolved[0] as any).options).toEqual([{ label: '张三', value: '张三' }])
    expect((resolved[0] as any).props?.data).toBeUndefined()
  })
})
