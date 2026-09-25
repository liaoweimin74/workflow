import { describe, expect, it } from 'vitest'
import { BizDataSupport } from '../../../src/engine/form/bizdata/biz-data-support'
import { runWithTenant } from '../../../src/framework/tenant/tenant-context'
import { compile } from '../helpers/compile-sql'

/**
 * 业务数据**写路径**里契约网够不到的部分。
 *
 * golden（场景「业务数据写操作」）覆盖了：必填缺失 400 / 乐观锁 409 / 不存在 404 /
 * 静默丢弃系统列 / 子表行增改删。**没覆盖**的是 data-picker 的 `<key>_text` 生成 ——
 * 两张契约表单里唯一带 `pickerConfig` 的列（`leave_apply_biz.name`）是
 * `lookupPicker`，按 `isDataPickerColumn` 的规则**整列跳过**。
 *
 * 这条路径的每条分支都对应一个真实的 400：引用值不是 JSON 数组 / 超 `maxCount` /
 * 引用了不存在的记录。它们只在写数据时才会炸，而且是"坏数据进库之前"的最后一道闸。
 */

const FORM_KEY = 'contract_picker'
const TABLE = `wf_biz_${FORM_KEY}`

/** 构造一份 column_config；`picker` 用来换掉 owner 列的 pickerConfig；`extraColumns` 追加额外列。 */
function columnConfig(
  picker: Record<string, unknown> | null,
  required = true,
  extraColumns: Array<Record<string, unknown>> = [],
): string {
  return JSON.stringify([
    { key: 'title', label: '标题', columnType: 'VARCHAR', length: 64, required },
    picker === null
      ? { key: 'owner', label: '负责人', columnType: 'VARCHAR', length: 64 }
      : {
          key: 'owner',
          label: '负责人',
          columnType: 'VARCHAR',
          length: 64,
          pickerConfig: JSON.stringify(picker),
        },
    { key: 'owner_text', label: '负责人（显示）', columnType: 'VARCHAR', length: 255 },
    ...extraColumns,
  ])
}

interface Harness {
  support: BizDataSupport
  writes: Array<{ sql: string; params: unknown[] }>
  subDeletes: string[]
  pickerQueries: string[]
}

function harness(options: {
  picker?: Record<string, unknown> | null
  required?: boolean
  affected?: number
  rowExists?: boolean
  pickerRows?: Array<Record<string, unknown>>
  mainRow?: Record<string, unknown> | null
  extraColumns?: Array<Record<string, unknown>>
}): Harness {
  const writes: Array<{ sql: string; params: unknown[] }> = []
  const subDeletes: string[] = []
  const pickerQueries: string[] = []

  const config = columnConfig(
    options.picker === undefined ? { pickerType: 'dataPicker', sourceFormKey: 'person', displayField: 'name' } : options.picker,
    options.required ?? true,
    options.extraColumns ?? [],
  )

  const repository = {
    tableExists: async () => true,
    // 用编译后的 SQL 区分两种 selectRows 调用方，而不是靠调用顺序 ——
    // 顺序会在"picker 为空时不查文本"这类分支上错位。
    selectRows: async (fragment: never) => {
      const { sql } = compile(fragment)
      if (sql.includes(' IN (')) {
        pickerQueries.push(sql)
        return options.pickerRows ?? []
      }
      const row = options.mainRow === undefined
        ? {
            id: 'row-1',
            tenant_id: 'default',
            version: 1,
            title: 'T',
            owner: '["u1","u2"]',
            owner_text: '["张三","李四"]',
            created_at: null,
            updated_at: null,
          }
        : options.mainRow
      return row === null ? [] : [row]
    },
    executeWrite: async (fragment: never) => {
      writes.push(compile(fragment))
      return options.affected ?? 1
    },
    rowExists: async () => options.rowExists ?? false,
    deleteSubRows: async (tableName: string) => {
      subDeletes.push(tableName)
    },
  }

  const formDefRepository = {
    findLatestPublishedByKey: async () => ({
      key: FORM_KEY,
      type: 'BUSINESS',
      column_config: config,
    }),
  }

  return {
    // 写路径用不到 SqlQueryEngine（只有 config/sql 查询模式用），传一个空壳即可
    support: new BizDataSupport(
      repository as never,
      formDefRepository as never,
      {} as never,
    ),
    writes,
    subDeletes,
    pickerQueries,
  }
}

function messageOf(fn: () => Promise<unknown>): Promise<string> {
  return fn().then(
    () => {
      throw new Error('预期抛错，但没有抛')
    },
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  )
}

const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runWithTenant('default', fn)

