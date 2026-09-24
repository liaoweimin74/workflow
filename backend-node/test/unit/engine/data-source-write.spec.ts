import { describe, expect, it } from 'vitest'
import {
  DataSourceWriteService,
  generateParams,
  hasFormQueryDraft,
  hasQueryModeSegment,
  mergeQueryConfig,
  schemaRefsDataSource,
} from '../../../src/engine/datasource/service/data-source-write.service'
import type { DataSourceRow } from '../../../src/engine/datasource/repository/data-source.repository'
import { runWithTenant } from '../../../src/framework/tenant/tenant-context'

/**
 * 数据源写路径的单测。
 *
 * golden（场景「数据源写操作」）只覆盖了 **SQL 类型**这一条主干 —— FORM/WORKFLOW/SYSTEM/API
 * 四条分支、以及所有校验失败的错误消息都够不到。这里逐条锁住，并且**锚定 Java 源码**
 * （`DataSourceDefinitionService` 第 87–252 行）里各校验的**先后顺序**：
 * 顺序变了，先报哪条错就变了，而错误消息是契约（HTTP 200 + body code=400）。
 */

const DS_ROW: DataSourceRow = {
  id: 'cc3693a34fb5482a8b616392572a32e9',
  tenant_id: 'default',
  name: '契约数据源',
  type: 'SQL',
  form_key: null,
  source_key: 'contract_ds_x',
  form_id: null,
  params: null,
  status: 'ENABLED',
  created_by: null,
  created_at: new Date('2026-09-16T10:00:00'),
  updated_at: new Date('2026-09-16T10:00:00'),
}

interface Harness {
  service: DataSourceWriteService
  inserted: DataSourceRow[]
  replaced: Array<{ id: string; patch: Partial<DataSourceRow> }>
  deleted: string[]
  setRow(row: DataSourceRow | null): void
  setPages(pages: Array<Record<string, unknown>>): void
  setFormExists(exists: boolean): void
  setPublishedForm(form: Record<string, unknown> | null): void
}

function harness(overrides: Partial<DataSourceRow> = {}): Harness {
  let row: DataSourceRow | null = { ...DS_ROW, ...overrides }
  let pages: Array<Record<string, unknown>> = []
  let formExists = true
  let publishedForm: Record<string, unknown> | null = { type: 'BUSINESS' }

  const inserted: DataSourceRow[] = []
  const replaced: Array<{ id: string; patch: Partial<DataSourceRow> }> = []
  const deleted: string[] = []

  const repository = {
    existsByTenantIdAndName: async () => false,
    existsByTenantIdAndSourceKey: async () => false,
    insertDefinition: async (r: DataSourceRow) => {
      inserted.push(r)
    },
    findByIdAccessible: async () => row,
    replaceDefinition: async (id: string, patch: Partial<DataSourceRow>) => {
      replaced.push({ id, patch })
      if (row !== null) row = { ...row, ...patch }
    },
    deleteDataSource: async (id: string) => {
      deleted.push(id)
    },
  }
  const formDefRepository = {
    existsByKey: async () => formExists,
    findLatestPublishedByKey: async () => publishedForm,
  }
  const pageDefRepository = {
    findPage: async (
      _tenantId: string,
      filter: { dataSourceId?: string | null; type?: string | null },
    ) => {
      // 模拟 Java：dataSourceId 列过滤命中就返回；否则返回 PAGE 类型页面供扫 schema
      if (filter.dataSourceId !== null && filter.dataSourceId !== undefined) {
        return { rows: pages.filter((p) => p.dataSourceId === filter.dataSourceId), total: 0 }
      }
      return { rows: pages, total: 0 }
    },
  }

  const service = new DataSourceWriteService(
    repository as never,
    formDefRepository as never,
    pageDefRepository as never,
  )

  return {
    service,
    inserted,
    replaced,
    deleted,
    setRow: (r) => {
      row = r
    },
    setPages: (p) => {
      pages = p
    },
    setFormExists: (e) => {
      formExists = e
    },
    setPublishedForm: (f) => {
      publishedForm = f
    },
  }
}

