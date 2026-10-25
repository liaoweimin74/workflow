// ----- Task 5.2: formContainer 容器段（uni-popup + 三键 + 字段族装配）-----
// golden 即规格（合成最小容器页）。对位 web 容器段（emit.ts 246-299 + 832-849）：
//  · uni-popup 底部弹层承载表单（web el-dialog/el-drawer 的 uni 对位），tabTitle 出弹层头；
//  · 字段子节点走 emitFieldNode（v-model= form.<field> 由 parse 定好）；无 uniapp 映射的
//    字段落 lc:todo + unsupported（UniFieldFragment.unsupported 通道）；
//  · 三键 footer：readonly → 关闭，else 取消 + 确定（镜像 web 841-845；平铺 v-if，不用
//    template v-else 包裹——MP 编译器对 template 分支合并有裁剪风险）；
//  · 脚本段：formRules（叶字段全 ''、嵌套按 shape 给 init，镜像 web fields 推导 112-137）
//    → useUniForm（model 别名 form + errors/validate/reset：字段片段 :error-message 依赖）；
//  · openContainer（mode/readonly/recordId/version 置值 → 复位 → 开弹层 → 有 id 则
//    dsApi.get 回填声明过的字段 + version，镜像 web 同名函数）/closeContainer/
//    confirmSave（validate 不过 toast 不提交 → 按 mode create/update → 关弹层 → 刷新首列表）。
//    CRUD 走 uniDataApi（refId 构造期定死=首源，镜像 web api.ts 单 REF_ID 口径）。
// npx vitest run src/views/page/codegen/__tests__/uni/emit-container.test.ts

import { describe, expect, it } from 'vitest'

import type { IrNode, IrPage } from '../../ir'
import { parseIr } from '../../parse'
import { emitContainerNode } from '../../uni/emit-container'
import cardlist from '../fixtures/corpus/cardlist_test.json'

const clone = (v: unknown) => JSON.parse(JSON.stringify(v))

function containerOf(schema: any): { node: IrNode; ir: IrPage } {
  const ir = parseIr(schema, { pageKey: 'golden', pageName: 'golden', exportedAt: 'emit-container' })
  const node = ir.nodes.find((n) => n.artifact.type === 'formContainer')
  if (!node) throw new Error('页面应含 formContainer 节点')
  return { node, ir }
}

/** 合成最小容器页：首列表（confirmSave 刷新目标）+ 容器（必填 input + 普通 textarea） */
const synthetic = () =>
  containerOf({
    rule: [
      {
        type: 'page-list-cards',
        field: 'tasks',
        props: { dataSourceId: 'ds_task', columns: [{ prop: 'title', label: '标题' }] },
      },
      {
        type: 'formContainer',
        field: 'Fedit1',
        props: {
          displayMode: 'dialog',
          dialogWidth: '800px',
          tabTitle: '编辑记录',
          dataSourceId: 'ds_task',
          rule: [
            { type: 'input', field: 'name', title: '姓名', $required: true },
            { type: 'textarea', field: 'remark', title: '备注' },
          ],
        },
      },
    ],
    option: {},
    dataSources: [{ id: 'ds_task', refId: 'ref_task_1' }],
    actions: [],
  })

