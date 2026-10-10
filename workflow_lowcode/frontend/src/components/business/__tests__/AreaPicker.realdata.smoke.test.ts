// 临时冒烟测试：AreaPicker 对真实 china-area-data（@5.0.1）的往返校验（跑完即删）
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import AreaPicker from '../AreaPicker.vue'

function mountWith(modelValue: string) {
  return mount(AreaPicker, { props: { modelValue }, global: { plugins: [ElementPlus] } })
}
function cascaderOf(wrapper: any) {
  return wrapper.findComponent({ name: 'ElCascader' })
}

describe('AreaPicker 真实数据冒烟', () => {
  it('构建 34 省级选项', () => {
    expect(cascaderOf(mountWith('')).props('options')).toHaveLength(34)
  })

  it.each([
    ['湖北省/武汉市/江岸区', ['420000', '420100', '420102']],
    ['北京市/北京市/东城区', ['110000', '110100', '110101']],
    ['重庆市/重庆市/城口县', ['500000', '500200', '500229']],
    ['甘肃省/嘉峪关市', ['620000', '620200']],
    ['广东省/东莞市/长安镇', ['440000', '441900', '441900119']],
  ])('%s 回填 %j', (text, codes) => {
    expect(cascaderOf(mountWith(text)).props('modelValue')).toEqual(codes)
  })

  it.each([
    [['420000', '420100', '420102'], '湖北省/武汉市/江岸区'],
    [['110000', '110100', '110101'], '北京市/北京市/东城区'],
    [['500000', '500100', '500103'], '重庆市/重庆市/渝中区'],
    [['820000', '820001'], '澳门特别行政区/花地瑪堂區'],
    [['440000', '441900', '441900119'], '广东省/东莞市/长安镇'],
  ])('选择 %j → %s', async (codes, text) => {
    const wrapper = mountWith('')
    cascaderOf(wrapper).vm.$emit('update:modelValue', codes)
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([text])
  })
})