describe('BizDataSupport 写路径 / data-picker 文本生成', () => {
  it('createGeneric 把 id/tenant_id/version 打头、并附加 <key>_text', async () => {
    const h = harness({
      pickerRows: [
        { id: 'u1', name: '张三' },
        { id: 'u2', name: '李四' },
      ],
    })
    const vo = await inTenant(() => h.support.createGeneric(FORM_KEY, { title: 'T', owner: '["u1","u2"]' }))

    expect(h.writes).toHaveLength(1)
    const { sql, params } = h.writes[0]
    expect(sql).toContain(`INSERT INTO \`${TABLE}\``)
    expect(params[0]).toMatch(/^[0-9a-f]{32}$/) // 主键由 buildInsert 生成
    expect(params[1]).toBe('default')
    expect(params[2]).toBe(1)
    // owner_text 的值是与 id 顺序一致的 JSON 数组字符串
    expect(params).toContain('["张三","李四"]')
    expect(vo.id).toBe('row-1')
  })

  it('引用值不是 JSON 数组 → 400（写库里之前就拦下）', async () => {
    const h = harness({})
    expect(
      await messageOf(() => inTenant(() => h.support.createGeneric(FORM_KEY, { title: 'T', owner: 'u1' }))),
    ).toBe('data-picker 引用值格式非法（需 JSON 数组）: owner')
    expect(h.writes).toEqual([])
  })

  it('引用的记录不存在 → 400，消息带「列 key=引用 id」', async () => {
    const h = harness({ pickerRows: [{ id: 'u1', name: '张三' }] })
    expect(
      await messageOf(() =>
        inTenant(() => h.support.createGeneric(FORM_KEY, { title: 'T', owner: '["u1","u9"]' })),
      ),
    ).toBe('引用的数据不存在: owner=u9')
    expect(h.writes).toEqual([])
  })

  it('超过 maxCount → 400', async () => {
    const h = harness({
      picker: { pickerType: 'dataPicker', sourceFormKey: 'person', displayField: 'name', maxCount: 2 },
      pickerRows: [
        { id: 'u1', name: '张三' },
        { id: 'u2', name: '李四' },
        { id: 'u3', name: '王五' },
      ],
    })
    expect(
      await messageOf(() =>
        inTenant(() => h.support.createGeneric(FORM_KEY, { title: 'T', owner: '["u1","u2","u3"]' })),
      ),
    ).toBe('data-picker 引用数量超出限制（最多 2）: owner')
    expect(h.writes).toEqual([])
  })

  it('maxCount 配成非数字 → 400（配置坏了，不是静默忽略）', async () => {
    const h = harness({
      picker: { pickerType: 'dataPicker', sourceFormKey: 'person', displayField: 'name', maxCount: 'two' },
    })
    expect(
      await messageOf(() => inTenant(() => h.support.createGeneric(FORM_KEY, { title: 'T', owner: '["u1"]' }))),
    ).toBe('data-picker maxCount 配置非法: owner')
  })

  it.each([['[]'], [''], [null]])('引用为空（%s）→ 不查显示文本，<key>_text 写空串', async (owner) => {
    const h = harness({})
    await inTenant(() => h.support.createGeneric(FORM_KEY, { title: 'T', owner }))
    expect(h.pickerQueries).toEqual([])
    expect(h.writes[0].params).toContain('')
  })

  it('引用值是 JSON 字符串而不是数组（`"\\"\\""`）→ 400，不是"空引用"', async () => {
    // Java 只把「null / 空白」当空；`""` 两个引号是有内容的，走 JSON 解析后不是数组 ⇒ 400。
    const h = harness({})
    expect(
      await messageOf(() => inTenant(() => h.support.createGeneric(FORM_KEY, { title: 'T', owner: '""' }))),
    ).toBe('data-picker 引用值格式非法（需 JSON 数组）: owner')
  })

  it('lookupPicker 列整列跳过：既不查文本也不生成 <key>_text', async () => {
    const h = harness({
      picker: { pickerType: 'lookupPicker', sourceFormKey: 'person', displayField: 'name' },
    })
    await inTenant(() => h.support.createGeneric(FORM_KEY, { title: 'T', owner: '["u1"]' }))
    expect(h.pickerQueries).toEqual([])
    // 没有 owner_text 列被赋值 → INSERT 里只有 title/owner 两个业务列
    const insert = h.writes[0].sql
    expect(insert).toContain('`owner`')
    expect(insert).not.toContain('`owner_text`')
  })

  it('无 pickerType 的旧配置：有 <key>_text 列才算 data-picker（照旧生成文本）', async () => {
    const h = harness({
      picker: { sourceFormKey: 'person', displayField: 'name' },
      pickerRows: [{ id: 'u1', name: '张三' }],
    })
    await inTenant(() => h.support.createGeneric(FORM_KEY, { title: 'T', owner: '["u1"]' }))
    expect(h.pickerQueries).toHaveLength(1)
    expect(h.writes[0].params).toContain('["张三"]')
  })
})

