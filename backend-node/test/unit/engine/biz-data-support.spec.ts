import { describe, expect, it } from 'vitest'
import {
  COLUMN_NAME_PATTERN,
  parseBusinessColumnConfig,
  resolveSortable,
} from '../../../src/engine/form/column/column-config-parser'
import {
  asDateTime,
  asInt,
  collectPickerRefs,
  deserializeJsonValue,
  parseFilter,
} from '../../../src/engine/form/bizdata/biz-data-support'
import { buildBizDataContext } from '../../../src/engine/form/bizdata/biz-data-context'
import { newColumnConfig, type ColumnConfig } from '../../../src/common/domain/column-config'

/**
 * `column_config` 解析与行映射相关纯函数的单测。
 *
 * 这些函数是 `dsMetadata` / `bizPersonList` 两条 golden 形状的直接来源，
 * 但 golden 只覆盖了 `person` 这一份配置。缺失字段的默认值、校验消息、
 * 子表拆分规则都只能在这里锁住。
 */

/** `wf_biz_person` 的真实 column_config（取自契约库，逐字节一致）。 */
const PERSON_COLUMN_CONFIG = JSON.stringify([
  {
    key: 'code',
    label: '人员编码',
    scale: null,
    length: 255,
    unique: true,
    indexed: false,
    required: true,
    columnType: 'VARCHAR',
    componentType: 'input',
  },
  {
    key: 'name',
    label: '人员姓名',
    scale: null,
    length: 255,
    unique: false,
    indexed: false,
    required: true,
    columnType: 'VARCHAR',
    componentType: 'input',
  },
  {
    key: 'dept',
    label: '所属部门',
    scale: null,
    length: null,
    unique: false,
    indexed: false,
    required: false,
    columnType: 'JSON',
    componentType: 'elTreeSelect',
  },
  {
    key: 'dept_text',
    label: '所属部门（显示）',
    scale: null,
    hidden: true,
    length: 255,
    unique: false,
    indexed: false,
    required: false,
    columnType: 'VARCHAR',
    componentType: 'elTreeSelectText',
  },
])

describe('parseBusinessColumnConfig', () => {
  it('解析真实 person 配置：4 列、字段与顺序保持', () => {
    const columns = parseBusinessColumnConfig(PERSON_COLUMN_CONFIG)
    expect(columns.map((c) => c.key)).toEqual(['code', 'name', 'dept', 'dept_text'])
    expect(columns[0].label).toBe('人员编码')
    expect(columns[0].unique).toBe(true)
    expect(columns[1].unique).toBe(false)
  })

  it('配置里没写的字段补成 Java 侧 POJO 的默认值', () => {
    const [code] = parseBusinessColumnConfig(PERSON_COLUMN_CONFIG)
    // 前端没写这些字段，但 Java 的 Jackson 会把它们序列化出来 ——
    // 少一个就是契约里的「字段缺失」
    expect(code.storageMode).toBe('JSON')
    expect(code.hidden).toBe(false)
    expect(code.pickerConfig).toBeNull()
    expect(code.sortable).toBeNull()
    expect(code.filterable).toBeNull()
    expect(code.matchType).toBeNull()
    expect(code.subColumns).toBeNull()
    expect(code.subMode).toBeNull()
    expect(Object.keys(code).sort()).toEqual(Object.keys(newColumnConfig()).sort())
  })

  it('配置里显式写的值覆盖默认值', () => {
    const columns = parseBusinessColumnConfig(PERSON_COLUMN_CONFIG)
    expect(columns[3].hidden).toBe(true)
    expect(columns[2].length).toBeNull()
  })

  it('空白配置 → 400（消息逐字对齐 Java）', () => {
    expect(() => parseBusinessColumnConfig(null)).toThrow(
      '业务表单发布前必须配置列映射（column_config）',
    )
    expect(() => parseBusinessColumnConfig('   ')).toThrow(
      '业务表单发布前必须配置列映射（column_config）',
    )
  })

  it('非法 JSON → 400', () => {
    expect(() => parseBusinessColumnConfig('{not json')).toThrow(/列映射配置非法/)
  })

  it('非数组 → 400', () => {
    expect(() => parseBusinessColumnConfig('{"a":1}')).toThrow(/列映射配置非法/)
  })

  it('空数组 → 400', () => {
    expect(() => parseBusinessColumnConfig('[]')).toThrow('业务表单列映射不能为空')
  })

  it('非法列名 → 400', () => {
    expect(() => parseBusinessColumnConfig(JSON.stringify([{ key: '1bad', columnType: 'VARCHAR' }]))).toThrow(
      '非法列名: 1bad',
    )
  })

  it('系统保留列 → 400', () => {
    expect(() =>
      parseBusinessColumnConfig(JSON.stringify([{ key: 'version', columnType: 'INT' }])),
    ).toThrow('列名 version 为系统保留列')
  })

  it('非法列类型 → 400', () => {
    expect(() =>
      parseBusinessColumnConfig(JSON.stringify([{ key: 'x', columnType: 'BLOB' }])),
    ).toThrow('非法列类型: BLOB')
  })

  it('SUB_TABLE 存储模式 → 400（Java 侧也未实现）', () => {
    expect(() =>
      parseBusinessColumnConfig(
        JSON.stringify([{ key: 'x', columnType: 'VARCHAR', storageMode: 'SUB_TABLE' }]),
      ),
    ).toThrow('子表存储模式暂未实现: x')
  })

  it('子表字段自身无列类型时递归校验子列', () => {
    expect(() =>
      parseBusinessColumnConfig(
        JSON.stringify([
          {
            key: 'items',
            subColumns: [{ key: '1bad', columnType: 'VARCHAR' }],
          },
        ]),
      ),
    ).toThrow('非法列名: 1bad')
  })
})

