// ----- Task 11.2: LookupPicker uni 侧真装配（取数 + 回写 + 弹层）-----
// 11.2 之前 LookupPicker 无 uni 映射：页面根级走 not-assembled / 容器子里走 field-component，
// 预览里只有 lc:todo 挂点。本任务起出真件：uni-forms-item 里的只读触发框 + uni-popup 弹层
// （uni-search-bar 搜索 / scroll-view 触底）+ useUniPicker 取数 + select/clear 回写 handler。
// npx vitest run src/views/page/codegen/__tests__/uni/emit-lookup-picker.test.ts

import { describe, expect, it } from 'vitest'

import { generatePageUni } from '../../uni/emit-uni'
import cardlist from '../fixtures/corpus/cardlist_test.json'
import { CLIENT } from './client-fixture'

const clone = (v: unknown) => JSON.parse(JSON.stringify(v))

const gen = (schema: unknown, pageKey: string) =>
  generatePageUni(schema as never, { pageKey, pageName: pageKey, client: CLIENT })

const lookupProps = {
  dataSourceId: 'ds_customer',
  displayField: 'name',
  searchColumns: ['name'],
  idField: 'customer_id',
  returnFields: { contact: 'contact_name' },
  columns: [{ prop: 'name', label: '客户名称' }],
}

const rootSchema = (dataSources?: unknown[]) => ({
  rule: [{ type: 'LookupPicker', field: 'customer', title: '客户', props: lookupProps }],
  option: {},
  dataSources: dataSources ?? [
    { id: 'ds_customer', refId: 'ref_customer', name: '客户档案', searchFields: [], label: '客户档案' },
  ],
  actions: [],
})

describe('emitFieldNode — LookupPicker（Task 11.2）', () => {
  it('页面根级：进 pageForm 载体 + 只读触发框 + 弹层 + useUniPicker 取数 + 回写 handler', () => {
    const { files, manifest } = gen(rootSchema(), 'uni_lookup_root')
    const sfc = files['src/pages/gen/uni_lookup_root.vue']
    expect(sfc).not.toBeNull()

    // 页面级表单载体（Task 11.1）与字段载体
    expect(sfc).toContain('<uni-forms :model="pageForm" class="lc-page-form">')
    expect(sfc).toContain('<uni-forms-item label="客户" name="customer" :error-message="pageErrors.customer">')

    // 触发框：只读 + 显示自身字段（对位 web LookupPicker 的 v-model=显示文本，:268-270）
    expect(sfc).toContain('<uni-easyinput readonly :model-value="String(pageForm.customer ?? \'\')" placeholder="请选择"')
    expect(sfc).toContain('@click="openLookupCustomer"')
    expect(sfc).toContain('@click.stop="clearLookupCustomer"')

    // 弹层骨架：搜索条 + 触底 + 逐行可选
    expect(sfc).toContain('<uni-popup ref="customerPopup" type="bottom"')
    expect(sfc).toContain('@confirm="customerSearch"')
    expect(sfc).toContain('@scrolltolower="customerLoadMore"')
    expect(sfc).toContain('@click="selectLookupCustomer(row)"')

    // 取数：复用列表数据层（refId 由 globalDataSourceId 解析，首源走 ds.refId）
    expect(sfc).toContain(
      `import { applyUniPickerWrites, clearUniPickerWrites, uniPickerTextOf, useUniPicker } from '@lc/runtime-uni/picker'`,
    )
    // 弹层 ref 的 vue import 必须随片段走：纯根级页面没有容器段兜底，
    // 缺 import 就是运行期 ReferenceError（ref is not defined）整页空白
    expect(sfc).toMatch(/import \{[^}]*\bref\b[^}]*\} from 'vue'/)
    expect(sfc).toContain(
      `const customerPicker = useUniPicker({ refId: ds.refId, searchFields: [{ prop: 'name' }] })`,
    )

    // 回写：idField/returnFields 走 spec 常量（方向 key=源字段 → value=目标字段），自身字段=显示文本
    expect(sfc).toContain('const customerSpec = {')
    expect(sfc).toContain("idField: 'customer_id'")
    expect(sfc).toContain("returnFields: {")
    expect(sfc).toContain("contact: 'contact_name'")
    expect(sfc).toContain("displayField: 'name'")
    expect(sfc).toContain('function selectLookupCustomer(row: Record<string, unknown>) {')
    expect(sfc).toContain('applyUniPickerWrites(pageForm, row, customerSpec)')
    expect(sfc).toContain('pageForm.customer = uniPickerTextOf(row, customerSpec.displayField)')
    expect(sfc).toContain('function clearLookupCustomer() {')
    expect(sfc).toContain('clearUniPickerWrites(pageForm, customerSpec)')

    // 真装配：不留挂点，也不再登记 field-component
    expect(sfc).not.toContain('lc:todo node=')
    expect(manifest.unsupported.some((u) => u.type === 'LookupPicker' && u.key === 'field-component')).toBe(
      false,
    )
  })

  it('绑定非首个数据源 → 走产物 dataSources 登记表（不拿 ds.refId 查错表）', () => {
    const { files } = gen(
      rootSchema([
        { id: 'ds_order', refId: 'ref_order', name: '订单', searchFields: [], label: '订单' },
        { id: 'ds_customer', refId: 'ref_customer', name: '客户档案', searchFields: [], label: '客户档案' },
      ]),
      'uni_lookup_ds2',
    )
    const sfc = files['src/pages/gen/uni_lookup_ds2.vue']
    expect(sfc).toContain(
      `const customerPicker = useUniPicker({ refId: dataSources['ds_customer'], searchFields: [{ prop: 'name' }] })`,
    )
  })

  it('参数列 columns 无移动端弹层对位 → 显式登记（不静默丢配置）', () => {
    const { manifest } = gen(rootSchema(), 'uni_lookup_cols')
    expect(
      manifest.unsupported.some((u) => u.type === 'LookupPicker' && u.key === 'picker-columns'),
    ).toBe(true)
  })
})

describe('emitContainerNode — 容器内 LookupPicker（Task 11.2）', () => {
  it('容器子字段真装配：回写挂在容器 form 后端，带回接线不再登记 writeback', () => {
    const { files, manifest } = gen(clone(cardlist), 'cardlist_lookup')
    const sfc = files['src/pages/gen/cardlist_lookup.vue']

    // 容器内 picker（cardlist rule[1].props.rule[3]）：refId 走第二个源
    expect(sfc).toContain(
      `const customerPicker = useUniPicker({ refId: dataSources['ds_mvck4gv91'], searchFields: [{ prop: 'name' }] })`,
    )
    expect(sfc).toContain('@click="openLookupCustomer"')
    expect(sfc).toContain('applyUniPickerWrites(form, row, customerSpec)')
    expect(sfc).toContain('form.customer = uniPickerTextOf(row, customerSpec.displayField)')
    expect(sfc).toContain('clearUniPickerWrites(form, customerSpec)')

    // 带回接线真落地 → 不再以 unsupported 记账；同页未装配的 dataPicker 仍登记（Task 11.3）
    expect(manifest.unsupported.some((u) => u.type === 'LookupPicker' && u.key === 'field-component')).toBe(
      false,
    )
    expect(manifest.unsupported.some((u) => u.type === 'LookupPicker' && u.key === 'writeback')).toBe(false)
    expect(manifest.unsupported.some((u) => u.type === 'dataPicker' && u.key === 'field-component')).toBe(
      true,
    )
  })
})