/** 在 default 租户作用域内跑一段逻辑（服务里所有方法都要取租户）。 */
function inTenant<T>(fn: () => Promise<T>): Promise<T> {
  return runWithTenant('default', fn)
}

/** 断言抛出的是业务异常，并核对 code 与消息（消息是契约的一部分）。 */
async function expectBusiness(fn: () => Promise<unknown>, code: number, msg: string): Promise<void> {
  await expect(fn()).rejects.toMatchObject({ code, message: msg })
}

describe('generateParams（FORM/SYSTEM 只读配置，字符串即契约）', () => {
  // ⚠️ Java 用 ObjectNode.toString() 产出**紧凑 JSON**，键顺序＝插入顺序。
  //    所以这里比对的是**逐字节**字符串，不是「解析后相等」。
  it('FORM：端点顺序为 list/create/get/update/delete，list 内含 parse/totalParse', () => {
    expect(generateParams('FORM', 'person', 'person')).toBe(
      '{"list":{"action":"/api/v1/biz-data/person","method":"GET","parse":"records","totalParse":"total"},' +
        '"create":{"action":"/api/v1/biz-data/person","method":"POST"},' +
        '"get":{"action":"/api/v1/biz-data/person/{id}","method":"GET"},' +
        '"update":{"action":"/api/v1/biz-data/person/{id}","method":"PUT"},' +
        '"delete":{"action":"/api/v1/biz-data/person/{id}","method":"DELETE"}}',
    )
  })

  it('FORM：sourceKey 与 formKey 不同时，只有 formKey 参与拼路径', () => {
    // 入参 sourceKey 被完全忽略 —— Java 里 FORM 的 sourceKey 恒等于 formKey
    expect(generateParams('FORM', 'person', 'ignored')).toContain('/api/v1/biz-data/person')
    expect(generateParams('FORM', 'person', 'ignored')).not.toContain('ignored')
  })

  it('SYSTEM：dept-tree → dept-tree 路径，仅 list 一个动作', () => {
    expect(generateParams('SYSTEM', '', 'dept-tree')).toBe(
      '{"list":{"action":"/api/v1/internal/system/dept-tree","method":"GET"}}',
    )
  })

  // 这条映射是**不对齐**的：sourceKey `user-tree` 对应的内部路径是 `users`。
  // 照直觉写 `/internal/system/user-tree` 会 404。
  it('SYSTEM：user-tree → users 路径（刻意不对齐）', () => {
    expect(generateParams('SYSTEM', '', 'user-tree')).toBe(
      '{"list":{"action":"/api/v1/internal/system/users","method":"GET"}}',
    )
  })

  it('SYSTEM：未注册的 sourceKey → 400', () => {
    expect(() => generateParams('SYSTEM', '', 'nope')).toThrowError(/未注册的系统数据源: nope/)
  })

  it('其余类型产出空对象（不生成端点）', () => {
    expect(generateParams('API', '', 'x')).toBe('{}')
    expect(generateParams('SQL', '', 'x')).toBe('{}')
  })
})

describe('hasQueryModeSegment', () => {
  it('识别含 queryMode 的 JSON 对象', () => {
    expect(hasQueryModeSegment('{"queryMode":"config","joins":[]}')).toBe(true)
  })

  it('无 queryMode 键 → false', () => {
    expect(hasQueryModeSegment('{"action":"/x"}')).toBe(false)
  })

  it('null / 空串 / 非法 JSON / 数组 / 非对象 → false（交给后续校验报错）', () => {
    expect(hasQueryModeSegment(null)).toBe(false)
    expect(hasQueryModeSegment('')).toBe(false)
    expect(hasQueryModeSegment('{')).toBe(false)
    expect(hasQueryModeSegment('[1]')).toBe(false)
    expect(hasQueryModeSegment('"queryMode"')).toBe(false)
  })
})

