// ----- 回归：拖动落点必须取「鼠标悬停的行」，不能是被拖行自己 -----
// npx vitest run src/views/system/menu/__tests__/useMenuTreeDrag.test.ts
//
// 线上现象：不管在哪儿松手都提示「不能把菜单放到它自己上」。
// 根因：Sortable 默认在 dragover 时把被拖的 <tr> 插到悬停位置当占位符，
// 于是 closest('tr') 恒等于被拖行，hoverId === dragId。
// 修法：sort: false——Sortable 只负责起拖和 onEnd，完全不碰 DOM。

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import type { DropBand, DropTarget } from '../menuDrop'

const { create } = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('sortablejs', () => ({ default: { create } }))

import { useMenuTreeDrag } from '../useMenuTreeDrag'

interface Harness {
  tbody: HTMLElement
  rows: HTMLElement[]
  judge: ReturnType<typeof vi.fn>
  onDrop: ReturnType<typeof vi.fn>
  onRejected: ReturnType<typeof vi.fn>
  onStart: (evt: { item: HTMLElement }) => void
  onEnd: () => void
}

function makeRow(id: number, top: number): HTMLElement {
  const tr = document.createElement('tr')
  const handle = document.createElement('span')
  handle.className = 'menu-drag-handle'
  handle.setAttribute('data-menu-id', String(id))
  const td = document.createElement('td')
  td.appendChild(handle)
  tr.appendChild(td)
  // jsdom 的 getBoundingClientRect 恒为 0，而位置带要靠真实高度算，这里逐行桩掉
  tr.getBoundingClientRect = () =>
    ({ top, height: 40, bottom: top + 40, left: 0, right: 200 }) as DOMRect
  return tr
}

/** 在宿主组件里挂载 composable（它注册了 onBeforeUnmount，必须在 setup 内调用） */
async function setupHarness(): Promise<Harness> {
  document.body.innerHTML = ''
  const tbody = document.createElement('tbody')
  const rows = [makeRow(1, 0), makeRow(2, 40), makeRow(3, 80)]
  rows.forEach((tr) => tbody.appendChild(tr))
  document.body.appendChild(tbody)

  const judge = vi.fn(() => ({ ok: true, noop: false, target: { parentId: 0, index: 1 } as DropTarget }))
  const onDrop = vi.fn()
  const onRejected = vi.fn()

  const Host = defineComponent({
    setup() {
      const api = useMenuTreeDrag({ getTbody: () => tbody, judge: judge as any, onDrop, onRejected })
      api.init()
      return () => h('div')
    },
  })
  const wrapper = mount(Host)
  await wrapper.vm.$nextTick()

  const options = create.mock.calls[0][1]
  return { tbody, rows, judge, onDrop, onRejected, onStart: options.onStart, onEnd: options.onEnd }
}

/** 悬停到第 index 行、纵向 clientY 处 */
function dragOver(h: Harness, index: number, clientY: number): void {
  h.rows[index].dispatchEvent(new MouseEvent('dragover', { bubbles: true, clientY }))
}

function order(h: Harness): number[] {
  return Array.from(h.tbody.children).map(
    (tr) => Number(tr.querySelector('[data-menu-id]')!.getAttribute('data-menu-id')),
  )
}

