import { describe, expect, it } from 'vitest'
import {
  isConfigMode,
  isSqlMode,
  isVisualMode,
  parseFormQueryConfig,
} from '../../../src/engine/form/bizdata/form-query-config'

/**
 * `FormQueryConfig` 的单测（对齐 Java `FormQueryConfig` 167 行）。
 *
 * 这个解析器是「FORM 数据源到底是什么查询模式」的**唯一入口**：
 * 它的判定直接决定适配器走单表 / JOIN / SQL 模板哪条分支。
 * 两条容易做错、且出错就会静默走错分支的规则：
 *
 *   1. **降级**：`queryMode=config` 但 `joins` 空、`queryMode=sql` 但 `query` 空白
 *      → 三个 `isXxxMode` 全 false，回退单表查询（向后兼容），**不是**报错。
 *   2. **未知模式**：保留 `queryMode` 字符串但同样全 false ——
 *      未知模式的拒绝发生在保存校验（`validateFormQueryConfig`），不在解析器。
 */

const fail = (message: string): Error => new Error(message)

function messageOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error('预期抛错，但没有抛')
}

const CONFIG_JSON = JSON.stringify({
  queryMode: 'config',
  joins: [
    {
      alias: 'c',
      targetFormKey: 'customer',
      localField: 'customer_id',
      foreignField: 'id',
      joinField: 'name',
      virtualKey: 'customer_name',
      label: '客户',
      sortable: true,
      filterable: false,
    },
    { alias: 'bad' },
    'not-an-object',
  ],
})

const SQL_JSON = JSON.stringify({
  queryMode: 'sql',
  query: 'SELECT a, b FROM t WHERE tenant_id = :tenantId',
  columns: [
    { key: 'a', label: 'A', columnType: 'VARCHAR', sortable: true, filterable: true, length: 64 },
    { key: 'b', columnType: 'DECIMAL' },
  ],
  params: ['startTime', '', '  ', 42, null],
})

describe('FormQueryConfig.parse', () => {
  it('null / 空白 → 默认配置（三模式全 false，queryMode 为 null）', () => {
    for (const input of [null, '', '   ']) {
      const config = parseFormQueryConfig(input, fail)
      expect(config).toEqual({
        queryMode: null,
        joins: [],
        query: null,
        columns: [],
        declaredParams: [],
      })
      expect([isConfigMode(config), isSqlMode(config), isVisualMode(config)]).toEqual([
        false,
        false,
        false,
      ])
    }
  })

  it('非法 JSON → 400 文案；非对象根 → 400「必须是 JSON 对象」', () => {
    expect(messageOf(() => parseFormQueryConfig('{oops}', fail))).toContain(
      '数据源 params 不是合法 JSON: ',
    )
    expect(messageOf(() => parseFormQueryConfig('[1,2]', fail))).toBe(
      '数据源 params 必须是 JSON 对象',
    )
    expect(messageOf(() => parseFormQueryConfig('"x"', fail))).toBe('数据源 params 必须是 JSON 对象')
    expect(messageOf(() => parseFormQueryConfig('null', fail))).toBe('数据源 params 必须是 JSON 对象')
  })

  it('config 模式：joins 解析（非对象项跳过）、布尔缺失即 false', () => {
    const config = parseFormQueryConfig(CONFIG_JSON, fail)
    expect(isConfigMode(config)).toBe(true)
    expect(config.query).toBeNull()
    expect(config.columns).toEqual([])
    expect(config.joins).toHaveLength(2)
    expect(config.joins[0]).toEqual({
      alias: 'c',
      targetFormKey: 'customer',
      localField: 'customer_id',
      foreignField: 'id',
      joinField: 'name',
      virtualKey: 'customer_name',
      label: '客户',
      sortable: true,
      filterable: false,
    })
    // 缺字段 → null，布尔缺省 false（Java 的 primitive record 字段）
    expect(config.joins[1]).toEqual({
      alias: 'bad',
      targetFormKey: null,
      localField: null,
      foreignField: null,
      joinField: null,
      virtualKey: null,
      label: null,
      sortable: false,
      filterable: false,
    })
  })

  it('config 模式但 joins 空 → 降级单表（isConfigMode=false）', () => {
    expect(isConfigMode(parseFormQueryConfig('{"queryMode":"config"}', fail))).toBe(false)
    expect(isConfigMode(parseFormQueryConfig('{"queryMode":"config","joins":[]}', fail))).toBe(false)
    expect(isConfigMode(parseFormQueryConfig('{"queryMode":"config","joins":"x"}', fail))).toBe(false)
  })

  it('sql 模式：query/columns/params 解析，声明列按 ColumnConfig 默认值补齐', () => {
    const config = parseFormQueryConfig(SQL_JSON, fail)
    expect(isSqlMode(config)).toBe(true)
    expect(config.joins).toEqual([])
    expect(config.query).toBe('SELECT a, b FROM t WHERE tenant_id = :tenantId')
    // 只收非空白字符串（Java parseStrings 过滤掉 ''、'  '、数字、null）
    expect(config.declaredParams).toEqual(['startTime'])

    const first = config.columns[0]
    expect(first.key).toBe('a')
    expect(first.label).toBe('A')
    expect(first.columnType).toBe('VARCHAR')
    expect(first.length).toBe(64)
    expect(first.sortable).toBe(true)
    expect(first.filterable).toBe(true)
    // Java parseColumns 没赋值的字段 = POJO 初始化值，**不能**漏
    expect(first.pickerConfig).toBeNull()
    expect(first.storageMode).toBe('JSON')
    expect(first.subColumns).toBeNull()
    expect(first.subMode).toBeNull()
    expect(first.required).toBe(false)
    expect(first.unique).toBe(false)
    expect(first.indexed).toBe(false)
    expect(first.hidden).toBe(false)
    expect(first.componentType).toBeNull()
    expect(first.matchType).toBeNull()
    expect(first.scale).toBeNull()

    expect(config.columns[1].sortable).toBe(false)
    // 非数字 length → null（Java 的 isNumber() 判定）
    expect(config.columns[1].length).toBeNull()
  })

  it('sql 模式但 query 空白 → 降级单表（isSqlMode=false）', () => {
    expect(isSqlMode(parseFormQueryConfig('{"queryMode":"sql"}', fail))).toBe(false)
    expect(isSqlMode(parseFormQueryConfig('{"queryMode":"sql","query":"   "}', fail))).toBe(false)
  })

  it('visual 模式：与 sql 同形，isVisualMode 独立判定', () => {
    const config = parseFormQueryConfig(
      JSON.stringify({ queryMode: 'visual', query: 'SELECT 1 FROM t WHERE x = :tenantId', columns: [] }),
      fail,
    )
    expect(isVisualMode(config)).toBe(true)
    expect(isSqlMode(config)).toBe(false)
    expect(isConfigMode(config)).toBe(false)
  })

  it('未知 / 缺失 queryMode → 保留原值但三模式全 false', () => {
    const unknown = parseFormQueryConfig('{"queryMode":"weird","query":"SELECT 1"}', fail)
    expect(unknown.queryMode).toBe('weird')
    expect([isConfigMode(unknown), isSqlMode(unknown), isVisualMode(unknown)]).toEqual([
      false,
      false,
      false,
    ])
    const missing = parseFormQueryConfig('{"joins":[]}', fail)
    expect(missing.queryMode).toBeNull()
  })
})
