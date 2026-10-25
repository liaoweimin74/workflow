// ----- Task 4.2: select 三形态 golden（单选 uni-data-select / multiple 弹层 / 远程搜索弹层）-----
// golden 快照先行（plan Task 4.2）：期望模板即规格。口径：
//  · 单选 → uni-data-select 原生下拉：v-model 直绑值（无 index 映射 glue）；
//    :localdata="<config>.options" + format="{label}" 把 schema 的 {label,value}
//    选项适配成组件要求的 text 显示——常量保持 IR 原状，数据零拷贝；
//  · multiple → 自绘底部弹层：checkbox-group 勾选即生效（对位 el-select multiple
//    语义）；filterable（远程搜索）→ 自绘底部弹层：uni-search-bar 本地过滤常量选项
//    （真远程取数是动作/数据源出口的事，Task 5.3 接线）；
//  · uni-data-select 1.5.x 原生已支持 multiple（实测 node_modules），spec 仍走自绘
//    弹层：绝对定位下拉在 MP 表单页有裁剪风险，底部弹层是更稳的移动端形态；
//  · options 常量缺失（config 缺省或 obj.options 非数组）→ 降级单选空下拉（弹层
//    形态没有数据支撑是死 UI）；multiple/filterable 不在映射白名单——它们是形态
//    分支条件，不是透传 prop；
//  · 常量声明是页面装配（Task 8.x）从 ir.consts 统一出的，字段片段只消费引用。
// npx vitest run src/views/page/codegen/__tests__/uni/emit-field-select.test.ts

import { describe, expect, it } from 'vitest'

import { emitFieldNode } from '../../uni/emit-field'
import { parseIr } from '../../parse'
import { PROFILES } from '../../target-profile'

const profile = PROFILES.uniapp

function parseOf(rule: Record<string, unknown>) {
  return parseIr(
    { option: {}, rule: [rule], dataSources: [], actions: [] },
    { pageKey: 'golden', pageName: 'golden', exportedAt: 'emit-field-select' },
  )
}

function selectNodeOf(rule: Record<string, unknown>) {
  const ir = parseOf(rule)
  const node = ir.nodes[0]
  expect(node, 'parse 应产出顶层节点').toBeDefined()
  return { node: node!, ir }
}

describe('emitFieldNode select — 单选 uni-data-select（Task 4.2）', () => {
  it('单选 golden：v-model + :localdata 常量引用 + format 适配 + 白名单 props', () => {
    const { node } = selectNodeOf({
      type: 'select',
      field: 'city',
      title: '城市',
      options: [
        { label: '北京', value: 'bj' },
        { label: '上海', value: 'sh' },
      ],
      props: { placeholder: '请选择城市' },
    })
    expect(emitFieldNode(node, profile).template).toBe(
      [
        `<!-- lc:node=n1 type=select field=city -->`,
        `<uni-forms-item label="城市" name="city" :error-message="errors.city">`,
        `  <uni-data-select v-model="form.city" :localdata="cityConfig.options" format="{label}" placeholder="请选择城市" />`,
        `</uni-forms-item>`,
      ].join('\n'),
    )
  })

  it('clearable→clear 改名、disabled 透传（白名单改名语义）', () => {
    const { node } = selectNodeOf({
      type: 'select',
      field: 'level',
      title: '级别',
      options: [{ label: '高', value: 'high' }],
      props: { clearable: false, disabled: true },
    })
    expect(emitFieldNode(node, profile).template).toContain(
      `<uni-data-select v-model="form.level" :localdata="levelConfig.options" format="{label}" :clear="false" :disabled="true" />`,
    )
  })

  it('无 options（config 缺省）→ 单选空下拉，无 :localdata/format；multiple 也不透传', () => {
    const { node } = selectNodeOf({
      type: 'select',
      field: 'region',
      title: '区域',
      props: { multiple: true },
    })
    const out = emitFieldNode(node, profile)
    expect(out.template).toBe(
      [
        `<!-- lc:node=n1 type=select field=region -->`,
        `<uni-forms-item label="区域" name="region" :error-message="errors.region">`,
        `  <uni-data-select v-model="form.region" />`,
        `</uni-forms-item>`,
      ].join('\n'),
    )
  })

  it('options 常量经 parse 进 ir.consts（声明数据供 Task 8.x 页面装配统一出）', () => {
    const { ir } = selectNodeOf({
      type: 'select',
      field: 'city',
      title: '城市',
      options: [{ label: '北京', value: 'bj' }],
      props: {},
    })
    const found = ir.consts.find(([name]) => name === 'cityConfig')
    expect(found, 'ir.consts 应含 cityConfig').toBeDefined()
    expect(found![1]).toEqual({ options: [{ label: '北京', value: 'bj' }] })
  })
})

