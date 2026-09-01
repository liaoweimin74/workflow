// ----- TDD: ListCards 类型合同测试 -----
// npx vitest run src/components/business/__tests__/ListCards.test.ts

import { describe, it, expect } from 'vitest'
import type { CardColumn, ListQueryParams, ListPageResult } from '../types'

describe('CardColumn 接口', () => {
  it('支持 title/subtitle/tag/hidden/valueType 等卡片特有字段', () => {
    const column: CardColumn = {
      prop: 'title',
      title: '标题字段',
      subtitle: '副标题',
      tag: 'tag',
      hidden: false,
      valueType: 'string',
    }
    expect(column.prop).toBe('title')
    expect(column.title).toBe('标题字段')
    expect(column.subtitle).toBe('副标题')
    expect(column.tag).toBe('tag')
    expect(column.hidden).toBe(false)
    expect(column.valueType).toBe('string')
  })

  it('formatter 可选，支持可选 index 参数', () => {
    const column: CardColumn = {
      prop: 'amount',
      label: '金额',
      formatter: (row: any, column: CardColumn, cellValue: unknown, index?: number) => {
        return `$${cellValue}`
      },
    }
    expect(typeof column.formatter).toBe('function')
    // 调用 formatter 时传入 index
    const result = column.formatter({ id: 1 }, column, 100, 0)
    expect(result).toBe('$100')
  })

  it('支持 width/minWidth/align/fixed/sortable 等 TableColumn 样式字段', () => {
    const column: CardColumn = {
      prop: 'status',
      label: '状态',
      width: 120,
      minWidth: 80,
      align: 'center',
      fixed: 'right',
      sortable: true,
    }
    expect(column.width).toBe(120)
    expect(column.minWidth).toBe(80)
    expect(column.align).toBe('center')
    expect(column.fixed).toBe('right')
    expect(column.sortable).toBe(true)
  })

  it('支持 showOverflowTooltip 和 cellClassName', () => {
    const column: CardColumn = {
      prop: 'description',
      label: '描述',
      showOverflowTooltip: true,
      cellClassName: 'description-cell',
    }
    expect(column.showOverflowTooltip).toBe(true)
    expect(column.cellClassName).toBe('description-cell')
  })
})

describe('ListQueryParams 类型', () => {
  it('是 QueryParams 的子类型', () => {
    const params: ListQueryParams = {
      page: 1,
      size: 20,
    }
    expect(params.page).toBe(1)
    expect(params.size).toBe(20)
  })

  it('支持额外查询字段', () => {
    const params: ListQueryParams = {
      page: 1,
      size: 20,
      status: 'active',
      type: 'normal',
    }
    expect(params.status).toBe('active')
    expect(params.type).toBe('normal')
  })
})

describe('ListPageResult<T> 接口', () => {
  it('包含 rows 和 total 字段', () => {
    const result: ListPageResult<{ id: string; name: string }> = {
      rows: [
        { id: '1', name: '测试1' },
        { id: '2', name: '测试2' },
      ],
      total: 2,
    }
    expect(result.rows).toHaveLength(2)
    expect(result.total).toBe(2)
  })

  it('rows 类型与泛型参数一致', () => {
    interface CardItem {
      id: string
      title: string
      subtitle?: string
      tag?: string
    }

    const result: ListPageResult<CardItem> = {
      rows: [
        { id: '1', title: '卡片1', subtitle: '副标题1', tag: '标签A' },
        { id: '2', title: '卡片2', subtitle: '副标题2', tag: '标签B' },
      ],
      total: 2,
    }
    expect(result.rows[0].id).toBe('1')
    expect(result.rows[0].title).toBe('卡片1')
  })
})