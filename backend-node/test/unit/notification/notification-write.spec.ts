import { describe, expect, it } from 'vitest'
import { NotificationWriteService } from '../../../src/notification/service/notification-write.service'
import { MessageSendService } from '../../../src/notification/service/message-send.service'
import { runWithTenant } from '../../../src/framework/tenant/tenant-context'
import type { LoginUser } from '../../../src/framework/security/jwt-auth.guard'

/**
 * 通知管理端写路径的单测。
 *
 * golden（场景「通知管理端写操作」）覆盖了主干与主要错误分支，
 * 但下面这些**契约网够不到**的地方只能在这里锁住：
 *   - 事件代码正则的**边界**（长度 64/65、首字符、小写、空）；
 *   - 枚举报错的**异常类型与文案**（必须是 IllegalArgumentException → HTTP 400，
 *     且消息带枚举全限定名）—— 契约场景只覆盖了 channel/action 两个，
 *     priority 与「HTTP 状态由异常类型决定」这件事靠这里兜住；
 *   - `Boolean.valueOf` 的宽松语义（"1"/"yes" 都是 false，且**不抛错**）；
 *   - `condition` 与 `conditionExpr` 的**优先级**；
 *   - 重发的两条错误文案，以及「渠道不含 IN_APP 时什么都不做」。
 */

const USER = { userId: 1, username: 'admin', roles: ['ROLE_ADMIN'] } as unknown as LoginUser

/**
 * SSE 连接管理器替身。
 *
 * ⚠️ 本 spec 关注的是「落库/校验」而不是推送，但**不能**因此传一个什么都不做的空对象就完事：
 *    推送用的是同一个 `sendDirect` 的返回值，若替身签名不对，`payload` 会静默变成 undefined
 *    而测试依然通过 —— 那正是本仓库反复踩过的「假绿」。这里显式实现两个方法。
 */
const sseStub = {
  sendToUser: () => undefined,
  getOnlineCount: () => 0,
  register: () => undefined,
} as never

function serviceWith(repo: Record<string, unknown>): NotificationWriteService {
  return new NotificationWriteService(
    repo as never,
    { requireAdmin: async () => {} } as never,
    {} as never,
    sseStub,
  )
}

/** 只关心「抛了什么」时用的最小替身。 */
function throwingService(): NotificationWriteService {
  return serviceWith({ existsEventDefinition: async () => false })
}

describe('事件代码格式（CODE_REGEX = ^[A-Z][A-Z0-9_]{0,63}$）', () => {
  const cases: Array<[string, string | null, boolean]> = [
    ['合法：单个大写字母', 'A', true],
    ['合法：大写+数字+下划线', 'ORDER_PAID_2', true],
    ['合法：恰好 64 字符', `A${'B'.repeat(63)}`, true],
    ['非法：65 字符（超长）', `A${'B'.repeat(64)}`, false],
    ['非法：小写开头', 'order_paid', false],
    ['非法：中间出现小写', 'ORDER_paid', false],
    ['非法：数字开头', '2ORDER', false],
    ['非法：下划线开头', '_ORDER', false],
    ['非法：含连字符', 'ORDER-PAID', false],
    ['非法：空串', '', false],
    ['非法：null', null, false],
  ]

  for (const [name, code, ok] of cases) {
    it(name, async () => {
      const service = throwingService()
      const run = () =>
        runWithTenant('default', () =>
          service.createEvent(USER, {
            eventCode: code,
            // 名称非空，避免先撞上「事件名称不能为空」
            eventName: '名称',
            description: null,
            businessDomain: null,
          }),
        )
      if (ok) {
        // 通过校验后会走到「插入」，替身没有 insertEventDefinition → 报一个**别的**错，
        // 只要不是格式错误就说明校验放行了
        await expect(run()).rejects.not.toThrow('事件代码必须为大写字母')
      } else {
        await expect(run()).rejects.toMatchObject({
          // ⚠️ 格式错误是显式 400，不是单参构造器的 500
          code: 400,
          message: '事件代码必须为大写字母、数字和下划线，且首字符为大写字母',
        })
      }
    })
  }

  it('校验顺序：格式先于名称（两个都非法时先报格式）', async () => {
    const service = throwingService()
    await expect(
      runWithTenant('default', () =>
        service.createEvent(USER, {
          eventCode: 'bad',
          eventName: '',
          description: null,
          businessDomain: null,
        }),
      ),
    ).rejects.toThrow('事件代码必须为大写字母、数字和下划线，且首字符为大写字母')
  })

  it('名称为空白 → code 500（Java 用单参 BusinessException，不是 400）', async () => {
    const service = throwingService()
    await expect(
      runWithTenant('default', () =>
        service.createEvent(USER, {
          eventCode: 'ORDER_PAID',
          eventName: '   ',
          description: null,
          businessDomain: null,
        }),
      ),
    ).rejects.toMatchObject({ code: 500, message: '事件名称不能为空' })
  })
})