describe('emitContainerNode — 合成最小容器（golden 即规格）', () => {
  it('模板：uni-popup 弹层 + 弹层头（tabTitle）+ 字段片段 + 三键 footer（readonly 分支平铺 v-if）', () => {
    const { node, ir } = synthetic()
    const frag = emitContainerNode(node, ir)
    expect(frag).not.toBeNull()
    expect(frag!.template).toBe(
      [
        `<!-- ${node.artifact.anchor} -->`,
        '<uni-popup ref="formPopup" type="bottom" class="lc-form-popup" background-color="#fff">',
        '  <view class="lc-form-popup__head">编辑记录</view>',
        '  <view class="lc-form-popup__body">',
        '    <!-- lc:node=n2.f1 type=input field=name -->',
        '    <uni-forms-item label="姓名" name="name" required :error-message="errors.name">',
        '      <uni-easyinput v-model="form.name" />',
        '    </uni-forms-item>',
        '    <!-- lc:node=n2.f2 type=textarea field=remark -->',
        '    <uni-forms-item label="备注" name="remark" :error-message="errors.remark">',
        '      <uni-easyinput v-model="form.remark" type="textarea" />',
        '    </uni-forms-item>',
        '  </view>',
        '  <view class="lc-form-popup__footer">',
        '    <button v-if="containerReadonly" type="primary" @click="closeContainer">关闭</button>',
        '    <button v-if="!containerReadonly" @click="closeContainer">取消</button>',
        '    <button v-if="!containerReadonly" type="primary" @click="confirmSave">确定</button>',
        '  </view>',
        '</uni-popup>',
      ].join('\n'),
    )
  })

  it('脚本：formRules（required 落 props）+ useUniForm(model:form/errors/validate/reset) + uniDataApi + 三函数 + 首列表刷新', () => {
    const { node, ir } = synthetic()
    const frag = emitContainerNode(node, ir)
    expect(frag).not.toBeNull()
    expect(frag!.script).toEqual([
      'const formRules = [',
      '  {',
      "    field: 'name',",
      "    title: '姓名',",
      '    props: {',
      '      required: true',
      '    }',
      '  },',
      '  {',
      "    field: 'remark',",
      "    title: '备注'",
      '  }',
      ']',
      'const { model: form, errors, validate, reset: formReset } = useUniForm(formRules)',
      'const dsApi = uniDataApi({ refId: ds.refId })',
      'const formPopup = ref<{ open: () => void; close: () => void } | null>(null)',
      'const containerReadonly = ref(false)',
      "const containerMode = ref<'create' | 'edit' | 'view'>('create')",
      "const containerRecordId = ref('')",
      'const containerVersion = ref<number | undefined>(undefined)',
      '/** lc:node=n2 → 打开容器并取记录（原总线 load-record / open-container 的合并语义） */',
      "async function openContainer(recordId: string, readonly: boolean, mode: 'create' | 'edit' | 'view') {",
      '  containerMode.value = mode',
      '  containerReadonly.value = readonly',
      '  containerRecordId.value = recordId',
      '  containerVersion.value = undefined',
      '  formReset()',
      '  formPopup.value?.open()',
      '  if (recordId) {',
      '    const res = await dsApi.get(recordId)',
      '    const vo = (res.data ?? {}) as { version?: number; data?: Record<string, unknown> }',
      '    const record = vo.data ?? {}',
      '    // 只回填容器声明过的字段（对齐 web DsBindingEngine 回填口径）',
      '    Object.keys(form).forEach((k) => {',
      '      if (k in record) form[k] = record[k]',
      '    })',
      "    containerVersion.value = typeof vo.version === 'number' ? vo.version : undefined",
      '  }',
      '}',
      'function closeContainer() {',
      '  formPopup.value?.close()',
      '}',
      'async function confirmSave() {',
      '  if (!validate()) {',
      "    uni.showToast({ title: '请检查表单填写', icon: 'none' })",
      '    return',
      '  }',
      "  if (containerMode.value === 'create') {",
      '    await dsApi.create({ ...form })',
      '  } else {',
      '    await dsApi.update(containerRecordId.value, { ...form }, containerVersion.value)',
      '  }',
      '  closeContainer()',
      '  void tasksList.reload()',
      '}',
    ])
  })

  it('imports：vue ref + useUniForm + uniDataApi；合成页两字段全映射 → unsupported 为空', () => {
    const { node, ir } = synthetic()
    const frag = emitContainerNode(node, ir)
    expect(frag).not.toBeNull()
    expect(frag!.imports).toEqual([
      `import { ref } from 'vue'`,
      `import { useUniForm } from '@lc/runtime-uni/form'`,
      `import { uniDataApi } from '@lc/runtime-uni/data'`,
    ])
    expect(frag!.unsupported).toEqual([])
  })

  it('无列表节点 → confirmSave 不出刷新行（避免引用不存在的实例）', () => {
    const ir = parseIr(
      {
        rule: [
          {
            type: 'formContainer',
            field: 'Fedit1',
            props: {
              displayMode: 'dialog',
              tabTitle: '编辑记录',
              dataSourceId: 'ds_task',
              rule: [{ type: 'input', field: 'name', title: '姓名' }],
            },
          },
        ],
        option: {},
        dataSources: [{ id: 'ds_task', refId: 'ref_task_1' }],
        actions: [],
      },
      { pageKey: 'golden', pageName: 'golden', exportedAt: 'emit-container' },
    )
    const node = ir.nodes.find((n) => n.artifact.type === 'formContainer')!
    const frag = emitContainerNode(node, ir)
    expect(frag).not.toBeNull()
    expect(frag!.script.join('\n')).not.toContain('.reload()')
  })

  it('嵌套容器（group/subForm）：formRules 按 shape 给 init []/{}，不递归子字段进 rules', () => {
    const ir = parseIr(
      {
        rule: [
          {
            type: 'formContainer',
            field: 'Fedit1',
            props: {
              displayMode: 'dialog',
              tabTitle: '编辑记录',
              dataSourceId: 'ds_task',
              rule: [
                {
                  type: 'group',
                  field: 'items',
                  title: '明细',
                  props: { rule: [{ type: 'input', field: 'sku', title: 'SKU' }] },
                },
                {
                  type: 'subForm',
                  field: 'invoice',
                  title: '发票',
                  props: { rule: [{ type: 'input', field: 'title2', title: '抬头' }] },
                },
              ],
            },
          },
        ],
        option: {},
        dataSources: [{ id: 'ds_task', refId: 'ref_task_1' }],
        actions: [],
      },
      { pageKey: 'golden', pageName: 'golden', exportedAt: 'emit-container' },
    )
    const node = ir.nodes.find((n) => n.artifact.type === 'formContainer')!
    const frag = emitContainerNode(node, ir)
    expect(frag).not.toBeNull()
    const rules = frag!.script.join('\n')
    expect(rules).toContain("field: 'items'")
    expect(rules).toContain('init: []')
    expect(rules).toContain("field: 'invoice'")
    expect(rules).toContain('init: {}')
    // 子字段不进 rules（值挂在行对象/子对象上，摊平就是第二套真相——web 同口径）
    expect(rules).not.toContain("field: 'sku'")
    expect(rules).not.toContain("field: 'title2'")
  })
})

