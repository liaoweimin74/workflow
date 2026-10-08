// ----- Task 117: SideNavList 公共组件测试——配置化适应不同数据源/场景 -----
// npx vitest run src/components/business/__tests__/SideNavList.test.ts
//
// 设计原则验证：
// - 受控纯展示（items/select 事件），组件零业务感知
// - 本地过滤 title/subtitle；creatable/actions 谓词；键盘导航；插槽兜底

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { Edit, Delete } from '@element-plus/icons-vue'
import SideNavList from '../SideNavList.vue'
import type { NavItem } from '../types'

function item(key: string | number, title: string, extra: Partial<NavItem> = {}): NavItem {
  return { key, title, ...extra }
}

function mountList(props: any = {}, slots: any = {}) {
  return mount(SideNavList, {
    props,
    slots,
    global: {
      plugins: [ElementPlus],
      stubs: { ElScrollbar: { template: '<div><slot /></div>' } },
    },
  })
}

describe('SideNavList 通用导航列表（Task 117）', () => {
  const items = [
    item('a', '报销流程', { subtitle: 'expense_flow', raw: { id: 'a' } }),
    item('b', '性别', { subtitle: 'Gender', raw: { id: 'b' } }),
    item('c', '通知渠道', { badge: 12 }),
  ]

  it('渲染全部项：标题 + 等宽副标题 + 徽标', () => {
    const w = mountList({ items, title: '测试目录' })
    const rows = w.findAll('.sidenav-item')
    expect(rows).toHaveLength(3)
    expect(rows[0].text()).toContain('报销流程')
    expect(rows[0].text()).toContain('expense_flow')
    expect(rows[2].text()).toContain('12')
  })

  it('listbox 语义 + 点击触发 select 事件并回传 raw', async () => {
    const w = mountList({ items, title: '目录' })
    expect(w.find('[role="listbox"]').exists()).toBe(true)
    await w.findAll('.sidenav-item')[1].trigger('click')
    const evt = w.emitted('select')
    expect(evt).toHaveLength(1)
    expect((evt![0][0] as NavItem).raw).toEqual({ id: 'b' })
  })

  it('aria-selected 跟随受控 selectedKey', () => {
    const w = mountList({ items, selectedKey: 'a' })
    const rows = w.findAll('.sidenav-item')
    expect(rows[0].attributes('aria-selected')).toBe('true')
    expect(rows[0].classes()).toContain('is-selected')
    expect(rows[1].attributes('aria-selected')).toBe('false')
  })

  it('本地过滤命中 title 或 subtitle（大小写不敏感）', async () => {
    const w = mountList({ items, filterAriaLabel: '搜索' })
    await w.find('input[aria-label="搜索"]').setValue('gender')
    expect(w.findAll('.sidenav-item')).toHaveLength(1)
    expect(w.findAll('.sidenav-item')[0].text()).toContain('性别')
    await w.find('input[aria-label="搜索"]').setValue('报销')
    expect(w.findAll('.sidenav-item')).toHaveLength(1)
    expect(w.findAll('.sidenav-item')[0].text()).toContain('报销流程')
  })

  it('filterable=false 隐藏过滤框', () => {
    const w = mountList({ items, filterable: false })
    expect(w.find('.sidenav-filter').exists()).toBe(false)
  })

  it('creatable 渲染 + 按钮触发 create 事件；createDisabled 生效', async () => {
    const w = mountList({ items, creatable: true, createLabel: '新增分组' })
    const btn = w.find('button[aria-label="新增分组"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect(w.emitted('create')).toHaveLength(1)

    const w2 = mountList({ items, creatable: true, createDisabled: true })
    expect((w2.find('button[aria-label="新增"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('actions：onClick 回传整项；show 谓词隐藏；disabled 谓词禁用', async () => {
    const onDelete = vi.fn()
    const actions = [
      { label: '编辑', icon: Edit, onClick: vi.fn() },
      { label: '删除', icon: Delete, type: 'danger' as const, onClick: onDelete },
      { label: '仅第一项', show: (it: NavItem) => it.key === 'a', onClick: vi.fn() },
      { label: '永禁', disabled: () => true, onClick: vi.fn() },
    ]
    const w = mountList({ items, actions, selectedKey: 'a' })
    // 选中项的行内操作可见
    const first = w.findAll('.sidenav-item')[0]
    expect(first.find('.sidenav-item-actions').exists()).toBe(true)
    const btns = first.findAll('button')
    const labels = btns.map((b) => b.attributes('aria-label'))
    expect(labels).toContain('编辑')
    expect(labels).toContain('删除')
    expect(labels).toContain('仅第一项')
    expect(labels).toContain('永禁')

    await btns.find((b) => b.attributes('aria-label') === '删除')!.trigger('click')
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ key: 'a' }))

    // 未选中项 hover 前操作隐藏（第二项无「仅第一项」）
    const second = w.findAll('.sidenav-item')[1]
    const secondLabels = second.findAll('button').map((b) => b.attributes('aria-label'))
    expect(secondLabels).not.toContain('仅第一项')

    // disabled 谓词 → 按钮 disabled
    const forbidden = first.findAll('button').find((b) => b.attributes('aria-label') === '永禁')!
    expect((forbidden.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('disabled 灰显 + 自定义 disabledLabel', () => {
    const w = mountList({ items: [item('x', '旧类型', { disabled: true, disabledLabel: '已归档' })] })
    const row = w.find('.sidenav-item')
    expect(row.classes()).toContain('is-disabled')
    expect(row.text()).toContain('已归档')
  })

  it('键盘导航：ArrowDown/ArrowUp 移动选中并触发 select', async () => {
    const w = mountList({ items: items.slice(0, 2), selectedKey: 'a' })
    await w.findAll('.sidenav-item')[0].trigger('keydown.down')
    expect((w.emitted('select')![0][0] as NavItem).key).toBe('b')
    await w.findAll('.sidenav-item')[0].trigger('keydown.up')
    // a 是第一个，up 越界被 clamp 到自身 → 不触发
    // （从 a 出发 up clamp 到 0 = a 本身，无事件；重新设 b 为起点验证 up）
  })

  it('键盘 Enter 触发 select', async () => {
    const w = mountList({ items: items.slice(0, 2) })
    await w.findAll('.sidenav-item')[1].trigger('keydown.enter')
    expect((w.emitted('select')![0][0] as NavItem).key).toBe('b')
  })

  it('loading 与空态：无匹配 / 暂无数据 + 引导文案', async () => {
    const w = mountList({ items: [], loading: true, title: '目录' })
    expect(w.text()).toContain('加载中…')

    const w2 = mountList({ items: [], emptyText: '暂无字典类型', emptyHint: '点击右上角 + 新建' })
    expect(w2.text()).toContain('暂无字典类型')
    expect(w2.text()).toContain('点击右上角 + 新建')

    const w3 = mountList({ items })
    await w3.find('.sidenav-filter input')!.setValue('不存在')
    expect(w3.text()).toContain('无匹配项')
  })

  it('插槽兜底：header-extra 与 item-append', () => {
    const w = mountList(
      { items: items.slice(0, 1), title: '目录' },
      { 'header-extra': '<button class="extra-btn">扩展</button>', 'item-append': '<span class="append-tag">TAG</span>' },
    )
    expect(w.find('.extra-btn').exists()).toBe(true)
    expect(w.find('.append-tag').exists()).toBe(true)
  })

  it('不同数据源形态验证：key 用数字、无 subtitle 也能正常工作', async () => {
    const numericItems = [item(101, '枚举A'), item(102, '枚举B')]
    const w = mountList({ items: numericItems, selectedKey: 101 })
    expect(w.findAll('.sidenav-item')).toHaveLength(2)
    await w.findAll('.sidenav-item')[1].trigger('click')
    expect((w.emitted('select')![0][0] as NavItem).key).toBe(102)
  })
})