describe('订阅规则的枚举解析', () => {
  async function createWith(body: Record<string, unknown>): Promise<unknown> {
    const service = serviceWith({})
    return runWithTenant('default', () => service.createSubscription(USER, body))
  }

  // ⚠️ 必须是 IllegalArgumentException（→ HTTP 400），**不能**是普通 Error（→ HTTP 500）。
  //    而且消息要带枚举的全限定名 —— Java 的 Enum.valueOf 就是这么抛的。
  it('非法 channel → IllegalArgumentException，消息含枚举全限定名', async () => {
    await expect(createWith({ eventCode: 'E', channel: 'EMAIL' })).rejects.toMatchObject({
      name: 'IllegalArgumentException',
      message: 'No enum constant com.workflow.notification.model.ChannelType.EMAIL',
    })
  })

  it('非法 action → 枚举全限定名是 SubscriptionRuleAction', async () => {
    await expect(createWith({ eventCode: 'E', channel: 'IN_APP', action: 'NOPE' })).rejects.toMatchObject(
      {
        name: 'IllegalArgumentException',
        message: 'No enum constant com.workflow.notification.model.SubscriptionRuleAction.NOPE',
      },
    )
  })

  it('非法 priority → 枚举全限定名是 MessagePriority', async () => {
    await expect(createWith({ eventCode: 'E', channel: 'IN_APP', priority: 'SUPER' })).rejects.toMatchObject(
      {
        name: 'IllegalArgumentException',
        message: 'No enum constant com.workflow.notification.model.MessagePriority.SUPER',
      },
    )
  })

  // 对齐 Boolean.valueOf(String)：只有忽略大小写的 "true" 为真，其余全部 false 且**不抛错**
  it('enable 只认忽略大小写的 "true"，其余一律 false 且不报错', async () => {
    const inserted: Array<{ enable: number }> = []
    const makeService = () =>
      serviceWith({
        insertSubscriptionRule: async (row: { enable: number }) => {
          inserted.push(row)
          return 1
        },
      })
    const base = { eventCode: 'E', channel: 'IN_APP', action: 'ALLOW' }
    for (const value of ['true', 'TRUE', 'True']) {
      await runWithTenant('default', () => makeService().createSubscription(USER, { ...base, enable: value }))
    }
    for (const value of ['1', 'yes', 'false', 'FALSE', '']) {
      await runWithTenant('default', () => makeService().createSubscription(USER, { ...base, enable: value }))
    }
    expect(inserted.map((r) => r.enable)).toEqual([1, 1, 1, 0, 0, 0, 0, 0])
  })

  it('condition 优先于 conditionExpr', async () => {
    const inserted: Array<{ condition_expr: string | null }> = []
    const service = serviceWith({
      insertSubscriptionRule: async (row: { condition_expr: string | null }) => {
        inserted.push(row)
        return 1
      },
    })
    const base = { eventCode: 'E', channel: 'IN_APP', action: 'ALLOW', enable: true }
    await runWithTenant('default', () =>
      service.createSubscription(USER, { ...base, condition: 'a > 1', conditionExpr: 'b < 2' }),
    )
    await runWithTenant('default', () =>
      service.createSubscription(USER, { ...base, conditionExpr: 'b < 2' }),
    )
    expect(inserted.map((r) => r.condition_expr)).toEqual(['a > 1', 'b < 2'])
  })
})

describe('渠道 ID 映射与配置', () => {
  it('未知渠道 ID → code 500「未知渠道 ID: N」（三个写端点都一样）', async () => {
    const service = serviceWith({})
    for (const call of [
      () => service.enableChannel(USER, 99),
      () => service.disableChannel(USER, 99),
      () => service.updateChannelConfig(USER, 99, {}),
      () => service.testChannel(USER, 99),
    ]) {
      await expect(runWithTenant('default', call)).rejects.toMatchObject({
        code: 500,
        message: '未知渠道 ID: 99',
      })
    }
  })

  it('配置是整批覆盖：先删（保留 __enabled）再逐条插入', async () => {
    const calls: string[] = []
    const service = serviceWith({
      deleteChannelConfigsExceptEnabled: async (channel: string) => {
        calls.push(`delete:${channel}`)
      },
      insertChannelConfig: async (row: { config_key: string; is_encrypted: number }) => {
        calls.push(`insert:${row.config_key}:${row.is_encrypted}`)
      },
    })
    await runWithTenant('default', () =>
      service.updateChannelConfig(USER, 2, { webhook: 'http://x', apiKey: 'k', '  ': 'skip', nil: null }),
    )
    expect(calls).toEqual([
      'delete:SMS',
      // apiKey 含 "key" ⇒ 标敏感（但本实现不加密，见服务注释）
      'insert:webhook:0',
      'insert:apiKey:1',
    ])
  })

  it('enable/disable 写的是 __enabled 行，缺行时插入、有行时更新', async () => {
    const inserted: Array<{ config_key: string; config_value: string | null }> = []
    const updated: Array<{ id: number; value: string }> = []
    const makeService = (existing: boolean) =>
      serviceWith({
        findChannelConfigs: async () =>
          existing ? [{ id: 7, config_key: '__enabled', config_value: 'true' }] : [],
        insertChannelConfig: async (row: { config_key: string; config_value: string | null }) => {
          inserted.push(row)
        },
        updateChannelEnabledFlag: async (id: number, value: string) => {
          updated.push({ id, value })
        },
      })

    await runWithTenant('default', () => makeService(false).enableChannel(USER, 1))
    await runWithTenant('default', () => makeService(true).disableChannel(USER, 1))
    // 用 toMatchObject 而不是 toEqual：这里只关心「插了哪一行、写了哪个值」，
    // 时间戳之类的字段参与比对只会让断言变脆。channel 顺便验证了 ID→类型映射（1→IN_APP）
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({
      channel: 'IN_APP',
      config_key: '__enabled',
      config_value: 'true',
      is_encrypted: 0,
    })
    expect(updated).toEqual([{ id: 7, value: 'false' }])
  })
})