describe('useMenuTreeDrag 落点判定', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    create.mockImplementation(() => ({ destroy: vi.fn() }))
  })

  it('绑定 Sortable 时关闭同列表排序，DOM 不会被占位符挪动', async () => {
    const h = await setupHarness()
    expect(create.mock.calls[0][1].handle).toBe('.menu-drag-handle')
    expect(create.mock.calls[0][1].sort).toBe(false)
  })

  it('悬停其他行时 judge 收到的是悬停行的 id，不是被拖行的 id', async () => {
    const h = await setupHarness()
    h.onStart({ item: h.rows[0] }) // 拖 id=1
    dragOver(h, 1, 75) // 悬停 id=2（40~80）的下边缘
    expect(h.judge).toHaveBeenCalledWith(1, 2, 'after')
  })

  it('拖动全程 tbody 行序保持不变（不出现占位符插队）', async () => {
    const h = await setupHarness()
    h.onStart({ item: h.rows[0] })
    dragOver(h, 1, 75)
    dragOver(h, 2, 95)
    h.onEnd()
    expect(order(h)).toEqual([1, 2, 3])
  })

  it('悬停在自己那一行：不判定、不标记、松手也不提交', async () => {
    const h = await setupHarness()
    h.onStart({ item: h.rows[0] })
    dragOver(h, 0, 20)
    expect(h.judge).not.toHaveBeenCalled()
    expect(h.rows[0].className).toBe('')
    h.onEnd()
    expect(h.onDrop).not.toHaveBeenCalled()
    expect(h.onRejected).not.toHaveBeenCalled()
  })

  it('位置带换算：上沿 before / 中段 into / 下沿 after', async () => {
    const h = await setupHarness()
    const bands: DropBand[] = []
    h.judge.mockImplementation((...args: any[]) => {
      bands.push(args[2] as DropBand)
      return { ok: true, noop: true }
    })
    h.onStart({ item: h.rows[0] })
    dragOver(h, 1, 45) // (45-40)/40 = 0.125
    dragOver(h, 1, 60) // 0.5
    dragOver(h, 1, 75) // 0.875
    expect(bands).toEqual(['before', 'into', 'after'])
  })

  it('合法落点松手提交 target', async () => {
    const h = await setupHarness()
    h.onStart({ item: h.rows[0] })
    dragOver(h, 1, 60)
    h.onEnd()
    expect(h.onDrop).toHaveBeenCalledWith(1, { parentId: 0, index: 1 })
  })

  it('非法落点松手给出提示，不提交', async () => {
    const h = await setupHarness()
    h.judge.mockReturnValue({ ok: false, message: '按钮必须放在菜单下' })
    h.onStart({ item: h.rows[0] })
    dragOver(h, 1, 60)
    expect(h.rows[1].className).toContain('menu-drop-invalid')
    h.onEnd()
    expect(h.onRejected).toHaveBeenCalledWith('按钮必须放在菜单下')
    expect(h.onDrop).not.toHaveBeenCalled()
  })

  it('原位（noop）落点松手不提交', async () => {
    const h = await setupHarness()
    h.judge.mockReturnValue({ ok: true, noop: true })
    h.onStart({ item: h.rows[0] })
    dragOver(h, 1, 60)
    h.onEnd()
    expect(h.onDrop).not.toHaveBeenCalled()
    expect(h.onRejected).not.toHaveBeenCalled()
  })

  it('drop 与 dragend 双双触发时只走一次完成路径', async () => {
    const h = await setupHarness()
    h.onStart({ item: h.rows[0] })
    dragOver(h, 1, 60)
    h.onEnd()
    h.onEnd()
    expect(h.onDrop).toHaveBeenCalledTimes(1)
  })

  it('高亮标记只留在当前悬停行，松手即清除', async () => {
    const h = await setupHarness()
    h.onStart({ item: h.rows[0] })
    dragOver(h, 1, 60)
    expect(h.rows[1].className).toContain('menu-drop-into')
    dragOver(h, 2, 85) // (85-80)/40 = 0.125 → 上沿
    expect(h.rows[1].className).not.toContain('menu-drop-into')
    expect(h.rows[2].className).toContain('menu-drop-before')
    h.onEnd()
    expect(h.rows[2].className).not.toContain('menu-drop-before')
  })

  it('无更新权限时不绑定 Sortable', async () => {
    document.body.innerHTML = ''
    const tbody = document.createElement('tbody')
    tbody.appendChild(makeRow(1, 0))
    document.body.appendChild(tbody)
    const Host = defineComponent({
      setup() {
        useMenuTreeDrag({
          getTbody: () => tbody,
          judge: vi.fn() as any,
          onDrop: vi.fn(),
          onRejected: vi.fn(),
          disabled: () => true,
        }).init()
        return () => h('div')
      },
    })
    mount(Host)
    expect(create).not.toHaveBeenCalled()
  })
})
