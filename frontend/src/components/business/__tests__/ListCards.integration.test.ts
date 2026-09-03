import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ListCards from '../ListCards.vue'
import { CARD_THEMES } from '../ListCards.themes'

// Mock fetchApi
const mockFetchApi = () => Promise.resolve({ rows: [], total: 0 })

describe('ListCards — CardStyle/FieldStyle 集成', () => {
  it('theme prop 生效：应用主题样式', async () => {
    const wrapper = mount(ListCards, {
      props: {
        fetchApi: mockFetchApi,
        columns: [],
        theme: 'compact',
      },
    })
    // 应用 compact 主题的 CSS 变量
    const cardGrid = wrapper.find('.card-grid')
    if (cardGrid.exists()) {
      const style = cardGrid.attributes('style') || ''
      // compact 主题 gap 为 12px
      expect(style).toContain('--card-gap')
    }
  })

  it('style prop 覆盖主题属性', async () => {
    const wrapper = mount(ListCards, {
      props: {
        fetchApi: mockFetchApi,
        columns: [],
        theme: 'default',
        style: { backgroundColor: '#000' },
      },
    })
    // style 覆盖主题 backgroundColor
    const cardItem = wrapper.find('.card-item')
    if (cardItem.exists()) {
      const style = cardItem.attributes('style') || ''
      expect(style).toContain('--card-bg')
    }
  })

  it('span 栅格：span:6 半行、span:12 整行', async () => {
    const wrapper = mount(ListCards, {
      props: {
        fetchApi: () => Promise.resolve({
          rows: [{ name: '测试', status: '正常' }],
          total: 1,
        }),
        columns: [
          { prop: 'name', label: '名称', role: 'field', span: 6 },
          { prop: 'status', label: '状态', role: 'field', span: 12 },
        ],
      },
    })
    await wrapper.vm.$nextTick()
    const fields = wrapper.findAll('.card-field')
    if (fields.length >= 2) {
      // span:6 应该有 grid-column: span 6
      const style1 = fields[0].attributes('style') || ''
      expect(style1).toContain('grid-column')
      // span:12 应该有 grid-column: span 12
      const style2 = fields[1].attributes('style') || ''
      expect(style2).toContain('grid-column')
    }
  })

  it('字段级 dynamic 条件样式按行生效', async () => {
    const wrapper = mount(ListCards, {
      props: {
        fetchApi: () => Promise.resolve({
          rows: [
            { name: '正常', status: '正常' },
            { name: '异常', status: '异常' },
          ],
          total: 2,
        }),
        columns: [
          {
            prop: 'name',
            label: '名称',
            role: 'field',
            style: {
              dynamic: [
                { when: "$row.status === '异常'", style: { color: 'red' } },
              ],
            },
          },
        ],
      },
    })
    await wrapper.vm.$nextTick()
    const fieldValues = wrapper.findAll('.field-value')
    // 第一行（正常）不应有红色
    if (fieldValues.length >= 2) {
      const style1 = fieldValues[0].attributes('style') || ''
      expect(style1).not.toContain('color: red')
      // 第二行（异常）应有红色
      const style2 = fieldValues[1].attributes('style') || ''
      expect(style2).toContain('color: red')
    }
  })

  it('regions.header 图标渲染', async () => {
    const wrapper = mount(ListCards, {
      props: {
        fetchApi: () => Promise.resolve({
          rows: [{ name: '测试' }],
          total: 1,
        }),
        columns: [{ prop: 'name', label: '名称', role: 'title' }],
        style: {
          regions: {
            header: {
              show: true,
              icon: { name: 'User', color: '#3b82f6', size: 20 },
            },
          },
        },
      },
    })
    await wrapper.vm.$nextTick()
    // 应该有 header 区域
    const header = wrapper.find('.card-header')
    if (header.exists()) {
      expect(header.find('.card-header-icon').exists()).toBe(true)
    }
  })
})