describe('hasFormQueryDraft（queryMode 或任一草稿段）', () => {
  it('queryMode / joins / query / columns / params 任一存在 → true', () => {
    expect(hasFormQueryDraft('{"queryMode":"config"}')).toBe(true)
    expect(hasFormQueryDraft('{"joins":[{"virtualKey":"k"}]}')).toBe(true)
    expect(hasFormQueryDraft('{"query":"SELECT 1"}')).toBe(true)
    expect(hasFormQueryDraft('{"columns":[{"key":"a"}]}')).toBe(true)
    expect(hasFormQueryDraft('{"params":["a"]}')).toBe(true)
  })

  it('双段并存（草稿+活跃段）→ true', () => {
    expect(hasFormQueryDraft('{"queryMode":"sql","joins":[]}')).toBe(true)
  })

  it('仅端点段 → false（FORM 走纯 generateParams）', () => {
    expect(hasFormQueryDraft('{"list":{"action":"/x"}}')).toBe(false)
  })

  it('null / 空串 / 非法 JSON / 数组 → false', () => {
    expect(hasFormQueryDraft(null)).toBe(false)
    expect(hasFormQueryDraft('')).toBe(false)
    expect(hasFormQueryDraft('{')).toBe(false)
    expect(hasFormQueryDraft('[1]')).toBe(false)
  })
})

describe('mergeQueryConfig', () => {
  it('保留生成端点的键顺序，追加段固定为 queryMode/joins/query/columns/params 顺序', () => {
    const merged = mergeQueryConfig(generateParams('FORM', 'person', 'person'), '{"queryMode":"config"}')
    expect(merged.startsWith('{"list":')).toBe(true)
    expect(merged).toContain('"queryMode":"config"')
    // 生成端点在前，配置段在后 —— 顺序变了字节就变了
    expect(merged.indexOf('"list"')).toBeLessThan(merged.indexOf('"queryMode"'))
  })

  it('只搬运白名单字段，忽略其他键', () => {
    const merged = mergeQueryConfig('{}', '{"queryMode":"config","bogus":1,"columns":[{"key":"a"}]}')
    expect(merged).toBe('{"queryMode":"config","columns":[{"key":"a"}]}')
  })

  it('非法 JSON → 400', () => {
    expect(() => mergeQueryConfig('{}', '{')).toThrowError(/数据源参数 params 必须是合法 JSON/)
  })
})

describe('schemaRefsDataSource', () => {
  it('命中 dataSources[].refId', () => {
    expect(schemaRefsDataSource('{"dataSources":[{"refId":"abc"}]}', 'abc')).toBe(true)
  })

  it('refId 不匹配 / 无 dataSources / 空 schema → false', () => {
    expect(schemaRefsDataSource('{"dataSources":[{"refId":"other"}]}', 'abc')).toBe(false)
    expect(schemaRefsDataSource('{"components":[]}', 'abc')).toBe(false)
    expect(schemaRefsDataSource(null, 'abc')).toBe(false)
    expect(schemaRefsDataSource('', 'abc')).toBe(false)
  })

  it('非法 JSON → false（不能因为页面 schema 坏掉就删不了数据源）', () => {
    expect(schemaRefsDataSource('{', 'abc')).toBe(false)
  })
})

