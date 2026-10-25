// ----- Task 11.2: 查找选择器（LookupPicker）移动端数据层与回写 -----
// 语义对位 web src/components/business/LookupPicker.vue：
//  · 回写目标 = idField + returnFields 的值（:273/:283/:293-295）——returnFields 方向
//    key=被查表源字段、value=表单目标字段（别写反）；
//  · 清除 = 同一批目标字段一律置 null（:302-315），自身字段（显示文本）由 emit 侧置空；
//  · 选中 → 自身字段承载显示文本（:268-270），displayField 缺省时退回行 id；
//  · 取数复用 useUniList（GET /v1/data-sources/:refId/data），搜索 = searchColumns like。
// npx vitest run packages/lc-runtime-uni/__tests__/picker.test.ts

import { describe, expect, it } from 'vitest'

import {
  applyUniPickerWrites,
  clearUniPickerWrites,
  pickerWriteTargets,
  uniPickerTextOf,
  useUniPicker,
} from '../src/picker'

describe('pickerWriteTargets — 回写目标集合', () => {
  it('idField + returnFields 的值（去重，顺序稳定）', () => {
    expect(
      pickerWriteTargets({
        idField: 'customer_id',
        returnFields: { contact: 'contact_name', phone: 'contact_phone' },
      }),
    ).toEqual(['customer_id', 'contact_name', 'contact_phone'])
  })

  it('returnFields 的值与 idField 重名只算一次', () => {
    expect(pickerWriteTargets({ idField: 'owner_id', returnFields: { name: 'owner_id' } })).toEqual([
      'owner_id',
    ])
  })

  it('未配置 → 空集合（不凭空空写字段）', () => {
    expect(pickerWriteTargets({})).toEqual([])
  })
})

describe('applyUniPickerWrites — 选中回写（LookupPicker.vue:273-295 口径）', () => {
  it('idField ← row.id；returnFields key=源字段 → value=目标字段', () => {
    const form: Record<string, unknown> = { title: '订单' }
    applyUniPickerWrites(
      form,
      { id: 'r1', contact: '张三', phone: '138' },
      { idField: 'customer_id', returnFields: { contact: 'contact_name', phone: 'contact_phone' } },
    )
    expect(form).toEqual({ title: '订单', customer_id: 'r1', contact_name: '张三', contact_phone: '138' })
  })

  it('源字段缺失 → null（不留 undefined）；row 为空则整批不动', () => {
    const form: Record<string, unknown> = {}
    applyUniPickerWrites(form, { id: 'r1' }, { returnFields: { contact: 'contact_name' } })
    expect(form.contact_name).toBeNull()

    const untouched: Record<string, unknown> = { customer_id: 'old' }
    applyUniPickerWrites(untouched, null, { idField: 'customer_id' })
    expect(untouched).toEqual({ customer_id: 'old' })
  })

  it('未配置 idField 时只写 returnFields（不凭空造 id 目标）', () => {
    const form: Record<string, unknown> = {}
    applyUniPickerWrites(form, { id: 'r1', contact: '张三' }, { returnFields: { contact: 'contact_name' } })
    expect(form).toEqual({ contact_name: '张三' })
  })
})

describe('clearUniPickerWrites — 清除回写（同批目标字段置 null）', () => {
  it('同一批字段一律 null；无关键不动', () => {
    const form: Record<string, unknown> = { title: '订单', customer_id: 'r1', contact_name: '张三' }
    clearUniPickerWrites(form, { idField: 'customer_id', returnFields: { contact: 'contact_name' } })
    expect(form).toEqual({ title: '订单', customer_id: null, contact_name: null })
  })
})

describe('uniPickerTextOf — 自身字段承载的显示文本', () => {
  it('displayField 命中 → 字符串化', () => {
    expect(uniPickerTextOf({ id: 'r1', name: '客户甲' }, 'name')).toBe('客户甲')
    expect(uniPickerTextOf({ id: 'r1', qty: 3 }, 'qty')).toBe('3')
  })

  it('displayField 未配置或取不到 → 退回行 id（选中后必须可见，不留白）', () => {
    expect(uniPickerTextOf({ id: 'r1', name: '客户甲' })).toBe('r1')
    expect(uniPickerTextOf({ id: 'r1' }, 'name')).toBe('r1')
    expect(uniPickerTextOf({ id: 'r1', name: '' }, 'name')).toBe('r1')
  })

  it('空行 → 空串', () => {
    expect(uniPickerTextOf(null)).toBe('')
    expect(uniPickerTextOf({}, undefined)).toBe('')
  })
})

describe('useUniPicker — 弹层状态 + 复用列表取数', () => {
  const stub = () => {
    const calls: Array<Record<string, unknown>> = []
    const request = async <T,>(call: Record<string, unknown>) => {
      calls.push(call)
      return {
        code: 200,
        msg: 'ok',
        data: { records: [{ id: 'r1', data: { name: '客户甲' } }], total: 1 },
      } as unknown as T
    }
    return { calls, request }
  }

  it('首开才取数（同一 refId 不重复查表）；关闭后重开沿用已取结果', async () => {
    const { calls, request } = stub()
    const picker = useUniPicker({ refId: 'ref_customer', request: request as never })
    expect(picker.visible.value).toBe(false)

    await picker.open()
    expect(picker.visible.value).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      url: '/v1/data-sources/ref_customer/data',
      data: { page: 1, size: 20 },
    })
    expect(picker.rows.value).toEqual([{ name: '客户甲', id: 'r1', version: undefined }])

    picker.close()
    expect(picker.visible.value).toBe(false)
    await picker.open()
    expect(calls).toHaveLength(1)
  })

  it('搜索条关键字 → searchFields like 重查（触底走 loadMore）', async () => {
    const { calls, request } = stub()
    const picker = useUniPicker({
      refId: 'ref_customer',
      searchFields: [{ prop: 'name' }],
      request: request as never,
    })
    await picker.open()
    picker.keyword.value = '甲'
    await picker.onSearch()
    expect(calls).toHaveLength(2)
    expect(String((calls[1].data as Record<string, unknown>).filter)).toContain(
      '"column":"name","op":"like","value":"甲"',
    )
  })
})