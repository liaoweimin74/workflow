// ----- Task 3-a: AreaPicker 组件测试 -----
// npx vitest run src/components/business/__tests__/AreaPicker.test.ts
//
// 用小体量确定性数据 mock china-area-data（覆盖真实包的四类边界：
// 直辖市二级占位归一 / 重庆同名歧义消解 / 三级空壳'市辖区'剔除 / 两级行政区）。

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import AreaPicker from '../AreaPicker.vue'

vi.mock('china-area-data', () => ({
  default: {
    '86': { '110000': '北京市', '420000': '湖北省', '500000': '重庆市', '620000': '甘肃省' },
    '110000': { '110100': '市辖区' },
    '110100': { '110101': '东城区', '110102': '西城区' },
    '420000': { '420100': '武汉市' },
    '420100': { '420101': '市辖区', '420102': '江岸区', '420103': '江汉区' },
    '500000': { '500100': '市辖区', '500200': '县' },
    '500100': { '500101': '渝中区' },
    '500200': { '500229': '城口县' },
    '620000': { '620200': '嘉峪关市' },
    '620200': { '620201': '市辖区' },
  },
}))

function createWrapper(props: any = {}) {
  return mount(AreaPicker, {
    props: {
      modelValue: '',
      ...props,
    },
    global: { plugins: [ElementPlus] },
  })
}

function cascaderOf(wrapper: any) {
  return wrapper.findComponent({ name: 'ElCascader' })
}

describe('AreaPicker — 基础渲染', () => {
  it('渲染级联选择器并构建省市区选项', () => {
    const wrapper = createWrapper()
    const cascader = cascaderOf(wrapper)
    expect(cascader.exists()).toBe(true)
    const options = cascader.props('options')
    expect(options).toHaveLength(4)
    expect(options.map((o: any) => o.label)).toContain('湖北省')
  })

  it('显示 placeholder', () => {
    const wrapper = createWrapper({ placeholder: '请选择地址' })
    expect(wrapper.find('input').attributes('placeholder')).toBe('请选择地址')
  })

  it('props 透传：disabled / size / showAllLevels', () => {
    const wrapper = createWrapper({ disabled: true, size: 'small', showAllLevels: false })
    const cascader = cascaderOf(wrapper)
    expect(cascader.props('disabled')).toBe(true)
    expect(cascader.props('size')).toBe('small')
    expect(cascader.props('showAllLevels')).toBe(false)
  })

  it('默认值：clearable / showAllLevels 开启', () => {
    const cascader = cascaderOf(createWrapper())
    expect(cascader.props('clearable')).toBe(true)
    expect(cascader.props('showAllLevels')).toBe(true)
  })
})

describe('AreaPicker — 数据归一化', () => {
  it('直辖市二级占位「市辖区」归一为省名', () => {
    const options = cascaderOf(createWrapper()).props('options')
    const beijing = options.find((o: any) => o.label === '北京市')
    expect(beijing.children).toHaveLength(1)
    expect(beijing.children[0].label).toBe('北京市')
    expect(beijing.children[0].children.map((d: any) => d.label)).toEqual(['东城区', '西城区'])
    expect(beijing.children[0].children[0].leaf).toBe(true)
  })

  it('三级遗留空壳「市辖区」被剔除，剔除后无子级的市成为叶子（嘉峪关）', () => {
    const options = cascaderOf(createWrapper()).props('options')
    const wuhan = options.find((o: any) => o.label === '湖北省').children[0]
    // 420101 市辖区 被剔除，仅剩真实区
    expect(wuhan.children.map((d: any) => d.label)).toEqual(['江岸区', '江汉区'])
    const jayuguan = options.find((o: any) => o.label === '甘肃省').children[0]
    expect(jayuguan.label).toBe('嘉峪关市')
    expect(jayuguan.leaf).toBe(true)
    expect(jayuguan.children).toBeUndefined()
  })

  it('仅叶子节点可选（非叶子不带 leaf 标记）', () => {
    const options = cascaderOf(createWrapper()).props('options')
    const hubei = options.find((o: any) => o.label === '湖北省')
    expect(hubei.leaf).toBeUndefined()
    expect(hubei.children[0].leaf).toBeUndefined()
  })
})

describe('AreaPicker — 值回填（文本反查 code 路径）', () => {
  it('普通省市回填', () => {
    const cascader = cascaderOf(createWrapper({ modelValue: '湖北省/武汉市/江岸区' }))
    expect(cascader.props('modelValue')).toEqual(['420000', '420100', '420102'])
  })

  it('直辖市回填（归一化文本）', () => {
    const cascader = cascaderOf(createWrapper({ modelValue: '北京市/北京市/东城区' }))
    expect(cascader.props('modelValue')).toEqual(['110000', '110100', '110101'])
  })

  it('重庆同名歧义由三级名称消解（市辖区 vs 县）', () => {
    const cascader = cascaderOf(createWrapper({ modelValue: '重庆市/重庆市/城口县' }))
    // '县' 归一为 '重庆市'，两个同名二级节点靠三级 '城口县' 命中 500200 分支
    expect(cascader.props('modelValue')).toEqual(['500000', '500200', '500229'])
  })

  it('两级地区文本回填', () => {
    const cascader = cascaderOf(createWrapper({ modelValue: '甘肃省/嘉峪关市' }))
    expect(cascader.props('modelValue')).toEqual(['620000', '620200'])
  })

  it('无法反查的历史值：显示为空但不崩、原值不丢', () => {
    const wrapper = createWrapper({ modelValue: '火星/默认基地' })
    expect(cascaderOf(wrapper).props('modelValue')).toEqual([])
    expect(wrapper.props('modelValue')).toBe('火星/默认基地')
  })

  it('空值回填为空路径', () => {
    const cascader = cascaderOf(createWrapper({ modelValue: '' }))
    expect(cascader.props('modelValue')).toEqual([])
  })
})

describe('AreaPicker — 变更事件（emit 拼接文本）', () => {
  it('选择叶子节点 → emit 省/市/区 拼接文本', async () => {
    const wrapper = createWrapper()
    cascaderOf(wrapper).vm.$emit('update:modelValue', ['420000', '420100', '420102'])
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['湖北省/武汉市/江岸区'])
    expect(wrapper.emitted('change')[0]).toEqual(['湖北省/武汉市/江岸区'])
  })

  it('直辖市选择 → 占位层归一后的文本（北京市/北京市/东城区）', async () => {
    const wrapper = createWrapper()
    cascaderOf(wrapper).vm.$emit('update:modelValue', ['110000', '110100', '110101'])
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['北京市/北京市/东城区'])
  })

  it('两级地区选择 → 两段文本', async () => {
    const wrapper = createWrapper()
    cascaderOf(wrapper).vm.$emit('update:modelValue', ['620000', '620200'])
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['甘肃省/嘉峪关市'])
  })

  it('清空 → emit 空字符串', async () => {
    const wrapper = createWrapper({ modelValue: '湖北省/武汉市/江岸区' })
    cascaderOf(wrapper).vm.$emit('update:modelValue', null)
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([''])
    expect(wrapper.emitted('change')[0]).toEqual([''])
  })
})