describe('emitContainerNode — 语料卡列表容器（cardlist_test.json，contains 集成）', () => {
  it('弹层头 tabTitle + 无映射字段 lc:todo + confirmSave 刷新首列表 + unsupported 登记', () => {
    const { node, ir } = containerOf(clone(cardlist))
    const frag = emitContainerNode(node, ir)
    expect(frag).not.toBeNull()
    // 弹层头：tabTitle → attr as title（attrs.el-dialog.title）
    expect(frag!.template).toContain('<view class="lc-form-popup__head">编辑记录</view>')
    // 无 uniapp 映射的字段：dataPicker 落 lc:todo（Task 11.3 装配）；LookupPicker 11.2 起
    // 真出码（只读触发框 + 底部弹层）；tableForm 6.4 起出卡片式子列表编辑器（每行序号+删除、字段纵向排）
    expect(frag!.template).toContain('<!-- lc:node=n2.f4 type=LookupPicker field=customer -->')
    expect(frag!.template).toContain('<view class="lc-lookup" @click="openLookupCustomer">')
    expect(frag!.template).toContain('<!-- lc:todo node=n2.f7 type=dataPicker field=warehouse')
    expect(frag!.template).toContain('<!-- lc:node=n2.f10 type=tableForm field=delivery_plan -->')
    expect(frag!.template).toContain('<view class="lc-nested lc-nested--table">')
    expect(frag!.template).toContain('v-for="(deliveryPlanRow, i) in form.delivery_plan || []"')
    // 首列表刷新目标（n1 卡列表实例）
    expect(frag!.script.join('\n')).toContain('void cards1792036403314List.reload()')
    // 未装配字段 → unsupported（UniFieldFragment.unsupported 通道）；带回接线只对未装配者登记
    // （LookupPicker 的 select/clear 由片段真出 handler，登记缺口就说谎了）
    expect(frag!.unsupported.some((u) => u.key === 'field-component' && u.type === 'LookupPicker')).toBe(false)
    expect(frag!.unsupported.some((u) => u.key === 'field-component' && u.type === 'dataPicker')).toBe(true)
    expect(frag!.unsupported.some((u) => u.key === 'writeback' && u.type === 'LookupPicker')).toBe(false)
  })
})