describe('create（校验顺序对齐 Java 第 90–114 行）', () => {
  it('SQL 创建即 ENABLED，params 原样存（不生成端点）', async () => {
    const h = harness()
    const out = await inTenant(() =>
      h.service.create({ name: '契约数据源', type: 'SQL', formKey: null, sourceKey: 'k1', params: null }),
    )
    expect(out.status).toBe('ENABLED')
    expect(out.params).toBeNull()
    expect(h.inserted[0].status).toBe('ENABLED')
  })

  it('API 创建即 ENABLED', async () => {
    const h = harness()
    const out = await inTenant(() =>
      h.service.create({
        name: 'a',
        type: 'API',
        formKey: null,
        sourceKey: 'k2',
        params: '{"action":"/x"}',
      }),
    )
    expect(out.status).toBe('ENABLED')
  })

  it('FORM 创建为 DRAFT，params 自动生成且 sourceKey 被强制等于 formKey', async () => {
    const h = harness()
    const out = await inTenant(() =>
      h.service.create({
        name: 'f',
        type: 'FORM',
        formKey: 'person',
        // 入参 sourceKey 与 formKey 不同 —— Java 忽略它
        sourceKey: 'attacker',
        params: null,
      }),
    )
    expect(out.status).toBe('DRAFT')
    expect(out.sourceKey).toBe('person')
    expect(h.inserted[0].source_key).toBe('person')
    expect(h.inserted[0].params).toContain('/api/v1/biz-data/person')
  })

  it('FORM 创建携带草稿段（无 queryMode）→ 端点段重建 + 草稿保留（双段并存）', async () => {
    const h = harness()
    await inTenant(() =>
      h.service.create({
        name: 'f',
        type: 'FORM',
        formKey: 'person',
        sourceKey: 'person',
        // 单表查询 + 声明式草稿：queryMode 缺省，joins 保留入库供下次迭代
        params: '{"joins":[{"targetFormKey":"customer","localField":"id","foreignField":"id","joinField":"name","virtualKey":"customer_name","label":"客户名称","sortable":true,"filterable":true}]}',
      }),
    )
    const stored = h.inserted[0].params ?? ''
    expect(stored).toContain('/api/v1/biz-data/person')
    expect(stored).toContain('"joins"')
    expect(stored).toContain('"customer_name"')
    expect(stored).not.toContain('"queryMode"')
  })

  it('出参不含 formId（对齐 Java toDTO 的 11 个字段）', async () => {
    const h = harness()
    const out = await inTenant(() =>
      h.service.create({ name: 'n', type: 'SQL', formKey: null, sourceKey: 'k3', params: null }),
    )
    expect(out).not.toHaveProperty('formId')
    expect(Object.keys(out).sort()).toEqual(
      [
        'createdAt',
        'createdBy',
        'formKey',
        'id',
        'name',
        'params',
        'sourceKey',
        'status',
        'tenantId',
        'type',
        'updatedAt',
      ].sort(),
    )
  })

  it('type 缺失 / 不支持 → 400', async () => {
    const h = harness()
    await inTenant(() =>
      expectBusiness(
        () => h.service.create({ name: 'n', type: null, formKey: null, sourceKey: 'k', params: null }),
        400,
        '数据源类型 type 必填',
      ),
    )
    await inTenant(() =>
      expectBusiness(
        () => h.service.create({ name: 'n', type: 'XX', formKey: null, sourceKey: 'k', params: null }),
        400,
        '不支持的数据源类型: XX',
      ),
    )
  })

  it('名称为空 → 400', async () => {
    const h = harness()
    await inTenant(() =>
      expectBusiness(
        () => h.service.create({ name: '  ', type: 'SQL', formKey: null, sourceKey: 'k', params: null }),
        400,
        '数据源名称不能为空',
      ),
    )
  })

  it('FORM 缺 formKey → 400（先于「绑定的表单不存在」）', async () => {
    const h = harness()
    await inTenant(() =>
      expectBusiness(
        () => h.service.create({ name: 'n', type: 'FORM', formKey: null, sourceKey: null, params: null }),
        400,
        'FORM 类型数据源必须绑定表单 formKey',
      ),
    )
  })

  it('FORM 绑定的表单不存在 → 400', async () => {
    const h = harness()
    h.setFormExists(false)
    await inTenant(() =>
      expectBusiness(
        () => h.service.create({ name: 'n', type: 'FORM', formKey: 'ghost', sourceKey: null, params: null }),
        400,
        '绑定的表单不存在: ghost',
      ),
    )
  })

  it('API 缺 params.action → 400', async () => {
    const h = harness()
    await inTenant(() =>
      expectBusiness(
        () => h.service.create({ name: 'n', type: 'API', formKey: null, sourceKey: 'k', params: null }),
        400,
        'API 数据源参数 params 必须包含 action（API 路径）',
      ),
    )
  })

  it('SYSTEM 未注册 sourceKey → 400', async () => {
    const h = harness()
    await inTenant(() =>
      expectBusiness(
        () => h.service.create({ name: 'n', type: 'SYSTEM', formKey: null, sourceKey: 'zzz', params: null }),
        400,
        '未注册的系统数据源: zzz',
      ),
    )
  })

  it('SQL 缺 sourceKey → 400', async () => {
    const h = harness()
    await inTenant(() =>
      expectBusiness(
        () => h.service.create({ name: 'n', type: 'SQL', formKey: null, sourceKey: null, params: null }),
        400,
        'SQL 类型数据源必须填写 sourceKey',
      ),
    )
  })
})