describe('validateColumnConfig', () => {
  it('列名模式：字母开头，最长 64', () => {
    expect(COLUMN_NAME_PATTERN.test('code_1')).toBe(true)
    expect(COLUMN_NAME_PATTERN.test('_code')).toBe(false)
    expect(COLUMN_NAME_PATTERN.test('a'.repeat(64))).toBe(true)
    expect(COLUMN_NAME_PATTERN.test('a'.repeat(65))).toBe(false)
  })
})

describe('resolveSortable', () => {
  it('按列类型推导，且不覆盖已显式标注的列', () => {
    const columns = parseBusinessColumnConfig(PERSON_COLUMN_CONFIG)
    columns[1].sortable = false // 显式标注
    resolveSortable(columns)
    expect(columns.map((c) => [c.key, c.sortable])).toEqual([
      ['code', true], // VARCHAR → 可排
      ['name', false], // 显式标注，不被覆盖
      ['dept', false], // JSON → 不可排
      ['dept_text', true], // VARCHAR → 可排
    ])
  })

  it('TEXT 与 colorPicker 不可排；含子表的列不可排', () => {
    const text = { ...newColumnConfig(), key: 'a', columnType: 'TEXT' }
    const color = { ...newColumnConfig(), key: 'b', columnType: 'VARCHAR', componentType: 'colorPicker' }
    const withSub: ColumnConfig = {
      ...newColumnConfig(),
      key: 'c',
      columnType: 'VARCHAR',
      subColumns: [{ ...newColumnConfig(), key: 's', columnType: 'VARCHAR' }],
    }
    resolveSortable([text, color, withSub])
    expect([text.sortable, color.sortable, withSub.sortable]).toEqual([false, false, false])
  })
})

describe('buildBizDataContext', () => {
  it('子表字段不进主表列白名单，并映射到独立物理表', () => {
    const columns: ColumnConfig[] = [
      { ...newColumnConfig(), key: 'code', columnType: 'VARCHAR' },
      {
        ...newColumnConfig(),
        key: 'items',
        subColumns: [{ ...newColumnConfig(), key: 'qty', columnType: 'INT' }],
      },
    ]
    const ctx = buildBizDataContext('leave_apply_biz', columns)
    expect(ctx.tableName).toBe('wf_biz_leave_apply_biz')
    // 「子表字段不是主表列」—— 漏了这一步，动态 SQL 会去查不存在的列
    expect(ctx.columnKeys).toEqual(['code'])
    const sub = ctx.subTables.get('items')
    expect(sub?.tableName).toBe('wf_biz_leave_apply_biz_items')
    expect(sub?.subMode).toBe('embedded')
    expect(sub?.subKeys).toEqual(['qty'])
  })

  it('显式 subMode 优先于默认 embedded', () => {
    const columns: ColumnConfig[] = [
      {
        ...newColumnConfig(),
        key: 'items',
        subMode: 'SUB_TABLE',
        subColumns: [{ ...newColumnConfig(), key: 'qty', columnType: 'INT' }],
      },
    ]
    expect(buildBizDataContext('f', columns).subTables.get('items')?.subMode).toBe('SUB_TABLE')
  })
})