describe('BizDataSupport 写路径 / JSON 列裸字符串归一（json_valid CHECK 兼底）', () => {
  /** 场景背景：select 单选列被设计器映射为 JSON 列（longtext CHECK (json_valid(...))），
   *  裸字符串值（'annual'）入库即撞 CHECK —— 报 `CONSTRAINT <表>.<列> failed`。
   *  写路径必须把非法 JSON 文本包成 JSON 字符串文档，读侧 deserializeJsonValue parse 回原值。 */
  const jsonCol = { key: 'leave_type', label: '请假类型', columnType: 'JSON', required: false }
  const jsonHarness = (): Harness => harness({ picker: null, extraColumns: [jsonCol] })

  it('create：单选裸字符串 → 包成 JSON 字符串文档', async () => {
    const h = jsonHarness()
    await inTenant(() => h.support.createGeneric(FORM_KEY, { title: 'T', leave_type: 'annual' }))
    expect(h.writes[0].params).toContain('"annual"')
  })

  it('create：合法 JSON 文本（数组/数字/布尔字面量）原样保留', async () => {
    const h = jsonHarness()
    await inTenant(() => h.support.createGeneric(FORM_KEY, { title: 'T', leave_type: '["a","b"]' }))
    expect(h.writes[0].params).toContain('["a","b"]')

    const h2 = jsonHarness()
    await inTenant(() => h2.support.createGeneric(FORM_KEY, { title: 'T', leave_type: '42' }))
    expect(h2.writes[0].params).toContain('42')
  })

  it('create：数组/对象值仍走 stringify（既有行为不变）', async () => {
    const h = jsonHarness()
    await inTenant(() => h.support.createGeneric(FORM_KEY, { title: 'T', leave_type: ['a', 'b'] }))
    expect(h.writes[0].params).toContain('["a","b"]')
  })

  it('create：空白字符串 → null（可空 JSON 列存 NULL，不再存空串）', async () => {
    const h = jsonHarness()
    await inTenant(() => h.support.createGeneric(FORM_KEY, { title: 'T', leave_type: '  ' }))
    expect(h.writes[0].params).toContain(null)
  })

  it('update：裸字符串同样归一', async () => {
    const h = jsonHarness()
    await inTenant(() => h.support.updateGeneric(FORM_KEY, 'row-1', { title: 'T2', leave_type: 'sick' }, null))
    expect(h.writes[0].params).toContain('"sick"')
  })

  it('非 JSON 列的字符串不受影响（旧格式容错语义保持）', async () => {
    const h = jsonHarness()
    await inTenant(() => h.support.createGeneric(FORM_KEY, { title: 'annual' }))
    expect(h.writes[0].params).toContain('annual')
  })
})

describe('BizDataSupport 写路径 / 乐观锁与删除', () => {
  it('version 为 null 时按 1 处理（SQL 里绑定的是 1，不是 null）', async () => {
    const h = harness({ picker: null })
    await inTenant(() => h.support.updateGeneric(FORM_KEY, 'row-1', { title: 'T2' }, null))
    expect(h.writes[0].sql).toContain('version = version + 1')
    expect(h.writes[0].sql).toContain('version = ?')
    expect(h.writes[0].params).toContain(1)
  })

  it('受影响 0 行：记录在 → 409，记录不在 → 404', async () => {
    const conflict = harness({ picker: null, affected: 0, rowExists: true })
    expect(
      await messageOf(() => inTenant(() => conflict.support.updateGeneric(FORM_KEY, 'row-1', { title: 'T2' }, 3))),
    ).toBe('数据已被他人修改，请刷新后重试')

    const gone = harness({ picker: null, affected: 0, rowExists: false })
    expect(
      await messageOf(() => inTenant(() => gone.support.updateGeneric(FORM_KEY, 'row-9', { title: 'T2' }, 3))),
    ).toBe('业务数据不存在: row-9')
  })

  it('更新体里没有可写列 → IllegalArgumentException 形态（不是 BusinessException）', async () => {
    const h = harness({ picker: null, required: false })
    const error = await inTenant(() =>
      h.support.updateGeneric(FORM_KEY, 'row-1', { id: 'x', version: 9 }, 1).catch((e: unknown) => e),
    )
    expect((error as Error).message).toBe('更新内容不能为空')
    // 契约里这条走 HTTP 400，靠的是 name 而不是 BusinessException
    expect((error as Error).name).toBe('IllegalArgumentException')
  })

  it('deleteGeneric 先清子表行、再删主表；主表 0 行 → 404', async () => {
    const ok = harness({ picker: null })
    await inTenant(() => ok.support.deleteGeneric(FORM_KEY, 'row-1'))
    expect(ok.writes[0].sql).toContain(`DELETE FROM \`${TABLE}\``)

    const gone = harness({ picker: null, affected: 0 })
    expect(await messageOf(() => inTenant(() => gone.support.deleteGeneric(FORM_KEY, 'row-9')))).toBe(
      '业务数据不存在: row-9',
    )
  })
})
