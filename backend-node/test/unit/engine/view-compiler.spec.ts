import { describe, expect, it } from 'vitest'
import { ViewCompiler } from '../../../src/engine/page/view-compiler'
import type { PageDefinitionRow } from '../../../src/engine/page/repository/page-definition.repository'
import type { ColumnConfig } from '../../../src/common/domain/column-config'
import { newColumnConfig } from '../../../src/common/domain/column-config'

/**
 * 视图编译器的单测。
 *
 * 契约场景「VIEW 页面编译与取数」已经把**主链路**钉死了 —— 包括编译产物被写回
 * `schema` 字符串后的**逐字**比对（这一条比看起来更强：产物是字符串，键顺序错一个字符就会红）。
 * 这里补的是 golden 覆盖不到的分支：各类 400 的**触发条件与消息**、
 * `validKeys` 为空时不校验引用、filter 全空则整段移除、旧布尔格式 actions，
 * 以及 `range` 分支里键的"原地替换"语义。
 */

const compiler = new ViewCompiler()

function page(schema: string | null): PageDefinitionRow {
  return {
    id: 'p1',
    tenant_id: 'default',
    name: '视图',
    key: 'v_key',
    type: 'VIEW',
    form_key: 'person',
    data_source_id: null,
    schema,
    version: 1,
    status: 'DRAFT',
    published_version: null,
    created_by: null,
    created_at: null,
    updated_at: null,
  }
}

function columns(...keys: string[]): ColumnConfig[] {
  return keys.map((key) => ({ ...newColumnConfig(), key, columnType: 'VARCHAR', length: 64 }))
}

function messageOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error('预期抛错，但没有抛')
}

function compiled(schema: string | null, bind = ['code', 'name']): Record<string, unknown> {
  return JSON.parse(compiler.compile(page(schema), columns(...bind))) as Record<string, unknown>
}

describe('ViewCompiler / 基本产物', () => {
  it('空 schema 也产出 rule/option/display（display 缺省为 table）', () => {
    expect(compiled(null)).toEqual({ rule: [], option: {}, display: 'table' })
    expect(compiled('{}')).toEqual({ rule: [], option: {}, display: 'table' })
    expect(compiled('{"display":"card"}').display).toBe('card')
    // 未知 display 值一律回落 table
    expect(compiled('{"display":"grid"}').display).toBe('table')
  })

  it('schema 非法 JSON → 400「视图配置解析失败」', () => {
    expect(messageOf(() => compiler.compile(page('{oops'), columns('code')))).toBe(
      '视图配置解析失败',
    )
  })

  it('searchFields：eq/like 产出 input，range 产出 datePicker 且键位原地替换', () => {
    const out = compiled(
      '{"searchFields":[{"key":"code","label":"编码"},{"key":"name","matchType":"like"},{"key":"code","label":"范围","matchType":"range"}]}',
    )
    const rule = out.rule as Array<Record<string, unknown>>
    expect(rule[0]).toEqual({
      type: 'input',
      field: 'code',
      title: '编码',
      value: '',
      props: { placeholder: '编码', style: 'width: 180px' },
      matchType: 'eq',
    })
    // label 缺省用 key；matchType 缺省 eq
    expect(rule[1].title).toBe('name')
    expect(rule[1].matchType).toBe('like')
    // range：type/value 原地替换（键序不变），props 追加 4 个键
    expect(rule[2]).toEqual({
      type: 'datePicker',
      field: 'code',
      title: '范围',
      value: [],
      props: {
        placeholder: '范围',
        style: 'width: 180px',
        type: 'datetimerange',
        valueFormat: 'yyyy-MM-dd HH:mm:ss',
        startPlaceholder: '开始范围',
        endPlaceholder: '结束范围',
      },
      matchType: 'range',
    })
  })

  it('searchFields 未知 matchType → 400', () => {
    expect(
      messageOf(() => compiler.compile(page('{"searchFields":[{"key":"code","matchType":"gt"}]}'), columns('code'))),
    ).toBe('未知查询匹配类型: gt')
  })

  it('引用列不存在：查询字段 / 展示列 / 排序字段 / 筛选条件 四种消息', () => {
    expect(
      messageOf(() => compiler.compile(page('{"searchFields":[{"key":"nope"}]}'), columns('code'))),
    ).toBe('查询字段引用列不存在: nope')
    expect(
      messageOf(() => compiler.compile(page('{"columns":[{"key":"nope"}]}'), columns('code'))),
    ).toBe('展示列引用列不存在: nope')
    expect(
      messageOf(() => compiler.compile(page('{"sortableFields":["nope"]}'), columns('code'))),
    ).toBe('排序字段引用列不存在: nope')
    expect(
      messageOf(() =>
        compiler.compile(page('{"filter":{"conditions":[{"column":"nope"}]}}'), columns('code')),
      ),
    ).toBe('筛选条件引用列不存在: nope')
  })

  it('绑定列为空时**不做**引用校验（Java 的 validKeys.isEmpty 旁路）', () => {
    const out = compiled('{"searchFields":[{"key":"whatever"}],"columns":[{"key":"anything"}]}', [])
    const rule = out.rule as Array<Record<string, unknown>>
    expect(rule[0].field).toBe('whatever')
    expect((rule[1].props as Record<string, unknown>).columns).toHaveLength(1)
  })
})

