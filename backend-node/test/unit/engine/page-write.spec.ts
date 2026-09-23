import { describe, expect, it } from 'vitest'
import { PageValidator } from '../../../src/engine/page/page-validator'
import { schemaEquals } from '../../../src/engine/page/service/page-definition.service'
import { whitelistFilter } from '../../../src/engine/page/controller/page-definition.controller'
import type { PageDefinitionRow } from '../../../src/engine/page/repository/page-definition.repository'
import { runWithTenant } from '../../../src/framework/tenant/tenant-context'

/**
 * 页面模块写路径的单测。
 *
 * 契约场景「页面定义写路径与菜单挂接」（27 步）覆盖了主干与每类错误各一条；
 * 这里补的是**校验器里其余的分支** —— `PageValidator` 有 14 处 `BusinessException`，
 * golden 只碰到了 3 处。漏一条的后果是"非法 schema 被存进库"，
 * 而它要到渲染或取数时才炸，那时已经很难定位来源。
 *
 * 另外两个纯函数（`schemaEquals` / `whitelistFilter`）的边界也只能在这里跑：
 * 前者的"剔除编译产物 + 忽略键顺序"、后者的两种 filter 格式。
 */

const COLUMNS = JSON.stringify([
  { key: 'code', label: '编码', columnType: 'VARCHAR', length: 64, required: true },
  { key: 'name', label: '名称', columnType: 'VARCHAR', length: 64 },
  { key: 'dept', label: '部门', columnType: 'JSON', hidden: true },
  { key: 'remark', label: '备注', columnType: 'TEXT' },
  { key: 'custom1', label: '自定义列', columnType: 'VARCHAR', length: 32, hidden: true },
])

function page(partial: Partial<PageDefinitionRow>): PageDefinitionRow {
  return {
    id: 'p1',
    tenant_id: 'default',
    name: '页面',
    key: 'p_key',
    type: 'VIEW',
    form_key: null,
    data_source_id: null,
    schema: null,
    version: 1,
    status: 'DRAFT',
    published_version: null,
    created_by: null,
    created_at: null,
    updated_at: null,
    ...partial,
  }
}

function validatorWith(options: {
  /** 数据源 metadata 是否可用（false → 模拟 `metadata` 抛 400/404）。 */
  dataSourceAvailable?: boolean
  boundFormType?: string
  boundFormConfig?: string | null
  enabledForms?: Array<{ id: string; type: string; formKey: string | null }>
  boundFormPublished?: boolean
} = {}) {
  const columns = JSON.parse(COLUMNS) as unknown[]
  const dataSourceService = {
    metadata: async () => {
      if (options.dataSourceAvailable === false) {
        throw new Error('数据源不存在或未启用')
      }
      return { columns, writable: true, formKey: 'person' }
    },
    getEnabled: async () => options.enabledForms ?? [],
  }
  const formDefRepository = {
    findLatestPublishedByKey: async () =>
      options.boundFormPublished === false
        ? null
        : {
            key: 'person',
            type: options.boundFormType ?? 'BUSINESS',
            column_config: options.boundFormConfig === undefined ? COLUMNS : options.boundFormConfig,
          },
  }
  return new PageValidator(formDefRepository as never, dataSourceService as never)
}

