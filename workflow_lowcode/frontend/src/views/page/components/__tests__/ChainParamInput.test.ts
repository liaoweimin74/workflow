// ----- TDD: ChainParamInput 动作链参数值输入（脚本形态走 CM6 编辑器）-----
// npx vitest run src/views/page/components/__tests__/ChainParamInput.test.ts

import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import type { EditorView } from '@codemirror/view'
import ChainParamInput from '../ChainParamInput.vue'
import ExpressionEditor from '@/components/expression/ExpressionEditor.vue'
import { setChainParamContextProvider, resetChainParamContextProvider } from '../chainParamContext'

function createWrapper(props: Record<string, unknown> = {}) {
  return mount(ChainParamInput, {
    props: { modelValue: '', kind: 'free', ...props },
    global: { plugins: [ElementPlus] },
  })
}

afterEach(() => {
  resetChainParamContextProvider()
  document.body.innerHTML = ''
})

describe('ChainParamInput', () => {
  it('free 形态渲染单行输入框并显示 placeholder', async () => {
    const wrapper = createWrapper({ placeholder: '值，支持 $row.xxx' })
    await nextTick()
    expect(wrapper.find('.cm-content').exists()).toBe(false)
    const input = wrapper.find('input')
    expect(input.exists()).toBe(true)
    expect(input.attributes('placeholder')).toBe('值，支持 $row.xxx')
    wrapper.unmount()
  })

  it('free 形态输入时 emit update:modelValue', async () => {
    const wrapper = createWrapper()
    await wrapper.find('input').setValue('abc')
    const emitted = wrapper.emitted('update:modelValue') as unknown[][]
    expect(emitted.at(-1)![0]).toBe('abc')
    wrapper.unmount()
  })

  it('script 形态渲染 CodeMirror 编辑器而非单行输入框', async () => {
    const wrapper = createWrapper({ kind: 'script', modelValue: 'ctx.set("a", 1)' })
    await nextTick()
    expect(wrapper.find('.cm-content').exists()).toBe(true)
    expect(wrapper.find('.cm-content').text()).toContain('ctx.set(')
    wrapper.unmount()
  })

  it('script 形态编辑文档后 emit update:modelValue', async () => {
    const wrapper = createWrapper({ kind: 'script' })
    await nextTick()
    const ed = wrapper.findComponent(ExpressionEditor)
    // script setup 的 defineExpose 成员经内部实例 exposed 访问
    const exposed = (ed.vm.$ as unknown as { exposed: { getView: () => EditorView } }).exposed
    const view = exposed.getView()
    view.dispatch({ changes: { from: 0, to: 0, insert: 'x = 1' } })
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue') as unknown[][]
    expect(emitted.at(-1)![0]).toBe('x = 1')
    wrapper.unmount()
  })

  it('options 非空渲染枚举下拉，选定后 emit 对应值', async () => {
    const wrapper = createWrapper({ options: ['info', 'success', 'warning', 'error'] })
    // el-select 下拉 teleport 到 body，需挂到 document 才能查到选项
    await nextTick()
    expect(wrapper.find('.el-select').exists()).toBe(true)
    await wrapper.find('.el-select__wrapper').trigger('click')
    await nextTick()
    const opt = [...document.querySelectorAll('.el-select-dropdown__item')].find(
      (o) => o.textContent?.trim() === 'success',
    )
    expect(opt).toBeTruthy()
    opt!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue') as unknown[][]
    expect(emitted.at(-1)![0]).toBe('success')
    wrapper.unmount()
  })

  it('options 为空回落自由输入（无下拉）', async () => {
    const wrapper = createWrapper({ options: [] })
    await nextTick()
    expect(wrapper.find('.el-select').exists()).toBe(false)
    expect(wrapper.find('input').exists()).toBe(true)
    wrapper.unmount()
  })

  it('target 形态渲染容器候选下拉（可搜索可手建），选定 emit 容器地址', async () => {
    setChainParamContextProvider(() => ({
      containerTargets: [
        { value: 'FC1', label: '订单编辑（FC1）' },
        { value: 'FC2', label: '订单查看（FC2）' },
      ],
      rowFields: [],
    }))
    const wrapper = createWrapper({ kind: 'target', modelValue: 'FC1' })
    await nextTick()
    const select = wrapper.find('.el-select')
    expect(select.exists()).toBe(true)
    // filterable 实现下选中标签渲染在 .el-select__placeholder（input 只承载过滤输入）
    expect(select.find('.el-select__placeholder').text()).toBe('订单编辑（FC1）')
    await select.trigger('click')
    await nextTick()
    const opts = [...document.querySelectorAll('.el-select-dropdown__item')].map((o) =>
      o.textContent?.trim(),
    )
    expect(opts).toEqual(['订单编辑（FC1）', '订单查看（FC2）'])
    wrapper.unmount()
  })

  it('free 形态提供 $row. 变量插入：未聚焦时追加到末尾', async () => {
    setChainParamContextProvider(() => ({ containerTargets: [], rowFields: ['status', 'amount'] }))
    const wrapper = createWrapper({ modelValue: 'x = ' })
    await nextTick()
    const btn = wrapper.find('.chain-param-var-btn')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await nextTick()
    const item = [...document.querySelectorAll('.el-dropdown-menu__item')].find((o) =>
      o.textContent?.includes('$row.status'),
    )
    expect(item).toBeTruthy()
    item!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue') as unknown[][]
    expect(emitted.at(-1)![0]).toBe('x = $row.status')
    wrapper.unmount()
  })

  it('free 形态无行字段时不渲染变量按钮（保持原布局）', async () => {
    const wrapper = createWrapper()
    await nextTick()
    expect(wrapper.find('.chain-param-var-btn').exists()).toBe(false)
    wrapper.unmount()
  })

  it('script 形态向编辑器传沙箱上下文补全（root 键 + row.行字段）', async () => {
    setChainParamContextProvider(() => ({ containerTargets: [], rowFields: ['status'] }))
    const wrapper = createWrapper({ kind: 'script' })
    await nextTick()
    const ed = wrapper.findComponent(ExpressionEditor)
    const variables = ed.props('variables') as { name: string; children?: { name: string }[] }[]
    const names = variables.map((v) => v.name)
    for (const key of ['row', 'params', 'selectedRows', 'ds', 'api', 'actions', '$']) {
      expect(names).toContain(key)
    }
    expect(variables.find((v) => v.name === 'row')?.children?.map((c) => c.name)).toEqual([
      'row.status',
    ])
    // 结构化上下文给出方法路径（ds./actions./api. 即输即补）
    const dsChildren = variables.find((v) => v.name === 'ds')?.children?.map((c) => c.name)
    expect(dsChildren).toEqual(['ds.query', 'ds.detail', 'ds.create', 'ds.update', 'ds.remove'])
    expect(
      variables.find((v) => v.name === 'actions')?.children?.map((c) => c.name),
    ).toContain('actions.refresh')
    wrapper.unmount()
  })

  it('script 形态附加 $row. 模板补全源（匹配 $row 前缀时给出字段路径）', async () => {
    setChainParamContextProvider(() => ({ containerTargets: [], rowFields: ['status'] }))
    const wrapper = createWrapper({ kind: 'script' })
    await nextTick()
    const ed = wrapper.findComponent(ExpressionEditor)
    const source = ed.props('customSource') as
      | ((ctx: unknown) => { from: number; options: { label: string }[] } | null)
      | undefined
    expect(typeof source).toBe('function')
    // 模拟光标前文本 "$row."：应给出 $row.status 候选
    const fakeCtx = {
      pos: 5,
      matchBefore: () => ({ from: 0, to: 5 }),
      state: { sliceDoc: () => '$row.' },
    }
    const result = source!(fakeCtx)
    expect(result?.options.map((o) => o.label)).toEqual(['$row.status'])
    // 普通标识符上下文不处理（交给变量补全源）
    const plainCtx = {
      pos: 2,
      matchBefore: () => null,
      state: { sliceDoc: () => 'ro' },
    }
    expect(source!(plainCtx)).toBeNull()
    wrapper.unmount()
  })
})