describe('ViewCompiler / columns 与 filter', () => {
  it('页面列 hidden → 编译期跳过；custom → 跳过引用校验但仍输出', () => {
    const out = compiled(
      '{"columns":[{"key":"code","label":"编码","width":200,"align":"right"},{"key":"name","hidden":true},{"key":"calc","custom":true,"contentType":"text"}]}',
    )
    const table = (out.rule as Array<Record<string, unknown>>)[0]
    const cols = (table.props as { columns: Array<Record<string, unknown>> }).columns
    expect(cols.map((c) => c.prop)).toEqual(['code', 'calc'])
    expect(cols[0]).toEqual({ prop: 'code', label: '编码', minWidth: 200, align: 'right' })
    // custom 列不带 align、但 `custom` 与 contentType 都经 copyIfPresent 透传；缺省 minWidth=130
    expect(cols[1]).toEqual({
      prop: 'calc',
      label: 'calc',
      minWidth: 130,
      custom: true,
      contentType: 'text',
    })
  })

  it('列宽非数字按 Jackson asInt(130) 回落 130（不报错）', () => {
    const out = compiled('{"columns":[{"key":"code","width":"abc"}]}')
    const table = (out.rule as Array<Record<string, unknown>>)[0]
    const cols = (table.props as { columns: Array<Record<string, unknown>> }).columns
    expect(cols[0].minWidth).toBe(130)
  })

  it('columns 为空数组 → 不产出 table 组件', () => {
    expect(compiled('{"columns":[]}').rule).toEqual([])
  })

  it('filter：conditions 全空则整段移除；否则保留 logic/op/value 缺省', () => {
    expect(compiled('{"filter":{"conditions":[]}}').filter).toBeUndefined()
    expect(compiled('{"filter":{"logic":"OR","conditions":[{"column":"code"}]}}').filter).toEqual({
      logic: 'OR',
      conditions: [{ column: 'code', op: 'eq', value: '' }],
    })
    // column 空白的条件被跳过；跳完为空则移除 filter
    expect(compiled('{"filter":{"conditions":[{"column":"  "}]}}').filter).toBeUndefined()
  })
})