describe('update', () => {
  it('null 字段表示不更新（只改名时其余字段保持）', async () => {
    const h = harness()
    const out = await inTenant(() =>
      h.service.update(DS_ROW.id, {
        name: '新名',
        type: null,
        formKey: null,
        sourceKey: null,
        params: null,
      }),
    )
    expect(out.name).toBe('新名')
    expect(out.type).toBe('SQL')
    expect(out.sourceKey).toBe('contract_ds_x')
  })

  it('不存在 → 业务 404（消息带 id）', async () => {
    const h = harness()
    h.setRow(null)
    await inTenant(() =>
      expectBusiness(
        () => h.service.update('none', { name: 'n', type: null, formKey: null, sourceKey: null, params: null }),
        404,
        '数据源不存在: none',
      ),
    )
  })

  it('改成 FORM 但表单未发布 → 400（ENABLED + 绑定变化才校验）', async () => {
    const h = harness()
    h.setPublishedForm(null)
    await inTenant(() =>
      expectBusiness(
        () => h.service.update(DS_ROW.id, { name: null, type: 'FORM', formKey: 'person', sourceKey: null, params: null }),
        400,
        '绑定的表单未发布，无法启用: person',
      ),
    )
  })

  it('current 已是 FORM 且只改 type 字段以外内容时不做发布校验', async () => {
    const h = harness({ type: 'FORM', form_key: 'person', source_key: 'person' })
    h.setPublishedForm(null)
    // 只改 params，不碰 formKey/type → bindChanged=false；
    // params 无 query 配置段 → 端点段系统权威重建（对齐 create）
    const out = await inTenant(() =>
      h.service.update(DS_ROW.id, { name: null, type: null, formKey: null, sourceKey: null, params: '{}' }),
    )
    expect(out.params).toContain('"list"')
    expect(out.params).toContain('/api/v1/biz-data/person')
  })

  it('FORM update 双段并存：sql 段生效 + joins 草稿保留 + 端点段重建', async () => {
    const h = harness({ type: 'FORM', form_key: 'person', source_key: 'person' })
    await inTenant(() =>
      h.service.update(DS_ROW.id, {
        name: null,
        type: null,
        formKey: null,
        sourceKey: null,
        params:
          '{"queryMode":"sql","query":"SELECT id FROM t WHERE tenant_id = :tenantId","columns":[{"key":"id"}],' +
          '"joins":[{"targetFormKey":"customer","localField":"id","foreignField":"id","joinField":"name","virtualKey":"customer_name","label":"客户名称","sortable":true,"filterable":true}]}',
      }),
    )
    const stored = h.replaced.at(-1)?.patch.params ?? ''
    expect(stored).toContain('"queryMode":"sql"')
    expect(stored).toContain('"joins"')
    expect(stored).toContain('"customer_name"')
    // 端点段权威重建：换绑 formKey 后旧端点不残留
    expect(stored).toContain('/api/v1/biz-data/person')
  })

  it('FORM update 切回单表查询（无 queryMode）→ 旧 config 段被清除，草稿按当前编辑态重写', async () => {
    const h = harness({
      type: 'FORM',
      form_key: 'person',
      source_key: 'person',
      // 存量：config 模式 + joins（旧 bug：切单表后残留，运行时仍走 JOIN）
      params:
        '{"list":{"action":"/api/v1/biz-data/person","method":"GET"},"queryMode":"config","joins":[{"targetFormKey":"customer","virtualKey":"old_col"}]}',
    })
    await inTenant(() =>
      h.service.update(DS_ROW.id, { name: null, type: null, formKey: null, sourceKey: null, params: '{}' }),
    )
    const stored = h.replaced.at(-1)?.patch.params ?? ''
    expect(stored).not.toContain('"queryMode"')
    expect(stored).not.toContain('"joins"')
    expect(stored).toContain('"list"')
  })

  it('WORKFLOW 目标为 BUSINESS 表单 → 400（业务表单没有流程实例可聚合）', async () => {
    const h = harness()
    h.setPublishedForm({ type: 'BUSINESS' })
    await inTenant(() =>
      expectBusiness(
        () => h.service.update(DS_ROW.id, { name: null, type: 'WORKFLOW', formKey: 'person', sourceKey: null, params: null }),
        400,
        '业务表单不可配置为工作流表单数据源: person',
      ),
    )
  })

  it('queryMode=config 且缺 joins → 400', async () => {
    const h = harness({ type: 'FORM', form_key: 'person', source_key: 'person' })
    await inTenant(() =>
      expectBusiness(
        () => h.service.update(DS_ROW.id, { name: null, type: null, formKey: null, sourceKey: null, params: '{"queryMode":"config"}' }),
        400,
        'queryMode=config 时必须配置至少一个关联 joins',
      ),
    )
  })

  it('未知 queryMode → 400', async () => {
    const h = harness({ type: 'FORM', form_key: 'person', source_key: 'person' })
    await inTenant(() =>
      expectBusiness(
        () => h.service.update(DS_ROW.id, { name: null, type: null, formKey: null, sourceKey: null, params: '{"queryMode":"weird"}' }),
        400,
        '未知查询模式 queryMode: weird（支持 config / sql）',
      ),
    )
  })

  // queryMode=sql 的校验复用 SqlTemplateEngine.validate（原先是显式 500「尚未迁移占位」）。
  // 现在四条最常踩的规则各有专属文案，且都是 **400**（与取数路径的 400 同一形态）。
  it('queryMode=sql → 复用 SqlTemplateEngine 校验（400，不再放行）', async () => {
    const h = harness({ type: 'FORM', form_key: 'person', source_key: 'person' })
    const cases: Array<[string, string]> = [
      ['{"queryMode":"sql"}', 'SQL 模板不能为空'],
      [
        '{"queryMode":"sql","query":"DELETE FROM t WHERE tenant_id = :tenantId","columns":[{"key":"id"}]}',
        '仅允许 SELECT 查询',
      ],
      [
        '{"queryMode":"sql","query":"SELECT id FROM t","columns":[{"key":"id"}]}',
        'SQL 模板必须包含 :tenantId 占位符',
      ],
      [
        '{"queryMode":"sql","query":"SELECT id FROM t WHERE tenant_id = :tenantId","columns":[]}',
        'columns 不能为空',
      ],
      [
        '{"queryMode":"sql","query":"SELECT id FROM t WHERE tenant_id = :tenantId","columns":[{"key":"id"},{"key":"nope"}]}',
        '声明列不在查询结果中: nope',
      ],
      [
        '{"queryMode":"sql","query":"SELECT id FROM t WHERE tenant_id = :tenantId AND c = :c","columns":[{"key":"id"}]}',
        'SQL 模板包含未声明参数: :c',
      ],
      [
        '{"queryMode":"sql","query":"SELECT id FROM t WHERE tenant_id = :tenantId","columns":[{"key":"id"}],"params":["9bad"]}',
        '参数名非法: 9bad',
      ],
    ]
    for (const [params, message] of cases) {
      await inTenant(() =>
        expectBusiness(
          () => h.service.update(DS_ROW.id, { name: null, type: null, formKey: null, sourceKey: null, params }),
          400,
          message,
        ),
      )
    }
  })

  it('queryMode=sql 且配置合法 → 放行（不再误报）', async () => {
    const h = harness({ type: 'FORM', form_key: 'person', source_key: 'person' })
    await inTenant(() =>
      h.service.update(DS_ROW.id, {
        name: null,
        type: null,
        formKey: null,
        sourceKey: null,
        params:
          '{"queryMode":"sql","query":"SELECT id, code FROM t WHERE tenant_id = :tenantId AND code = :code",' +
          '"columns":[{"key":"id","sortable":true,"filterable":true},{"key":"code","sortable":false,"filterable":true}],' +
          '"params":["code"]}',
      }),
    )
    expect(h.replaced.at(-1)?.patch.params).toContain('"queryMode":"sql"')
  })
})