describe('投递重发', () => {
  it('消息不存在 → 500「消息不存在: id」', async () => {
    const service = serviceWith({ findMessageById: async () => null })
    await expect(runWithTenant('default', () => service.retryDelivery(USER, 5))).rejects.toMatchObject({
      code: 500,
      message: '消息不存在: 5',
    })
  })

  it('没有收件人 → 500「该消息无收件人记录，无法重发」', async () => {
    const service = serviceWith({
      findMessageById: async () => ({ id: 5 }),
      findRecipientsByMessageId: async () => [],
    })
    await expect(runWithTenant('default', () => service.retryDelivery(USER, 5))).rejects.toMatchObject({
      code: 500,
      message: '该消息无收件人记录，无法重发',
    })
  })

  it('收件人 ID 去重、渠道取并集（重发入口的取数规则）', async () => {
    const seen: Array<{ ids: number[]; channels: string[] }> = []
    // ⚠️ 替身整体 `as never`：只实现被调用的那几个方法，
    //    不满足 repository 的完整行类型 —— vitest 走 swc 不做类型检查，
    //    所以漏了断言时只有 `tsc` 会报出来（这里就踩过一次）。
    const repository = {
      findMessageById: async () => ({ id: 5, tenant_id: 'default', created_at: new Date() }),
      findRecipientsByMessageId: async () => [
        { user_id: 1, channel: 'IN_APP' },
        { user_id: 1, channel: 'IN_APP' },
        { user_id: 2, channel: 'SMS' },
      ],
    } as never
    const service = new NotificationWriteService(
      repository,
      { requireAdmin: async () => {} } as never,
      {
        resendExisting: async (_row: unknown, ids: number[], channels: string[]) => {
          seen.push({ ids, channels })
        },
      } as never,
      sseStub,
    )
    await runWithTenant('default', () => service.retryDelivery(USER, 5))
    expect(seen).toEqual([{ ids: [1, 2], channels: ['IN_APP', 'SMS'] }])
  })
})

describe('重发的落库语义（resendExisting）', () => {
  function sendService(options: { enabled: boolean; channels: string[] }) {
    const updated: number[] = []
    const recipients: Array<{ message_id: number; user_id: number }> = []
    const service = new MessageSendService({
      findChannelConfigs: async () =>
        options.enabled ? [] : [{ config_key: '__enabled', config_value: 'false' }],
      updateMessageStatus: async (id: number) => {
        updated.push(id)
      },
      findUsersByIds: async () => [{ id: 1, username: 'admin', nickname: null, email: null, phone: null }],
      insertRecipients: async (rows: Array<{ message_id: number; user_id: number }>) => {
        recipients.push(...rows)
      },
    } as never, sseStub)
    return { service, updated, recipients }
  }

  it('含 IN_APP 且渠道启用 → UPDATE 消息（不新建）+ 重新插入收件人行', async () => {
    const { service, updated, recipients } = sendService({ enabled: true, channels: ['IN_APP'] })
    await service.resendExisting(
      { id: 5, tenant_id: 'default', created_at: new Date() },
      [1],
      ['IN_APP'],
    )
    expect(updated).toEqual([5])
    // ⚠️ 这就是「重发让收件人行翻倍」的成因：只 UPDATE 消息，收件人行全新增
    expect(recipients).toHaveLength(1)
    expect(recipients[0]).toMatchObject({
      message_id: 5,
      user_id: 1,
      tenant_id: 'default',
      username: 'admin',
      channel: 'IN_APP',
      status: 'PENDING',
    })
  })

  it('渠道不含 IN_APP → 什么都不做（对齐分发器的判断）', async () => {
    const { service, updated, recipients } = sendService({ enabled: true, channels: [] })
    await service.resendExisting({ id: 5, tenant_id: 'default', created_at: new Date() }, [1], ['SMS'])
    expect(updated).toEqual([])
    expect(recipients).toEqual([])
  })

  it('站内信被禁用 → 什么都不做', async () => {
    const { service, updated } = sendService({ enabled: false, channels: [] })
    await service.resendExisting({ id: 5, tenant_id: 'default', created_at: new Date() }, [1], ['IN_APP'])
    expect(updated).toEqual([])
  })
})