describe('ViewCompiler / pagination、actions、detail、events', () => {
  it('pagination 缺省与非法值', () => {
    expect(compiled('{"pagination":{}}').pagination).toEqual({
      show: true,
      pageSize: 20,
      pageSizes: [10, 20, 50],
    })
    expect(compiled('{"pagination":{"show":false,"pageSize":5,"pageSizes":[5]}}').pagination).toEqual({
      show: false,
      pageSize: 5,
      pageSizes: [5],
    })
    // pageSize 非数字 → Jackson asInt(20) 回落 20（不报错）；0 → 400
    expect((compiled('{"pagination":{"pageSize":"abc"}}').pagination as { pageSize: number }).pageSize).toBe(20)
    expect(messageOf(() => compiled('{"pagination":{"pageSize":0}}'))).toBe('每页条数必须为正整数: 0')
    expect(messageOf(() => compiled('{"pagination":{"pageSizes":[10,0]}}'))).toBe(
      '可选页大小必须为正整数: 0',
    )
  })

  it('actions：按钮数组格式（key 必填、placement/style 白名单、icon/events 透传）', () => {
    expect(messageOf(() => compiled('{"actions":{"buttons":[{"label":"无 key"}]}}'))).toBe(
      '操作按钮 key 不能为空',
    )
    expect(
      messageOf(() => compiled('{"actions":{"buttons":[{"key":"view","style":"link"}]}}')),
    ).toBe('未知按钮形态 style: link')
    const out = compiled(
      '{"actions":{"permissions":"page:read","actionColumnWidth":180,"buttons":[{"key":"view","label":"查看","placement":"toolbar","style":"text","icon":"View"},{"key":"export","events":[{"on":"click"}]}]}}',
    )
    const actions = (out.rule as Array<Record<string, unknown>>)[0]
    expect(actions.type).toBe('__page_actions')
    const props = actions.props as Record<string, unknown>
    expect(props.permissions).toBe('page:read')
    expect(props.actionColumnWidth).toBe(180)
    const buttons = props.buttons as Array<Record<string, unknown>>
    expect(buttons[0]).toEqual({
      key: 'view',
      label: '查看',
      placement: 'toolbar',
      style: 'text',
      icon: 'View',
    })
    // 缺省 label=key、placement=column、style=button；events 原样带入
    expect(buttons[1]).toEqual({
      key: 'export',
      label: 'export',
      placement: 'column',
      style: 'button',
      events: [{ on: 'click' }],
    })
  })

  it('actions：旧布尔格式只写出为 true 的项，placement/style 有缺省', () => {
    const out = compiled('{"actions":{"view":true,"create":true,"edit":false}}')
    const props = (out.rule as Array<Record<string, unknown>>)[0].props as Record<string, unknown>
    expect(props.view).toBe(true)
    expect(props.create).toBe(true)
    expect(props.edit).toBeUndefined()
    expect(props.placement).toBe('column')
    expect(props.style).toBe('button')
    expect(messageOf(() => compiled('{"actions":{"placement":"nowhere"}}'))).toBe(
      '未知操作位置 placement: nowhere',
    )
  })

  it('detail：未启用 view 则不编译；启用后带 width/height/type/formMode', () => {
    expect(compiled('{"detail":{"width":"900px"}}').rule).toEqual([])
    // 旧格式 detail.enabled=true 也能启用
    const legacy = compiled('{"detail":{"enabled":true}}')
    expect((legacy.rule as Array<Record<string, unknown>>)[0].type).toBe('__page_detail')
    const out = compiled(
      '{"actions":{"buttons":[{"key":"view"}]},"detail":{"width":"900px","height":"600px","formMode":"drawer"}}',
    )
    // ⚠️ rule 的顺序是 searchFields → columns → actions → detail → events：
    //    这里 actions 占了 [0]，detail 在 [1]。顺序本身就是契约的一部分。
    const rule = out.rule as Array<Record<string, unknown>>
    expect(rule.map((node) => node.type)).toEqual(['__page_actions', '__page_detail'])
    const detail = rule[1]
    expect(detail.props).toEqual({
      enabled: true,
      width: '900px',
      height: '600px',
      type: 'form',
      formMode: 'drawer',
    })
    // formMode 只认 drawer/inline，其余不写（popup 是渲染侧缺省）
    const popup = compiled('{"actions":{"view":true},"detail":{"formMode":"popup"}}')
    const popupRule = popup.rule as Array<Record<string, unknown>>
    expect(popupRule.map((node) => node.type)).toEqual(['__page_actions', '__page_detail'])
    expect(popupRule[1].props).toEqual({ enabled: true, type: 'form' })
  })

  it('events：空数组不产出组件，非空原样嵌入', () => {
    expect(compiled('{"events":[]}').rule).toEqual([])
    const out = compiled('{"events":[{"on":"mounted","steps":[]}]}')
    expect((out.rule as Array<Record<string, unknown>>)[0]).toEqual({
      type: '__page_events',
      field: '__page_events',
      title: '事件',
      events: [{ on: 'mounted', steps: [] }],
    })
  })

  it('sortableFields：空数组不写、空白项跳过', () => {
    expect(compiled('{"sortableFields":[]}').sortableFields).toBeUndefined()
    expect(compiled('{"sortableFields":["code","  "]}').sortableFields).toEqual(['code'])
  })
})
