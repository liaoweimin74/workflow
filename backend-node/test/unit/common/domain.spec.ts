import { describe, expect, it } from 'vitest'
import { R, fail } from '../../../src/common/domain/r'
import { pageResult } from '../../../src/common/domain/page-result'
import { pageResponse } from '../../../src/common/domain/page-response'

describe('R 统一响应封装', () => {
  it('ok(data) 得到 code=200 / msg=success', () => {
    expect(R.ok({ id: 1 })).toEqual({ code: 200, msg: 'success', data: { id: 1 } })
  })

  it('ok() 的 data 为 null', () => {
    expect(R.ok()).toEqual({ code: 200, msg: 'success', data: null })
  })

  it('fail(code, msg) 的 data 为 null', () => {
    expect(R.fail(400, '用户名不能为空')).toEqual({
      code: 400,
      msg: '用户名不能为空',
      data: null,
    })
  })

  it('fail(msg) 单参形式 code 为 500（独立函数，对应 Java R.fail(String)）', () => {
    expect(fail('炸了')).toEqual({ code: 500, msg: '炸了', data: null })
  })

  it('forbidden / unauthorized 的 code 分别为 403 / 401', () => {
    expect(R.forbidden('没有权限访问')).toEqual({ code: 403, msg: '没有权限访问', data: null })
    expect(R.unauthorized('未登录或Token已过期')).toEqual({
      code: 401,
      msg: '未登录或Token已过期',
      data: null,
    })
  })

  it('序列化后字段名恰为 code / msg / data，不多不少', () => {
    expect(Object.keys(JSON.parse(JSON.stringify(R.ok()))).sort()).toEqual(['code', 'data', 'msg'])
  })
})

describe('PageResult 分页封装', () => {
  it('字段名恰为 total / page / size / rows', () => {
    const p = pageResult(100, 1, 20, [{ id: 1 }])
    expect(p).toEqual({ total: 100, page: 1, size: 20, rows: [{ id: 1 }] })
    expect(Object.keys(JSON.parse(JSON.stringify(p))).sort()).toEqual([
      'page',
      'rows',
      'size',
      'total',
    ])
  })

  it('空列表保持 rows 为数组而非 null', () => {
    expect(pageResult(0, 1, 20, []).rows).toEqual([])
  })
})

describe('PageResponse 分页封装（与 PageResult 是两种不同形状）', () => {
  it('字段名恰为 content / pageNumber / pageSize / totalElements / totalPages', () => {
    const p = pageResponse([{ id: 1 }], 1, 20, 100)
    expect(p).toEqual({
      content: [{ id: 1 }],
      pageNumber: 1,
      pageSize: 20,
      totalElements: 100,
      totalPages: 5,
    })
    expect(Object.keys(JSON.parse(JSON.stringify(p))).sort()).toEqual([
      'content',
      'pageNumber',
      'pageSize',
      'totalElements',
      'totalPages',
    ])
  })

  it('totalPages = ceil(totalElements / pageSize)，对齐 Java 构造器', () => {
    expect(pageResponse([], 1, 20, 100).totalPages).toBe(5)
    expect(pageResponse([], 1, 20, 101).totalPages).toBe(6)
    expect(pageResponse([], 1, 20, 0).totalPages).toBe(0)
    expect(pageResponse([], 1, 20, 1).totalPages).toBe(1)
    expect(pageResponse([], 1, 10, 9).totalPages).toBe(1)
  })

  it('pageSize <= 0 时 totalPages 为 0（避免除零），对齐 Java 的三元表达式', () => {
    expect(pageResponse([], 1, 0, 100).totalPages).toBe(0)
    expect(pageResponse([], 1, -1, 100).totalPages).toBe(0)
  })

  it('pageNumber 是 1 基（Java 侧为 result.getNumber() + 1）', () => {
    expect(pageResponse([], 3, 20, 100).pageNumber).toBe(3)
  })

  it('与 PageResult 不是同一形状（防实现时张冠李戴）', () => {
    const pr = pageResponse([], 1, 20, 100)
    const ps = pageResult(100, 1, 20, [])
    expect(Object.keys(JSON.parse(JSON.stringify(pr))).sort()).not.toEqual(
      Object.keys(JSON.parse(JSON.stringify(ps))).sort(),
    )
  })
})