describe('enable / disable', () => {
  it('FORM 未发布 → 400', async () => {
    const h = harness({ type: 'FORM', form_key: 'person', source_key: 'person', status: 'DRAFT' })
    h.setPublishedForm(null)
    await inTenant(() =>
      expectBusiness(() => h.service.enable(DS_ROW.id), 400, '绑定的表单未发布，无法启用: person'),
    )
  })

  it('WORKFLOW 表单不存在 → 400', async () => {
    const h = harness({ type: 'WORKFLOW', form_key: 'ghost', source_key: 'ghost', status: 'DRAFT' })
    h.setFormExists(false)
    await inTenant(() => expectBusiness(() => h.service.enable(DS_ROW.id), 400, '表单不存在: ghost'))
  })

  it('FORM/SYSTEM 且 params 为空时，启用会补上生成的端点配置', async () => {
    const h = harness({ type: 'SYSTEM', form_key: null, source_key: 'dept-tree', params: null, status: 'DRAFT' })
    const out = await inTenant(() => h.service.enable(DS_ROW.id))
    expect(out.status).toBe('ENABLED')
    expect(out.params).toBe('{"list":{"action":"/api/v1/internal/system/dept-tree","method":"GET"}}')
  })

  it('SQL 启用不做「已发布表单」校验（无绑定对象）', async () => {
    const h = harness({ status: 'DISABLED' })
    h.setPublishedForm(null)
    const out = await inTenant(() => h.service.enable(DS_ROW.id))
    expect(out.status).toBe('ENABLED')
  })

  it('disable 不做任何校验，直接置 DISABLED', async () => {
    const h = harness()
    const out = await inTenant(() => h.service.disable(DS_ROW.id))
    expect(out.status).toBe('DISABLED')
    expect(h.replaced[0].patch).toEqual({ status: 'DISABLED' })
  })
})

