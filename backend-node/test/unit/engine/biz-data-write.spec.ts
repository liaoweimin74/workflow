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
  /** dataSourceId 模式：findByIdAccessible 返回的数据源行（默认 null = 源不存在） */
  dsRow?: { id: string; type: string; source_key: string | null } | null
  /** user-tree 源用户（第 1 页返回） */
  systemUsers?: Array<{ id: number; username: string; nickname: string | null; orgId: number | null; orgName: string | null; status: number }>
  /** dept-tree 源组织树 */
  orgTreeNodes?: Array<Record<string, unknown>>
  /** 其余内建源（sys-posts 等）的行 */
  sourceRows?: Array<Record<string, unknown>>
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

  const systemService = {
    listUsersByUsername: async (_kw: unknown, page: number, _size: number) => ({
      rows: page === 1 ? (options.systemUsers ?? []) : [],
      total: (options.systemUsers ?? []).length,
      page,
      size: 500,
    }),
    orgTree: async () => options.orgTreeNodes ?? [],
  }
  const systemSourceQuery = {
    query: async (_key: string, req: { page: number }) => ({
      records: req.page === 1 ? (options.sourceRows ?? []) : [],
      total: (options.sourceRows ?? []).length,
    }),
  }
  const dataSources = {
    findByIdAccessible: async () => options.dsRow ?? null,
  }

  return {
    // 写路径用不到 SqlQueryEngine（只有 config/sql 查询模式用），传一个空壳即可
    support: new BizDataSupport(
      repository as never,
      formDefRepository as never,
      {} as never,
      systemService as never,
      systemSourceQuery as never,
      dataSources as never,
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

describe('BizDataSupport 写路径 / data-picker dataSourceId 模式（数据源引用）', () => {
  const dsPicker = { pickerType: 'dataPicker', dataSourceId: 'ds-builtin-user-tree', displayField: 'nickname' }
  const dsRow = { id: 'ds-builtin-user-tree', type: 'SYSTEM', source_key: 'user-tree' }

  it('user-tree 源：create 生成 <key>_text（昵称文本数组，顺序与 id 一致）', async () => {
    const h = harness({
      picker: dsPicker,
      dsRow,
      systemUsers: [
        { id: 1, username: 'admin', nickname: '管理员', orgId: null, orgName: '', status: 1 },
        { id: 2, username: 'zhangsan', nickname: '张三', orgId: null, orgName: '', status: 1 },
      ],
    })
    const vo = await inTenant(() => h.support.createGeneric(FORM_KEY, { title: 'T', owner: '["1","2"]' }))
    expect(h.writes[0].params).toContain('["管理员","张三"]')
    expect(vo.id).toBe('row-1')
  })

  it('sys-posts 源（SystemSourceQueryService）：按岗位名生成文本', async () => {
    const h = harness({
      picker: { pickerType: 'dataPicker', dataSourceId: 'ds-builtin-sys-posts', displayField: 'postName' },
      dsRow: { id: 'ds-builtin-sys-posts', type: 'SYSTEM', source_key: 'sys-posts' },
      sourceRows: [{ id: '5', data: { postName: '研发工程师' } }],
    })
    await inTenant(() => h.support.createGeneric(FORM_KEY, { title: 'T', owner: '["5"]' }))
    expect(h.writes[0].params).toContain('["研发工程师"]')
  })

  it('dept-tree 源：orgTree 扁平化后按 label 生成文本', async () => {
    const h = harness({
      picker: { pickerType: 'dataPicker', dataSourceId: 'ds-builtin-dept-tree', displayField: 'label' },
      dsRow: { id: 'ds-builtin-dept-tree', type: 'SYSTEM', source_key: 'dept-tree' },
      orgTreeNodes: [
        { id: 1, parentId: null, label: '总公司', code: 'root', children: [
          { id: 2, parentId: 1, label: '研发部', code: 'rd', children: [] },
        ] },
      ],
    })
    await inTenant(() => h.support.createGeneric(FORM_KEY, { title: 'T', owner: '["2"]' }))
    expect(h.writes[0].params).toContain('["研发部"]')
  })

  it('数据源不存在 → 400', async () => {
    const h = harness({ picker: dsPicker, dsRow: null })
    expect(
      await messageOf(() => inTenant(() => h.support.createGeneric(FORM_KEY, { title: 'T', owner: '["1"]' }))),
    ).toBe('数据引用的数据源不存在: ds-builtin-user-tree')
  })

  it('引用的源数据不存在 → 400（消息对齐 sourceFormKey 模式）', async () => {
    const h = harness({
      picker: dsPicker,
      dsRow,
      systemUsers: [{ id: 1, username: 'admin', nickname: '管理员', orgId: null, orgName: '', status: 1 }],
    })
    expect(
      await messageOf(() => inTenant(() => h.support.createGeneric(FORM_KEY, { title: 'T', owner: '["9"]' }))),
    ).toBe('引用的数据不存在: 9')
  })

  it('非 SYSTEM 数据源 → 400 暂不支持', async () => {
    const h = harness({ picker: dsPicker, dsRow: { id: 'ds-1', type: 'FORM', source_key: 'ds-1' } })
    expect(
      await messageOf(() => inTenant(() => h.support.createGeneric(FORM_KEY, { title: 'T', owner: '["1"]' }))),
    ).toBe('数据引用暂不支持该数据源类型: ds-builtin-user-tree')
  })

  it('sourceFormKey 与 dataSourceId 都缺 → 400（保持原行为）', async () => {
    const h = harness({ picker: { pickerType: 'dataPicker', displayField: 'nickname' } })
    expect(
      await messageOf(() => inTenant(() => h.support.createGeneric(FORM_KEY, { title: 'T', owner: '["1"]' }))),
    ).toBe('非法目标表单 key: ')
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

describe('BizDataSupport 写路径 / DATE / DATETIME 列归一（Incorrect date value 兼底）', () => {
  /** 场景背景：form-create datePicker 未配置 value-format 时提交带时区 ISO 字符串
   *  （`2026-09-24T16:00:00.000Z` = 东八 2026-09-25 00:00），MariaDB `date` 列直接报
   *  `Incorrect date value`。写路径必须按业务时区（Asia/Shanghai）归一后再绑定。 */
  const dateCols = [
    { key: 'leave_start_date', label: '开始日期', columnType: 'DATE', required: false },
    { key: 'leave_end_date', label: '结束日期', columnType: 'DATE', required: false },
    { key: 'approved_at', label: '批准时间', columnType: 'DATETIME', required: false },
  ]
  const dateHarness = (): Harness => harness({ picker: null, extraColumns: dateCols })

  it('create：带时区 ISO → 按东八取日期（用户所见日期，不偏移）', async () => {
    const h = dateHarness()
    await inTenant(() =>
      h.support.createGeneric(FORM_KEY, {
        title: 'T',
        leave_start_date: '2026-09-24T16:00:00.000Z',
      }),
    )
    expect(h.writes[0].params).toContain('2026-09-25')
  })

  it('create：纯日期原样（本地语义，无时区偏移问题）', async () => {
    const h = dateHarness()
    await inTenant(() =>
      h.support.createGeneric(FORM_KEY, { title: 'T', leave_start_date: '2026-09-25' }),
    )
    expect(h.writes[0].params).toContain('2026-09-25')
  })

  it('update：ISO 同样归一（编辑保存场景）', async () => {
    const h = dateHarness()
    await inTenant(() =>
      h.support.updateGeneric(FORM_KEY, 'row-1', { title: 'T2', leave_end_date: '2026-09-29T16:00:00.000Z' }, null),
    )
    expect(h.writes[0].params).toContain('2026-09-30')
  })

  it('DATETIME：纯日期补零点、ISO 按东八取完整时刻', async () => {
    const h = dateHarness()
    await inTenant(() =>
      h.support.createGeneric(FORM_KEY, {
        title: 'T',
        approved_at: '2026-09-25',
      }),
    )
    expect(h.writes[0].params).toContain('2026-09-25 00:00:00')

    const h2 = dateHarness()
    await inTenant(() =>
      h2.support.createGeneric(FORM_KEY, {
        title: 'T',
        approved_at: '2026-09-24T16:30:45.000Z',
      }),
    )
    expect(h2.writes[0].params).toContain('2026-09-25 00:30:45')
  })

  it('非日期列与不可解析值不受影响（兜底交给 DB 校验）', async () => {
    const h = dateHarness()
    await inTenant(() =>
      h.support.createGeneric(FORM_KEY, { title: 'not-a-date', leave_start_date: 'blah' }),
    )
    expect(h.writes[0].params).toContain('not-a-date')
    expect(h.writes[0].params).toContain('blah')
  })
})
