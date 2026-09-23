import { BadRequestException, NotFoundException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { GlobalExceptionFilter } from '../../../src/framework/filters/global-exception.filter'
import { BusinessException } from '../../../src/common/exception/business-exception'
import { EngineException } from '../../../src/common/exception/engine-exception'
import { ValidationError } from '../../../src/common/exception/validation-error'
import { TenantNotSetException } from '../../../src/common/exception/tenant-not-set.exception'
import { UnauthorizedException } from '../../../src/framework/security/unauthorized.exception'

describe('GlobalExceptionFilter 异常 → 响应映射矩阵', () => {
  it('BusinessException → HTTP 200 + body code', () => {
    const { httpStatus, body } = GlobalExceptionFilter.map(new BusinessException(409, '冲突了'))
    expect(httpStatus).toBe(200)
    expect(body).toEqual({ code: 409, msg: '冲突了', data: null })
  })

  it('BusinessException(msg) 默认 code 500，但 HTTP 仍为 200', () => {
    const { httpStatus, body } = GlobalExceptionFilter.map(new BusinessException('出错了'))
    expect(httpStatus).toBe(200)
    expect(body).toEqual({ code: 500, msg: '出错了', data: null })
  })

  it('UnauthorizedException → HTTP 401 + 固定消息', () => {
    const { httpStatus, body } = GlobalExceptionFilter.map(new UnauthorizedException())
    expect(httpStatus).toBe(401)
    expect(body).toEqual({ code: 401, msg: '未登录或Token已过期', data: null })
  })

  it('TenantNotSetException → HTTP 400，且消息与 Java 逐字一致', () => {
    const { httpStatus, body } = GlobalExceptionFilter.map(new TenantNotSetException())
    expect(httpStatus).toBe(400)
    // 这条消息由黄金样本实测确认，不可改写
    expect(body).toEqual({
      code: 400,
      msg: 'Tenant ID is not set. Ensure X-Tenant-Id header is provided.',
      data: null,
    })
  })

  it('EngineException → HTTP 400 且消息加「流程引擎错误: 」前缀', () => {
    const { httpStatus, body } = GlobalExceptionFilter.map(new EngineException('找不到流程定义'))
    expect(httpStatus).toBe(400)
    expect(body).toEqual({ code: 400, msg: '流程引擎错误: 找不到流程定义', data: null })
  })

  it('参数校验失败 → HTTP 200 + code 400 + 首个字段消息', () => {
    const { httpStatus, body } = GlobalExceptionFilter.map(new ValidationError('用户名不能为空'))
    expect(httpStatus).toBe(200)
    expect(body).toEqual({ code: 400, msg: '用户名不能为空', data: null })
  })

  it('带 Java 命名的参数异常 → HTTP 400', () => {
    const illegalArgument = new Error('参数非法')
    illegalArgument.name = 'IllegalArgumentException'
    expect(GlobalExceptionFilter.map(illegalArgument).httpStatus).toBe(400)

    const illegalState = new Error('任务已处理')
    illegalState.name = 'IllegalStateException'
    expect(GlobalExceptionFilter.map(illegalState)).toEqual({
      httpStatus: 400,
      body: { code: 400, msg: '任务已处理', data: null },
    })
  })

  it('普通 Error → HTTP 500', () => {
    const { httpStatus, body } = GlobalExceptionFilter.map(new Error('炸了'))
    expect(httpStatus).toBe(500)
    expect(body).toEqual({ code: 500, msg: '炸了', data: null })
  })

  it('Error 无 message 时回退到构造函数名', () => {
    class WeirdError extends Error {
      constructor() {
        super('')
      }
    }
    const { httpStatus, body } = GlobalExceptionFilter.map(new WeirdError())
    expect(httpStatus).toBe(500)
    expect(body).toEqual({ code: 500, msg: 'WeirdError', data: null })
  })

  it('非 Error 抛出物 → HTTP 500', () => {
    const { httpStatus, body } = GlobalExceptionFilter.map('字符串异常')
    expect(httpStatus).toBe(500)
    expect(body).toEqual({ code: 500, msg: '字符串异常', data: null })
  })

  /**
   * 框架 HttpException 必须保留状态码。
   *
   * 这是被实际 bug 逼出来的一条：@Catch() 会把 Nest 的 NotFoundException 一起吞掉，
   * 若不加处理，未映射路径会返回 500 而不是 404 ——
   * 契约对比器靠 404 区分「未实现」与「不一致」，那样会把每个未实现端点误报成契约破裂。
   */
  it('NotFoundException → HTTP 404（不能被吞成 500）', () => {
    const { httpStatus, body } = GlobalExceptionFilter.map(new NotFoundException())
    expect(httpStatus).toBe(404)
    expect(body.code).toBe(404)
  })

  it('框架 401 与 403 使用与 Java 一致的固定消息', () => {
    expect(GlobalExceptionFilter.map(new UnauthorizedException())).toEqual({
      httpStatus: 401,
      body: { code: 401, msg: '未登录或Token已过期', data: null },
    })
  })

  it('HttpException 的数组消息取第一条', () => {
    const { httpStatus, body } = GlobalExceptionFilter.map(
      new BadRequestException(['第一个错误', '第二个错误']),
    )
    expect(httpStatus).toBe(400)
    expect(body.msg).toBe('第一个错误')
  })
})
