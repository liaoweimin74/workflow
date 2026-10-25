import { describe, expect, it } from 'vitest'
import { BusinessException } from '../../src/common/exception/business-exception'
import { ValidationError } from '../../src/common/exception/validation-error'
import { ClientService } from '../../src/system/service/client.service'

/**
 * Task 2 单元测试：ClientService 的业务规则（注入 stub repository，不连数据库）。
 *
 * 每条用例钉住简报「规则」里的一条：
 *   - code 重复 → BusinessException('客户端编码已存在')
 *   - MP enabled=1 缺 appid → ValidationError
 *   - options 停用端 status 透传、且读出口不含 config_json 原文（不泄密文/明文）
 *   - portal(id=1) 停用 → BusinessException
 */

/** 仅实现被测路径用到的方法；其余返回空实现。类型用 any——单测桩，绕开对 repository 的编译期依赖。 */
function makeService(stub: Record<string, unknown>): ClientService {
  return new ClientService(stub as never)
}

describe('ClientService.create', () => {
  it('code 重复抛「客户端编码已存在」（BusinessException）', async () => {
    const service = makeService({
      codeExists: async () => true,
      insertClient: async () => 99,
      findClientById: async () => null,
      listChannelsByClientIds: async () => [],
    })

    await expect(
      service.create({ code: 'dup', name: '重复端' }),
    ).rejects.toMatchObject({
      name: 'BusinessException',
      message: '客户端编码已存在',
    })
  })

  it('create 成功返回 ClientVO，channels 为空数组', async () => {
    const service = makeService({
      codeExists: async () => false,
      insertClient: async () => 42,
      findClientById: async (id: number) => ({
        id,
        code: 'app1',
        name: '应用端',
        icon: null,
        status: 1,
        default_role_id: null,
        default_member_group_id: null,
      }),
      listChannelsByClientIds: async () => [],
    })

    const vo = await service.create({ code: 'app1', name: '应用端' })
    expect(vo).toMatchObject({ id: 42, code: 'app1', name: '应用端', status: 1 })
    expect(vo.channels).toEqual([])
  })
})

describe('ClientService.upsertChannel', () => {
  it('MP enabled=1 缺 appid 抛 ValidationError', async () => {
    const service = makeService({
      findChannel: async () => null,
      upsertChannel: async () => {},
    })

    await expect(
      service.upsertChannel(7, 'MP', { enabled: 1, config: {} }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('非法 channelType 抛 ValidationError', async () => {
    const service = makeService({
      findChannel: async () => null,
      upsertChannel: async () => {},
    })

    await expect(
      service.upsertChannel(7, 'FOO', { enabled: 1, config: {} }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('MP 写入的 secret 加密落库、读出口为掩码（非明文/非原文）', async () => {
    let storedConfigJson = ''
    const service = makeService({
      findChannel: async (_clientId: number, _type: string) => ({
        client_id: 7,
        channel_type: 'MP',
        enabled: 1,
        // 回显读的是写入后的真实行——用闭包捕获 upsertChannel 写进去的 config_json
        get config_json() {
          return storedConfigJson
        },
      }),
      upsertChannel: async (_clientId: number, _type: string, data: { config_json: string | null }) => {
        storedConfigJson = data.config_json ?? ''
      },
    })

    const vo = await service.upsertChannel(7, 'MP', {
      enabled: 1,
      config: { appid: 'wx_id', secret: 'plain_secret_123' },
    })

    // 读出口固定掩码
    expect(vo.channelType).toBe('MP')
    expect(vo.config.secret).toBe('******')
    // 落库的是密文：既不含明文 secret，也不是明文 JSON 原文
    expect(storedConfigJson).not.toContain('plain_secret_123')
    expect(storedConfigJson).toContain('wx_id')
  })
})

describe('ClientService.setStatus', () => {
  it('portal(id=1) 停用抛 BusinessException', async () => {
    const service = makeService({
      findClientById: async (id: number) => ({
        id,
        code: 'portal',
        name: '平台端',
        icon: null,
        status: 1,
        default_role_id: null,
        default_member_group_id: null,
      }),
      updateStatus: async () => {},
    })

    await expect(service.setStatus(1, 0)).rejects.toBeInstanceOf(BusinessException)
  })
})

describe('ClientService.options', () => {
  it('停用端 status 透传，且读出口不含 config_json 原文', async () => {
    const SENTINEL = 'PLAINTEXT_SECRET_SENTINEL'
    const service = makeService({
      listOptions: async () => [
        // 桩里故意带上 config_json（模拟仓储误传），service 必须把它挡在读出口之外
        { id: 2, code: 'c2', name: '停用端', status: 0, channelType: 'WEB', config_json: SENTINEL },
        { id: 3, code: 'c3', name: '无渠道端', status: 0, channelType: null, config_json: null },
      ],
    })

    const options = await service.options()

    // status 原样透传（含停用端 0）
    expect(options).toEqual([
      { id: 2, code: 'c2', name: '停用端', status: 0, channelTypes: ['WEB'] },
      { id: 3, code: 'c3', name: '无渠道端', status: 0, channelTypes: [] },
    ])
    // 读出口绝不含 config_json 原文/密文
    expect(JSON.stringify(options)).not.toContain(SENTINEL)
  })
})
