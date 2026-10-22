// ----- TDD: 双渲染对照面板（宿主渲染 vs 出码产物渲染，同屏并排）-----
// npx vitest run src/views/page/codegen/__tests__/codegen-compare-pane.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, markRaw } from 'vue'

// 宿主渲染器整棵子树要 form-create / 数据源桩才起得来，本用例只证「对照面板把定义原样交给了它」，
// 所以把真渲染器换成桩；渲染器自身的行径由 src/views/page/__tests__/PageRendererPage.*.test.ts 守。
vi.mock('@/views/page/PageRendererPage.vue', () => ({
  default: defineComponent({
    name: 'PageRendererPage',
    props: ['definition'],
    setup(props) {
      return () => h('div', { class: 'host-stub' }, JSON.stringify((props.definition as any)?.pageKey ?? ''))
    },
  }),
}))

import CodegenComparePane from '../CodegenComparePane.vue'

const definition = { pageKey: 'cardlist_test', type: 'PAGE', schema: '{"rule":[]}' }
const ArtifactStub = markRaw(defineComponent({ setup: () => () => h('div', { class: 'artifact-stub' }, '产物') }))

const open = (props: Record<string, any>) =>
  mount(CodegenComparePane, { props: { pageKey: 'cardlist_test', definition, ...props } })

describe('CodegenComparePane', () => {
  it('左右两格：宿主侧走 PageRendererPage，产物侧挂磁盘上的产物组件', () => {
    const wrapper = open({ artifact: ArtifactStub })
    expect(wrapper.find('.codegen-compare__side--host .host-stub').exists()).toBe(true)
    expect(wrapper.find('.codegen-compare__side--artifact .artifact-stub').exists()).toBe(true)
    expect(wrapper.find('.codegen-compare__missing').exists()).toBe(false)
  })

  it('没有落盘产物时直说，并给出重新落盘的命令：不许拿空白格冒充「产物渲染不出来」', () => {
    const missing = open({ artifact: null }).find('.codegen-compare__missing')
    expect(missing.exists()).toBe(true)
    expect(missing.text()).toContain('PROBE_PAGES=cardlist_test')
    expect(missing.text()).toContain('runtime-probe.test.ts')
  })

  it('磁盘产物与本次生成不是同一份时必须警示：否则人看到的是旧产物，结论却是新报告给的', () => {
    const wrapper = open({ artifact: ArtifactStub, mismatch: ['CardlistTest.vue'] })
    const stale = wrapper.find('.codegen-compare__stale')
    expect(stale.exists()).toBe(true)
    expect(stale.text()).toContain('CardlistTest.vue')
  })

  it('一致时不出警示（对照两侧与报告同一份源码）', () => {
    expect(open({ artifact: ArtifactStub, mismatch: [] }).find('.codegen-compare__stale').exists()).toBe(false)
  })

  it('revision 变了要重挂宿主渲染器：PageRendererPage 只在挂载时读一次 definition', async () => {
    const wrapper = open({ artifact: ArtifactStub, revision: 1 })
    const before = wrapper.find('.host-stub').element
    await wrapper.setProps({ revision: 2 })
    expect(wrapper.find('.host-stub').element, '没重挂：宿主侧还是上一份定义渲染出来的').not.toBe(before)
  })
})
