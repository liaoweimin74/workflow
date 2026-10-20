// ----- 字典项行拖动：只用 Sortable 起拖/收尾，落点取悬停行 -----
// npx vitest run src/views/system/dict/__tests__/useDictDataDrag.test.ts
//
// 与菜单拖动同一套取舍（见 useMenuTreeDrag）：sort: false 让 Sortable 完全不碰 DOM，
// 否则 el-table 的 <tr> 被插到别处后与 Vue 的下标 diff 错位，closest('tr') 也恒为被拖行。

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'

const { create } = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('sortablejs', () => ({ default: { create } }))

import { useDictDataDrag } from '../useDictDataDrag'

interface Harness {
  tbody: HTMLElement
  rows: HTMLElement[]
  onDrop: ReturnType<typeof vi.fn>
  onStart: (evt: { item: HTMLElement }) => void
  onEnd: () => void
}

function makeRow(id: number, top: number): HTMLElement {
  const tr = document.createElement('tr')
  const handle = document.createElement('span')
  handle.className = 'dict-drag-handle'
  handle.setAttribute('data-dict-row-id', String(id))
  const td = document.createElement('td')
  td.appendChild(handle)
  tr.appendChild(td)
  // jsdom 的 getBoundingClientRect 恒为 0，而上下半带要靠真实高度算，这里逐行桩掉
  tr.getBoundingClientRect = () =>
    ({ top, height: 40, bottom: top + 40, left: 0, right: 200 }) as DOMRect
  return tr
}

/** 在宿主组件里挂载 composable（它注册了 onBeforeUnmount，必须在 setup 内调用） */
async function setupHarness(disabled = false): Promise<Harness> {
  document.body.innerHTML = ''
  const tbody = document.createElement('tbody')
  const rows = [makeRow(11, 0), makeRow(12, 40), makeRow(13, 80)]
  rows.forEach((tr) => tbody.appendChild(tr))
  document.body.appendChild(tbody)

  const onDrop = vi.fn()
  const Host = defineComponent({
    setup() {
      useDictDataDrag({
        getTbody: () => tbody,
        onDrop,
        ...(disabled ? { disabled: () => true } : {}),
      }).init()
      return () => h('div')
    },
  })
  const wrapper = mount(Host)
  await wrapper.vm.$nextTick()
  if (disabled) return { tbody, rows, onDrop, onStart: () => {}, onEnd: () => {} }

  const options = create.mock.calls[0][1]
  return { tbody, rows, onDrop, onStart: options.onStart, onEnd: options.onEnd }
}

/** 悬停到第 index 行、纵向 clientY 处 */
function dragOver(h: Harness, index: number, clientY: number): void {
  h.rows[index].dispatchEvent(new MouseEvent('dragover', { bubbles: true, clientY }))
}

function order(h: Harness): number[] {
  return Array.from(h.tbody.children).map(
    (tr) => Number(tr.querySelector('[data-dict-row-id]')!.getAttribute('data-dict-row-id')),
  )
}

describe('useDictDataDrag 落点判定', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    create.mockImplementation(() => ({ destroy: vi.fn() }))
  })

  it('绑定 Sortable 时关闭同列表排序，DOM 不会被占位符挪动', async () => {
    const h = await setupHarness()
    expect(create.mock.calls[0][1].handle).toBe('.dict-drag-handle')
    expect(create.mock.calls[0][1].sort).toBe(false)
  })

  it('位置带换算：上半段 before、下半段 after，且回传的是悬停行 id', async () => {
    const h = await setupHarness()
    h.onStart({ item: h.rows[0] }) // 拖 id=11
    dragOver(h, 1, 50) // (50-40)/40 = 0.25 → before
    dragOver(h, 2, 105) // (105-80)/40 = 0.625 → after
    h.onEnd()
    expect(h.onDrop).toHaveBeenCalledWith(11, 13, 'after')
  })

  it('拖动全程 tbody 行序保持不变，松手也不改 DOM', async () => {
    const h = await setupHarness()
    h.onStart({ item: h.rows[0] })
    dragOver(h, 1, 50)
    dragOver(h, 2, 105)
    h.onEnd()
    expect(order(h)).toEqual([11, 12, 13])
  })

  it('悬停在自己那一行：不标记、松手不提交', async () => {
    const h = await setupHarness()
    h.onStart({ item: h.rows[0] })
    dragOver(h, 0, 30)
    expect(h.rows[0].className).toBe('')
    h.onEnd()
    expect(h.onDrop).not.toHaveBeenCalled()
  })

  it('没有落点（一路只悬停自己行）松手不提交', async () => {
    const h = await setupHarness()
    h.onStart({ item: h.rows[0] })
    h.onEnd()
    expect(h.onDrop).not.toHaveBeenCalled()
  })

  it('高亮标记只留在当前悬停行，松手即清除', async () => {
    const h = await setupHarness()
    h.onStart({ item: h.rows[0] })
    dragOver(h, 1, 50)
    expect(h.rows[1].className).toContain('dict-drop-before')
    dragOver(h, 2, 105)
    expect(h.rows[1].className).not.toContain('dict-drop-before')
    expect(h.rows[2].className).toContain('dict-drop-after')
    h.onEnd()
    expect(h.rows[2].className).not.toContain('dict-drop-after')
  })

  it('drop 与 dragend 双双触发时只提交一次', async () => {
    const h = await setupHarness()
    h.onStart({ item: h.rows[0] })
    dragOver(h, 1, 70)
    h.onEnd()
    h.onEnd()
    expect(h.onDrop).toHaveBeenCalledTimes(1)
  })

  it('无更新权限时不绑定 Sortable', async () => {
    await setupHarness(true)
    expect(create).not.toHaveBeenCalled()
  })
})
