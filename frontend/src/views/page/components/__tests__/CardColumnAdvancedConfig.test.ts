// ----- TDD: CardColumnAdvancedConfig 卡片字段高级配置 · 严格五行布局 -----
// npx vitest run src/views/page/components/__tests__/CardColumnAdvancedConfig.test.ts

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import CardColumnAdvancedConfig from '../CardColumnAdvancedConfig.vue'

interface CardColumn {
  key: string
  label: string
  role?: string
  valueType?: string
  align?: 'left' | 'center' | 'right'
  fontFamily?: string
  fontSize?: number
  fontWeight?: string | number
  fontColor?: string
  showLabel?: boolean
  labelPosition?: 'left' | 'right' | 'top'
  style?: string
}

const baseColumn: CardColumn = { key: 'name', label: '姓名' }

function createWrapper(column: CardColumn | null = baseColumn) {
  return mount(CardColumnAdvancedConfig, {
    props: { visible: true, column },
    global: { plugins: [ElementPlus] },
  })
}

function rowLabels(wrapper: ReturnType<typeof createWrapper>): string[][] {
  return wrapper.findAll('.cfg-row').map((row) =>
    (row.findAll('.cfg-label') ?? []).map((el) => el.text()),
  )
}

describe('CardColumnAdvancedConfig — 严格五行布局', () => {
  it('渲染恰好 5 个配置行（每行对应界面上的一行）', async () => {
    const wrapper = createWrapper()
    await nextTick()
    expect(wrapper.findAll('.cfg-row').length).toBe(5)
    wrapper.unmount()
  })

  it('各行字段排列符合规范顺序', async () => {
    const wrapper = createWrapper()
    await nextTick()
    expect(rowLabels(wrapper)).toEqual([
      ['角色'], // 行1：角色
      ['值类型', '对齐'], // 行2：值类型 + 对齐
      ['字体', '字号', '字重', '颜色'], // 行3：字体 + 字号 + 字重 + 颜色
      ['显示标签', '标签位置'], // 行4：显示标签 + 标签位置
      ['样式语法'], // 行5：样式语法
    ])
    wrapper.unmount()
  })

  it('第3行包含 4 个等宽（quarter）输入项', async () => {
    const wrapper = createWrapper()
    await nextTick()
    const rows = wrapper.findAll('.cfg-row')
    expect(rows[2].findAll('.cfg-field-quarter').length).toBe(4)
    expect(rows[2].findAll('.cfg-field-half').length).toBe(0)
    wrapper.unmount()
  })
})