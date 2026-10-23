// ----- Task 5.1: useUniList 数据层纯函数 -----
// 语义对位 web PageDataCards.fetchApi：GET /v1/data-sources/:refId/data
// { page, size, filter } → records → rows（{...data, id, version}）。
// 关键字 → 全部 searchFields like；抽屉字段值 → like；set-filter 注入 → eq；
// 空值条件剔除；filter = JSON { logic: 'AND', conditions }。
// npx vitest run packages/lc-runtime-uni/__tests__/list.test.ts

import { describe, expect, it } from 'vitest'

import { buildUniListQuery, uniListRowsOf } from '../src/list'

describe('buildUniListQuery — 查询参数（对位 PageDataCards.fetchApi）', () => {
  it('关键字 → 全部 searchFields like 条件', () => {
    expect(
      buildUniListQuery({ page: 1, size: 20, keyword: 'so', searchFields: ['order_no', 'customer'] }),
    ).toEqual({
      page: 1,
      size: 20,
      filter: JSON.stringify({
        logic: 'AND',
        conditions: [
          { column: 'order_no', op: 'like', value: 'so' },
          { column: 'customer', op: 'like', value: 'so' },
        ],
      }),
    })
  })

  it('抽屉字段值 → like；set-filter 注入 → eq；空值条件剔除', () => {
    expect(
      buildUniListQuery({
        page: 1,
        size: 10,
        fieldValues: { dept: '研发', skip: '' },
        filters: [
          { column: 'status', op: 'eq', value: 'open' },
          { column: 'x', op: 'eq', value: '' },
        ],
      }),
    ).toEqual({
      page: 1,
      size: 10,
      filter: JSON.stringify({
        logic: 'AND',
        conditions: [
          { column: 'dept', op: 'like', value: '研发' },
          { column: 'status', op: 'eq', value: 'open' },
        ],
      }),
    })
  })

  it('无条件不出 filter；页码下限钳 1', () => {
    expect(buildUniListQuery({ page: 0, size: 20 })).toEqual({ page: 1, size: 20 })
  })

  it('pagination=false → 全量（size=-1 无 page）', () => {
    expect(buildUniListQuery({ page: 3, size: 20, pagination: false })).toEqual({ size: -1 })
  })
})

describe('uniListRowsOf — records → 行', () => {
  it('展开 data、id/version 平铺；非数组 → []', () => {
    expect(uniListRowsOf([{ id: 'r1', version: 2, data: { name: 'a' } }])).toEqual([
      { name: 'a', id: 'r1', version: 2 },
    ])
    expect(uniListRowsOf(undefined)).toEqual([])
  })
})