describe('remove（引用校验）', () => {
  // ⚠️ Java 注释写「仅 DRAFT 可删除」，但代码与 golden 都证明**任意状态可删**
  //    （golden 里 ENABLED 状态下 delete 返回 200）。注释是过时的，以 oracle 为准。
  it('ENABLED 状态也能删（注释说仅 DRAFT，实测不然）', async () => {
    const h = harness({ status: 'ENABLED' })
    await inTenant(() => h.service.remove(DS_ROW.id))
    expect(h.deleted).toEqual([DS_ROW.id])
  })

  it('被 dataSourceId 列引用时拒绝，消息带引用数', async () => {
    const h = harness()
    h.setPages([{ dataSourceId: DS_ROW.id }, { dataSourceId: DS_ROW.id }])
    await inTenant(() =>
      expectBusiness(() => h.service.remove(DS_ROW.id), 400, '数据源已被 2 个页面引用，无法删除'),
    )
    expect(h.deleted).toEqual([])
  })

  it('被 schema.dataSources[].refId 引用时拒绝', async () => {
    const h = harness()
    h.setPages([
      { dataSourceId: null, status: 'PUBLISHED', schema: `{"dataSources":[{"refId":"${DS_ROW.id}"}]}` },
    ])
    await inTenant(() =>
      expectBusiness(() => h.service.remove(DS_ROW.id), 400, '数据源已被 1 个页面引用，无法删除'),
    )
  })

  // 页面软删除后不再使用，其 schema 引用不应阻塞数据源删除
  it('ARCHIVED 页面的 schema 引用不算数', async () => {
    const h = harness()
    h.setPages([
      { dataSourceId: null, status: 'ARCHIVED', schema: `{"dataSources":[{"refId":"${DS_ROW.id}"}]}` },
    ])
    await inTenant(() => h.service.remove(DS_ROW.id))
    expect(h.deleted).toEqual([DS_ROW.id])
  })

  it('不存在 → 业务 404', async () => {
    const h = harness()
    h.setRow(null)
    await inTenant(() =>
      expectBusiness(() => h.service.remove('none'), 404, '数据源不存在: none'),
    )
  })
})