/** 断言抛出的消息（校验器是 async —— 同步 try/catch 接不住）。 */
async function messageOf(fn: () => unknown): Promise<string> {
  try {
    await fn()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error('预期抛错，但没有抛')
}

const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runWithTenant('default', fn)

describe('PageValidator / VIEW 分支', () => {
  it('既无 dataSourceId 也无 formKey → 400「请选择数据源」', async () => {
    const validator = validatorWith()
    expect(
      await messageOf(() => inTenant(() => validator.validateForPublish(page({ type: 'VIEW' })))),
    ).toBe('请选择数据源')
  })

  it('searchFields 引用不存在的列 / 隐藏列 / 大字段列 → 三种不同消息', async () => {
    const validator = validatorWith()
    const withSchema = (key: string) =>
      page({ data_source_id: 'ds1', schema: JSON.stringify({ searchFields: [{ key }] }) })
    expect(await messageOf(() => inTenant(() => validator.validateForPublish(withSchema('nope'))))).toBe(
      '查询字段引用列不存在: nope',
    )
    expect(await messageOf(() => inTenant(() => validator.validateForPublish(withSchema('dept'))))).toBe(
      '查询字段不能引用隐藏列: dept',
    )
    // remark 是 TEXT：既不是隐藏列也不是非法列，只有"大字段"这一条能拦下它
    expect(await messageOf(() => inTenant(() => validator.validateForPublish(withSchema('remark'))))).toBe(
      '查询字段不能引用大字段列（JSON/TEXT）: remark',
    )
    // JSON 列同理（dept 是 hidden=true，所以上面先撞隐藏列那条）
    expect(await messageOf(() => inTenant(() => validator.validateForPublish(withSchema('dept'))))).toBe(
      '查询字段不能引用隐藏列: dept',
    )
  })

  it('columns 引用不存在的列 / 隐藏列 → 400；custom=true 跳过数据源字段校验', async () => {
    const validator = validatorWith()
    const withColumns = (entry: Record<string, unknown>) =>
      page({ data_source_id: 'ds1', schema: JSON.stringify({ columns: [entry] }) })
    expect(
      await messageOf(() => inTenant(() => validator.validateForPublish(withColumns({ key: 'nope' })))),
    ).toBe('展示列引用列不存在: nope')
    expect(
      await messageOf(() => inTenant(() => validator.validateForPublish(withColumns({ key: 'dept' })))),
    ).toBe('展示列不能引用隐藏列: dept')
    // custom=true 跳过"存在性"校验，但**隐藏列那条仍然生效**
    await expect(
      inTenant(() => validator.validateForPublish(withColumns({ key: 'free', custom: true }))),
    ).resolves.toBeUndefined()
    expect(
      await messageOf(() =>
        inTenant(() => validator.validateForPublish(withColumns({ key: 'custom1', custom: true }))),
      ),
    ).toBe('展示列不能引用隐藏列: custom1')
  })

  it('formKey 兜底：未发布 / 非 BUSINESS / 无 column_config 三种错误', async () => {
    const unpublished = validatorWith({ boundFormPublished: false })
    expect(
      await messageOf(() =>
        inTenant(() => unpublished.validateForPublish(page({ form_key: 'person' }))),
      ),
    ).toBe('绑定表单不存在或未发布: person')

    const workflowForm = validatorWith({ boundFormType: 'WORKFLOW' })
    expect(
      await messageOf(() =>
        inTenant(() => workflowForm.validateForPublish(page({ form_key: 'person' }))),
      ),
    ).toBe('绑定表单 person 不是业务表单')

    const emptyConfig = validatorWith({ boundFormConfig: null })
    expect(
      await messageOf(() =>
        inTenant(() => emptyConfig.validateForPublish(page({ form_key: 'person' }))),
      ),
    ).toBe('绑定表单未配置列映射（column_config）')
  })

  it('schema 非法 JSON → 400「页面 schema 解析失败」', async () => {
    const validator = validatorWith()
    expect(
      await messageOf(() =>
        inTenant(() =>
          validator.validateForPublish(page({ data_source_id: 'ds1', schema: '{oops' })),
        ),
      ),
    ).toBe('页面 schema 解析失败')
  })

  it('dataSourceId 优先于 formKey（有 dataSourceId 时完全不看表单）', async () => {
    // 表单发布状态设为 false：若走了 formKey 兜底就会炸，走通了就说明走的是数据源
    const validator = validatorWith({ boundFormPublished: false })
    await expect(
      inTenant(() =>
        validator.validateForPublish(
          page({
            data_source_id: 'ds1',
            form_key: 'person',
            schema: JSON.stringify({ searchFields: [{ key: 'code' }] }),
          }),
        ),
      ),
    ).resolves.toBeUndefined()
  })
})

describe('PageValidator / PAGE 分支', () => {
  const enabledForm = [{ id: 'ds-person', type: 'FORM', formKey: 'person' }]

  it('rule 不是数组 → 400（含 schema 为 null / 裸对象 / 数组包装三种入口）', async () => {
    const validator = validatorWith({ enabledForms: enabledForm })
    for (const schema of [null, '{"dataSources":[]}', '{}']) {
      expect(
        await messageOf(() =>
          inTenant(() => validator.validateForPublish(page({ type: 'PAGE', schema }))),
        ),
      ).toBe('自定义页面 schema 必须为 {rule, option, dataSources, actions}')
    }
    // 裸数组会被包装成 {rule:[...]} ⇒ 通过
    await expect(
      inTenant(() => validator.validateForPublish(page({ type: 'PAGE', schema: '[]' }))),
    ).resolves.toBeUndefined()
  })

  it('dataSources：id 为空 / id 重复 / refId 为空 → 三种消息', async () => {
    const validator = validatorWith({ enabledForms: enabledForm })
    const withDs = (dataSources: unknown[]) =>
      page({ type: 'PAGE', schema: JSON.stringify({ rule: [], dataSources }) })
    expect(
      await messageOf(() =>
        inTenant(() => validator.validateForPublish(withDs([{ id: ' ', refId: 'x' }]))),
      ),
    ).toBe('自定义页面 dataSources 条目 id 不能为空')
    expect(
      await messageOf(() =>
        inTenant(() =>
          validator.validateForPublish(
            withDs([
              { id: 'a', refId: 'ds-person' },
              { id: 'a', refId: 'ds-person' },
            ]),
          ),
        ),
      ),
    ).toBe('自定义页面 dataSources id 重复: a')
    expect(
      await messageOf(() =>
        inTenant(() => validator.validateForPublish(withDs([{ id: 'a', refId: '' }]))),
      ),
    ).toBe('自定义页面 dataSources[a] refId 不能为空')
  })

  it('refId 指向未启用/不存在的数据源 → 400', async () => {
    const validator = validatorWith({ enabledForms: enabledForm })
    expect(
      await messageOf(() =>
        inTenant(() =>
          validator.validateForPublish(
            page({
              type: 'PAGE',
              schema: JSON.stringify({ rule: [], dataSources: [{ id: 'a', refId: 'nope' }] }),
            }),
          ),
        ),
      ),
    ).toBe('自定义页面引用的数据源不存在或未启用: nope')
  })

  it('FORM 数据源：绑定表单未发布 / searchFields 引用列不存在', async () => {
    const unpublished = validatorWith({ enabledForms: enabledForm, boundFormPublished: false })
    expect(
      await messageOf(() =>
        inTenant(() =>
          unpublished.validateForPublish(
            page({
              type: 'PAGE',
              schema: JSON.stringify({ rule: [], dataSources: [{ id: 'a', refId: 'ds-person' }] }),
            }),
          ),
        ),
      ),
    ).toBe('自定义页面引用的表单未发布: person')

    const validator = validatorWith({ enabledForms: enabledForm })
    expect(
      await messageOf(() =>
        inTenant(() =>
          validator.validateForPublish(
            page({
              type: 'PAGE',
              schema: JSON.stringify({
                rule: [],
                dataSources: [{ id: 'a', refId: 'ds-person', searchFields: ['code', 'nope'] }],
              }),
            }),
          ),
        ),
      ),
    ).toBe('数据源 searchFields 引用列不存在: nope')
  })

  it('rule 中数据组件 dataSourceId 必须已声明（非数据组件不管）', async () => {
    const validator = validatorWith({ enabledForms: enabledForm })
    const withRule = (rule: unknown[]) =>
      page({ type: 'PAGE', schema: JSON.stringify({ rule, dataSources: [{ id: 'a', refId: 'ds-person' }] }) })
    expect(
      await messageOf(() =>
        inTenant(() =>
          validator.validateForPublish(
            withRule([{ type: 'page-table', props: { dataSourceId: 'ghost' } }]),
          ),
        ),
      ),
    ).toBe('数据组件 dataSourceId 未在 dataSources 声明: ghost')
    // 普通组件带 dataSourceId 不校验
    await expect(
      inTenant(() =>
        validator.validateForPublish(withRule([{ type: 'input', props: { dataSourceId: 'ghost' } }])),
      ),
    ).resolves.toBeUndefined()
  })

  it('actions set-filter：目标未声明 / 字段不在白名单 / 白名单为空则不限制', async () => {
    const validator = validatorWith({ enabledForms: enabledForm })
    const withActions = (actions: unknown[], searchFields?: string[]) =>
      page({
        type: 'PAGE',
        schema: JSON.stringify({
          rule: [],
          dataSources: [
            searchFields === undefined
              ? { id: 'a', refId: 'ds-person' }
              : { id: 'a', refId: 'ds-person', searchFields },
          ],
          actions,
        }),
      })
    const step = (target: string, field: string) => [
      { steps: [{ op: 'set-filter', target, field }] },
    ]
    expect(
      await messageOf(() =>
        inTenant(() => validator.validateForPublish(withActions(step('ghost', 'code'), ['code']))),
      ),
    ).toBe('set-filter 目标数据源未声明: ghost')
    expect(
      await messageOf(() =>
        inTenant(() => validator.validateForPublish(withActions(step('a', 'name'), ['code']))),
      ),
    ).toBe('set-filter 字段未在数据源 searchFields 白名单: name')
    // 目标声明了 searchFields，且命中 → 放行
    await expect(
      inTenant(() => validator.validateForPublish(withActions(step('a', 'code'), ['code']))),
    ).resolves.toBeUndefined()
    // 目标**没有**声明 searchFields（空数组）→ 不限制，任意字段放行
    await expect(
      inTenant(() => validator.validateForPublish(withActions(step('a', 'whatever'), []))),
    ).resolves.toBeUndefined()
    // 非 set-filter 的步骤完全不看
    await expect(
      inTenant(() =>
        validator.validateForPublish(withActions([{ steps: [{ op: 'refresh', target: 'ghost' }] }], ['code'])),
      ),
    ).resolves.toBeUndefined()
  })
})

describe('schemaEquals', () => {
  it('忽略对象键顺序', () => {
    expect(schemaEquals('{"a":1,"b":2}', '{"b":2,"a":1}')).toBe(true)
  })

  it('剔除顶层 rule / option（编译产物）', () => {
    expect(schemaEquals('{"a":1}', '{"a":1,"rule":[{"x":1}],"option":{"y":2}}')).toBe(true)
    // 但 rule 的**差异**也被剔除了 —— 这是刻意的（编译产物不算"内容变化"）
    expect(schemaEquals('{"a":1,"rule":[1]}', '{"a":1,"rule":[2]}')).toBe(true)
  })

  it('数组顺序敏感、其他字段差异即不相等', () => {
    expect(schemaEquals('{"a":[1,2]}', '{"a":[2,1]}')).toBe(false)
    expect(schemaEquals('{"a":1}', '{"a":2}')).toBe(false)
    expect(schemaEquals('{"a":1}', '{"a":1,"b":2}')).toBe(false)
  })

  it('null / 空白视为 {}；非法 JSON → false（不抛错）', () => {
    expect(schemaEquals(null, '{}')).toBe(true)
    expect(schemaEquals('   ', '{}')).toBe(true)
    expect(schemaEquals('{oops', '{}')).toBe(false)
  })
})

describe('whitelistFilter', () => {
  it('空 filter → null；白名单为空 → 原样返回（= 不限制）', () => {
    expect(whitelistFilter(null, new Set(['code']))).toBeNull()
    expect(whitelistFilter('   ', new Set(['code']))).toBeNull()
    expect(whitelistFilter('{"a":1}', new Set())).toBe('{"a":1}')
  })

  it('扁平格式：命中放行、未命中 400；空对象 → null', () => {
    expect(whitelistFilter('{"code":"1"}', new Set(['code']))).toBe('{"code":"1"}')
    expect(() => whitelistFilter('{"nope":"1"}', new Set(['code']))).toThrow(
      '筛选字段不在页面声明白名单: nope',
    )
    expect(whitelistFilter('{}', new Set(['code']))).toBeNull()
  })

  it('结构化格式（conditions）：按 column 校验', () => {
    const whitelist = new Set(['code'])
    expect(
      whitelistFilter('{"logic":"AND","conditions":[{"column":"code","op":"eq","value":"1"}]}', whitelist),
    ).toContain('conditions')
    expect(() =>
      whitelistFilter('{"logic":"AND","conditions":[{"column":"nope"}]}', whitelist),
    ).toThrow('筛选字段不在页面声明白名单: nope')
  })

  it('非法 JSON / 非对象 → 400「格式非法」（与"不在白名单"是两条不同消息）', () => {
    expect(() => whitelistFilter('{oops', new Set(['code']))).toThrow(
      '筛选参数 filter 格式非法，应为 JSON 对象',
    )
    expect(() => whitelistFilter('[1,2]', new Set(['code']))).toThrow(
      '筛选参数 filter 格式非法，应为 JSON 对象',
    )
  })
})