describe('emitFieldNode select — multiple 自绘弹层（Task 4.2）', () => {
  it('golden：触发器 + uni-popup 底部 checkbox-group 勾选即生效，无确定键（对位 el-select multiple 语义）', () => {
    const { node } = selectNodeOf({
      type: 'select',
      field: 'tags',
      title: '标签',
      options: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
      ],
      props: { multiple: true, placeholder: '请选择标签' },
    })
    const out = emitFieldNode(node, profile)
    expect(out.template).toBe(
      [
        `<!-- lc:node=n1 type=select field=tags -->`,
        `<uni-forms-item label="标签" name="tags" :error-message="errors.tags">`,
        `  <view class="lc-select" @click="lcSelTagsPopup?.open()">`,
        `    <text :class="{ 'lc-select__placeholder': !lcSelTagsLabel }">{{ lcSelTagsLabel || '请选择' }}</text>`,
        `  </view>`,
        `  <uni-popup ref="lcSelTagsPopup" type="bottom">`,
        `    <view class="lc-select-sheet">`,
        `      <checkbox-group class="lc-select-sheet__options" @change="lcSelTagsChange">`,
        `        <label v-for="opt in tagsConfig.options" :key="opt.value" class="lc-select-sheet__option">`,
        `          <checkbox :value="String(opt.value)" :checked="(form.tags || []).includes(opt.value)" />`,
        `          <text>{{ opt.label }}</text>`,
        `        </label>`,
        `      </checkbox-group>`,
        `    </view>`,
        `  </uni-popup>`,
        `</uni-forms-item>`,
      ].join('\n'),
    )
    expect(out.script).toEqual([
      `const lcSelTagsPopup = ref()`,
      `const lcSelTagsLabel = computed(() =>`,
      `  (Array.isArray(form.tags) ? form.tags : [])`,
      `    .map((v) => tagsConfig.options.find((o) => o.value === v)?.label ?? String(v))`,
      `    .join('、'))`,
      `function lcSelTagsChange(e: { detail: { value: string[] } }) {`,
      `  form.tags = e.detail.value.map((k) => tagsConfig.options.find((o) => String(o.value) === k)?.value)`,
      `}`,
    ])
    // 弹层形态用了 ref/computed：vue import 必须随片段走（页面装配不恒出——
    // 纯根级字段页没有容器段，缺这行就是运行期 ReferenceError 整页空白）
    expect(out.imports).toContain(`import { ref, computed } from 'vue'`)
  })

  it('multiple 与 filterable 并存：multiple 分支优先（filterable 不透传不出搜索框）', () => {
    const { node } = selectNodeOf({
      type: 'select',
      field: 'tags',
      title: '标签',
      options: [{ label: 'A', value: 'a' }],
      props: { multiple: true, filterable: true },
    })
    const out = emitFieldNode(node, profile)
    expect(out.template).toContain('checkbox-group')
    expect(out.template).not.toContain('uni-search-bar')
  })
})

describe('emitFieldNode select — filterable 远程搜索自绘弹层（Task 4.2）', () => {
  it('golden：触发器 + uni-popup 底部 uni-search-bar 本地过滤 + 单选即点即关', () => {
    const { node } = selectNodeOf({
      type: 'select',
      field: 'city',
      title: '城市',
      options: [
        { label: '北京', value: 'bj' },
        { label: '上海', value: 'sh' },
      ],
      props: { filterable: true },
    })
    const out = emitFieldNode(node, profile)
    expect(out.template).toBe(
      [
        `<!-- lc:node=n1 type=select field=city -->`,
        `<uni-forms-item label="城市" name="city" :error-message="errors.city">`,
        `  <view class="lc-select" @click="lcSelCityPopup?.open()">`,
        `    <text :class="{ 'lc-select__placeholder': !lcSelCityLabel }">{{ lcSelCityLabel || '请选择' }}</text>`,
        `  </view>`,
        `  <uni-popup ref="lcSelCityPopup" type="bottom">`,
        `    <view class="lc-select-sheet">`,
        `      <uni-search-bar v-model="lcSelCityKeyword" class="lc-select-sheet__search" placeholder="搜索" cancel-button="none" />`,
        `      <scroll-view scroll-y class="lc-select-sheet__options">`,
        `        <view v-for="opt in lcSelCityOptions" :key="opt.value" class="lc-select-sheet__option" @click="lcSelCityPick(opt)">`,
        `          <text>{{ opt.label }}</text>`,
        `          <uni-icons v-if="opt.value === form.city" type="checkmarkempty" size="18" />`,
        `        </view>`,
        `      </scroll-view>`,
        `    </view>`,
        `  </uni-popup>`,
        `</uni-forms-item>`,
      ].join('\n'),
    )
    expect(out.script).toEqual([
      `const lcSelCityPopup = ref()`,
      `const lcSelCityKeyword = ref('')`,
      `const lcSelCityLabel = computed(() => cityConfig.options.find((o) => o.value === form.city)?.label ?? '')`,
      `const lcSelCityOptions = computed(() => {`,
      `  const k = lcSelCityKeyword.value.trim()`,
      `  return k ? cityConfig.options.filter((o) => String(o.label).includes(k)) : cityConfig.options`,
      `})`,
      `function lcSelCityPick(opt: { value: unknown }) {`,
      `  form.city = opt.value`,
      `  lcSelCityKeyword.value = ''`,
      `  lcSelCityPopup.value?.close()`,
      `}`,
    ])
    expect(out.imports).toContain(`import { ref, computed } from 'vue'`)
  })

  it('component-map 登记：select 白名单含 clearable→clear 改名，multiple/filterable 不透传', async () => {
    const { UNIAPP_COMPONENT_MAP } = await import('../../component-map')
    expect(UNIAPP_COMPONENT_MAP.select.props).toEqual({ placeholder: true, clearable: 'clear', disabled: true })
  })
})