describe('parseFilter', () => {
  it('空 / 空白 → 空对象', () => {
    expect(parseFilter(null)).toEqual({})
    expect(parseFilter('  ')).toEqual({})
  })

  it('合法 JSON 对象原样返回', () => {
    expect(parseFilter('{"code":"001"}')).toEqual({ code: '001' })
  })

  it('非法 JSON → 400 且消息含原始原因', () => {
    expect(() => parseFilter('{oops')).toThrow(/筛选参数 filter 格式非法，应为 JSON 对象/)
  })

  it('JSON 数组不是合法 filter（Java 反序列化到 Map 会失败）', () => {
    expect(() => parseFilter('[1,2]')).toThrow(/筛选参数 filter 格式非法/)
  })
})

describe('deserializeJsonValue', () => {
  it('JSON 字符串解析成对象/数组（person.dept → ["2"]）', () => {
    expect(deserializeJsonValue('["2"]')).toEqual(['2'])
    expect(deserializeJsonValue('{"a":1}')).toEqual({ a: 1 })
  })

  it('非字符串原样返回', () => {
    expect(deserializeJsonValue(2)).toBe(2)
    expect(deserializeJsonValue(null)).toBeNull()
  })

  it('解析失败原样返回（兼容旧逗号串数据，对齐 Java）', () => {
    expect(deserializeJsonValue('1,2,3')).toBe('1,2,3')
  })
})

describe('collectPickerRefs', () => {
  it('无 pickerConfig 的配置不产生引用', () => {
    const result: Record<string, { count: number; referencedBy: string[] }> = {}
    collectPickerRefs(PERSON_COLUMN_CONFIG, 'person', result)
    expect(result).toEqual({})
  })

  it('聚合 targetFormKey 的引用次数与来源表单', () => {
    const config = JSON.stringify([
      { key: 'user_id', columnType: 'JSON', pickerConfig: '{"pickerType":"dataPicker","sourceFormKey":"person"}' },
      { key: 'other', columnType: 'JSON', pickerConfig: '{"sourceFormKey":"leave_apply_biz"}' },
    ])
    const result: Record<string, { count: number; referencedBy: string[] }> = {}
    collectPickerRefs(config, 'leave_apply_biz', result)
    expect(result).toEqual({
      person: { count: 1, referencedBy: ['leave_apply_biz'] },
      leave_apply_biz: { count: 1, referencedBy: ['leave_apply_biz'] },
    })
  })

  it('同一目标被多次引用时计数累加', () => {
    const config = JSON.stringify([
      { key: 'a', pickerConfig: '{"sourceFormKey":"person"}' },
      { key: 'b', pickerConfig: '{"sourceFormKey":"person"}' },
    ])
    const result: Record<string, { count: number; referencedBy: string[] }> = {}
    collectPickerRefs(config, 'x', result)
    expect(result.person.count).toBe(2)
    expect(result.person.referencedBy).toEqual(['x', 'x'])
  })

  it('非法 JSON / 缺 sourceFormKey 时静默跳过（对齐 Java 的空 catch）', () => {
    const result: Record<string, { count: number; referencedBy: string[] }> = {}
    collectPickerRefs('{oops', 'x', result)
    collectPickerRefs(JSON.stringify([{ key: 'a', pickerConfig: '{"pickerType":"dataPicker"}' }]), 'x', result)
    expect(result).toEqual({})
  })
})

describe('asInt / asDateTime', () => {
  it('asInt：数字取整，字符串可解析，null → null', () => {
    expect(asInt(2)).toBe(2)
    expect(asInt('3')).toBe(3)
    expect(asInt(null)).toBeNull()
    expect(asInt('abc')).toBeNull()
  })

  it('asDateTime：Date 原样，null → null', () => {
    const date = new Date('2026-09-11T11:46:54.000Z')
    expect(asDateTime(date)).toBe(date)
    expect(asDateTime(null)).toBeNull()
  })
})
