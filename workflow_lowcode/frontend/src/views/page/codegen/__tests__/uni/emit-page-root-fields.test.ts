// ----- Task 11.1: 页面根级字段族装配（uni 侧真装配）-----
// 背景（tasks.md §10.5 → §11、design D12）：活库 uni_page 的 rule = [input, radio, LookupPicker]
// 直接挂在页面根；10.5 只做了「不静默丢弃」（lc:todo 挂点 + manifest 逐节点登记），产物仍是空壳。
// 本任务把 uni 侧的根级字段族**真装配**：字段片段进 <uni-forms> 载体、绑定页面级表单后端
// （独立声明名 pageForm/pageErrors，与容器段后端并存不撞名）；未登记契约的类型（radio）
// 照旧挂点 + parse 那条登记（不重复记两行）。
// npx vitest run src/views/page/codegen/__tests__/uni/emit-page-root-fields.test.ts

import { describe, expect, it } from 'vitest'

import { generatePageUni } from '../../uni/emit-uni'
import cardlist from '../fixtures/corpus/cardlist_test.json'
import { CLIENT } from './client-fixture'

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

/** 越界形态（等价活库 uni_page）：字段族直接挂页面根 */
const rootFields = {
  rule: [
    { type: 'input', field: 'title1', title: '标题', props: { placeholder: '请输入标题' } },
    { type: 'select', field: 'kind1', title: '类型', props: {} },
    { type: 'radio', field: 'unreg1', props: {} },
  ],
  option: {},
  dataSources: [],
  actions: [],
}

const uni = (schema: unknown, key: string) =>
  generatePageUni(schema as any, { pageKey: key, pageName: key, client: CLIENT })

const sfcOf = (files: Record<string, string>, key: string): string => files[`src/pages/gen/${key}.vue`]

describe('页面根级字段族装配（uni）', () => {
  it('根级字段真出码：uni-forms 载体 + 页面级表单后端（pageForm/pageErrors）', () => {
    const { files, manifest } = uni(rootFields, 'uni_root_fields')
    const sfc = sfcOf(files, 'uni_root_fields')

    // 页面级表单载体与后端：字段片段的 v-model / :error-message 必须接到这套后端上
    expect(sfc).toContain('import { useUniForm } from \'@lc/runtime-uni/form\'')
    expect(sfc).toContain('const pageFormRules = [')
    expect(sfc).toContain('const { model: pageForm, errors: pageErrors } = useUniForm(pageFormRules)')
    expect(sfc).toContain('<uni-forms :model="pageForm" class="lc-page-form">')
    expect(sfc).toContain('<uni-easyinput v-model="pageForm.title1"')
    expect(sfc).toContain('name="title1"')
    expect(sfc).toContain(':error-message="pageErrors.title1"')
    expect(sfc).toContain('<uni-data-select v-model="pageForm.kind1"')

    // 无 formContainer 的页面不该有容器段后端声明（两套后端各自独立）
    expect(sfc).not.toContain('const { model: form, errors, validate')

    // 已装配 → 挂点注释与 not-assembled 登记都销账
    expect(sfc).not.toMatch(/lc:todo node=\S+ type=input\b/)
    expect(sfc).not.toMatch(/lc:todo node=\S+ type=select\b/)
    expect(manifest.unsupported.filter((u) => u.key === 'not-assembled')).toEqual([])
    expect(manifest.unsupported.some((u) => u.type === 'input' || u.type === 'select')).toBe(false)

    // 未登记契约的 radio：照旧挂点 + 只在自身地址登记一条（parse 那条，不重复）
    expect(sfc).toMatch(/lc:todo node=n3 type=radio field=unreg1/)
    expect(manifest.unsupported.filter((u) => u.type === 'radio')).toHaveLength(1)
  })

  it('字段声明进 pageFormRules：title 落 label 载体、required 进声明（useUniForm 的校验面）', () => {
    const schema = clone(rootFields)
    schema.rule[0] = { type: 'input', field: 'title1', title: '标题', $required: true, props: {} } as any
    const { files } = uni(schema, 'uni_root_required')
    const sfc = sfcOf(files, 'uni_root_required')
    expect(sfc).toContain('const pageFormRules = [')
    expect(sfc).toContain("field: 'title1'")
    expect(sfc).toContain("title: '标题'")
    expect(sfc).toContain('required: true')
    expect(sfc).toContain('<uni-forms-item label="标题" name="title1" required')
  })

  it('与容器段并存不撞名：同页两套表单后端各自独立声明', () => {
    const merged = clone(cardlist) as any
    merged.rule.unshift({ type: 'input', field: 'root_title', title: '根级标题', props: {} })
    const { files, manifest } = uni(merged, 'uni_root_with_container')
    const sfc = sfcOf(files, 'uni_root_with_container')

    // 页面级后端（根级字段）与容器段后端（容器字段）同时存在，标识符不重复
    expect(sfc).toContain('const { model: pageForm, errors: pageErrors } = useUniForm(pageFormRules)')
    expect(sfc).toContain('const { model: form, errors, validate, reset: formReset } = useUniForm(formRules)')
    expect(sfc).toContain('<uni-easyinput v-model="pageForm.root_title"')
    // 根级字段已装配：无 not-assembled 残留（容器的 LookupPicker 11.2 起也已真装配）
    expect(manifest.unsupported.filter((u) => u.type === 'input' && u.key === 'not-assembled')).toEqual([])
  })

  it('字段在容器内照常出码（受支持形态不回归，后端仍是 form）', () => {
    const { files } = uni(clone(cardlist), 'uni_container_only')
    const sfc = sfcOf(files, 'uni_container_only')
    expect(sfc).toContain('<uni-easyinput v-model="form.order_no"')
    expect(sfc).not.toContain('pageForm')
  })
})