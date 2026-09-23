import { describe, expect, it } from 'vitest'
import {
  NotificationService,
  parseJsonColumn,
  toMessageVO,
} from '../../../src/notification/service/notification.service'
import {
  MessageSendService,
  parseChannelType,
  render,
  validateVariables,
} from '../../../src/notification/service/message-send.service'

/**
 * 通知模块（消息链路）的单测。
 *
 * golden（场景「消息发送与用户端消息操作」）覆盖了端到端主干，
 * 但下面这些**契约网够不到**的地方只能在这里锁住：
 *   - 模板渲染对 `$&` / `$1` 的字面替换语义；
 *   - `BIT(1)` 的 Buffer 形态（契约场景只覆盖「读到 1」这一种）；
 *   - 渠道启停的**三态**判定（`__enabled` 行存在 / 不存在 / 外部渠道无配置）；
 *   - 空集分支与非空分支对 `size` 的**不同**处理；
 *   - `readStatus` 键恒存在（漏了会被比对器判 missing）。
 */

function serviceWith(repo: Record<string, unknown>): NotificationService {
  return new NotificationService(repo as never)
}

describe('模板渲染', () => {
  it('替换变量；未提供的变量渲染为空串', () => {
    expect(render('你好 ${name}', { name: '张三' })).toBe('你好 张三')
    expect(render('你好 ${name}', {})).toBe('你好 ')
    expect(render('你好 ${name}', { name: null })).toBe('你好 ')
  })

  it('null 模板原样返回 null', () => {
    expect(render(null, {})).toBeNull()
  })

  // ⚠️ 这条是本文件里最容易被"优化"掉的一条：Java 用 Matcher.quoteReplacement
  //    保证变量值里的 $ / \ 是字面量；JS 的 String.replace(str) 会把 $&、$1
  //    当成反向引用 —— 必须用替换函数才能等价。
  it('变量值里的 $ 与反斜杠按字面量插入，不被当成反向引用', () => {
    expect(render('价格 ${p}', { p: '$&' })).toBe('价格 $&')
    expect(render('价格 ${p}', { p: '$1' })).toBe('价格 $1')
    expect(render('路径 ${p}', { p: 'C:\\a\\b' })).toBe('路径 C:\\a\\b')
  })

  it('同一变量出现多次时全部替换', () => {
    expect(render('${a}-${a}', { a: 'x' })).toBe('x-x')
  })
})

describe('模板变量校验', () => {
  it('缺变量 / 变量为 null 都报「缺少必填变量」', () => {
    expect(() => validateVariables('你好 ${name}', {})).toThrowError('缺少必填变量: name')
    expect(() => validateVariables('你好 ${name}', { name: null })).toThrowError(
      '缺少必填变量: name',
    )
  })

  it('变量齐全则通过；空串算「有值」（Java 只判 null 与 containsKey）', () => {
    expect(() => validateVariables('你好 ${name}', { name: '张三' })).not.toThrow()
    expect(() => validateVariables('你好 ${name}', { name: '' })).not.toThrow()
  })

  it('null 模板不做校验', () => {
    expect(() => validateVariables(null, {})).not.toThrow()
  })
})

describe('parseChannelType', () => {
  it('识别大小写不敏感的合法渠道', () => {
    expect(parseChannelType('IN_APP')).toBe('IN_APP')
    expect(parseChannelType('in_app')).toBe('IN_APP')
  })

  it('null / 空串 / 未知值返回 null（由调用方决定是否报错）', () => {
    expect(parseChannelType(null)).toBeNull()
    expect(parseChannelType('  ')).toBeNull()
    expect(parseChannelType('EMAIL')).toBeNull()
  })
})

describe('渠道启停判定（ChannelConfigService.isEnabled 的三态）', () => {
  function sendService(configs: Array<{ config_key: string; config_value: string | null }>) {
    return new MessageSendService(
      {
        findChannelConfigs: async () => configs,
      } as never,
      // SSE 连接管理器：本 describe 只测渠道启停判定，推送替身不做任何事
      { sendToUser: () => undefined, getOnlineCount: () => 0, register: () => undefined } as never,
    )
  }

  it('没有任何配置行时，站内信恒启用', async () => {
    expect(await sendService([]).isChannelEnabled('IN_APP')).toBe(true)
  })

  it('没有任何配置行时，外部渠道未启用', async () => {
    expect(await sendService([]).isChannelEnabled('SMS')).toBe(false)
  })

  // 对齐 Java 的 Boolean.parseBoolean：只有忽略大小写等于 "true" 才是启用，
  // 空串 / "1" / "yes" 一律 false
  it('__enabled 开关优先，且只认 "true"', async () => {
    expect(
      await sendService([{ config_key: '__enabled', config_value: 'true' }]).isChannelEnabled('SMS'),
    ).toBe(true)
    expect(
      await sendService([{ config_key: '__enabled', config_value: 'TRUE' }]).isChannelEnabled('SMS'),
    ).toBe(true)
    expect(
      await sendService([{ config_key: '__enabled', config_value: '1' }]).isChannelEnabled('SMS'),
    ).toBe(false)
    expect(
      await sendService([{ config_key: '__enabled', config_value: '' }]).isChannelEnabled('SMS'),
    ).toBe(false)
  })

  it('__enabled=false 能把站内信关掉（不能因为"站内信恒可用"就忽略开关）', async () => {
    expect(
      await sendService([{ config_key: '__enabled', config_value: 'false' }]).isChannelEnabled(
        'IN_APP',
      ),
    ).toBe(false)
  })

  it('外部渠道有非空配置即视为启用；__enabled 行本身不算配置', async () => {
    expect(
      await sendService([{ config_key: 'webhook', config_value: 'http://x' }]).isChannelEnabled('SMS'),
    ).toBe(true)
    expect(
      await sendService([{ config_key: '__enabled', config_value: null }]).isChannelEnabled('SMS'),
    ).toBe(false)
  })
})

describe('toMessageVO', () => {
  const row = {
    id: 7,
    tenant_id: 'default',
    template_code: 'ANNOUNCEMENT',
    event_code: null,
    sender_id: 1,
    sender_type: 'SYSTEM',
    title: '标题',
    content: '{"text":"正文","variables":{}}',
    link_json: null,
    content_type: 'MARKDOWN',
    priority: 'NORMAL',
    category: 'SYSTEM',
    message_type: 'PUBLIC',
    status: 'SENT',
    created_at: new Date('2026-09-17T01:00:00Z'),
  }

  // 16 个键，逐字对齐 Java Message 实体的可序列化属性。
  // ⚠️ `readStatus` 即使为 null 也**必须存在**：golden 里它是 null 而不是缺键，
  //    缺了会被比对器判为 missing（不是"无所谓"）。
  it('键集合完整且 readStatus 恒存在', () => {
    const vo = toMessageVO(row as never, null)
    expect(Object.keys(vo).sort()).toEqual(
      [
        'category',
        'content',
        'contentType',
        'createdAt',
        'eventCode',
        'id',
        'linkJson',
        'messageType',
        'priority',
        'readStatus',
        'senderId',
        'senderType',
        'status',
        'templateCode',
        'tenantId',
        'title',
      ].sort(),
    )
    expect(vo.readStatus).toBeNull()
  })

  it('json 列还原成对象', () => {
    const vo = toMessageVO(row as never, 'PENDING')
    expect(vo.content).toEqual({ text: '正文', variables: {} })
    expect(vo.linkJson).toBeNull()
    expect(vo.readStatus).toBe('PENDING')
  })
})

describe('parseJsonColumn', () => {
  it('null 保持 null；合法 JSON 还原；非法 JSON 原样返回字符串', () => {
    expect(parseJsonColumn(null)).toBeNull()
    expect(parseJsonColumn('{"a":1}')).toEqual({ a: 1 })
    // 脏数据不能让读接口整体 500 —— 宁可让契约比对报差异
    expect(parseJsonColumn('{')).toBe('{')
  })
})

describe('用户端列表：空集与非空集对 size 的处理不同', () => {
  it('无收件记录 → 空页，size 归一为 max(size,1)', async () => {
    const service = serviceWith({ findRecipientsByUserId: async () => [] })
    const result = await service.listByUserId(1, 3, 0, {
      keyword: null,
      category: null,
      unread: null,
      start: null,
      end: null,
      messageType: null,
    })
    expect(result.total).toBe(0)
    expect(result.page).toBe(3)
    expect(result.size).toBe(1)
    expect(result.rows).toEqual([])
  })

  // ⚠️ 非空分支返回的是**原始 size**（Java `new PageResult<>(total, normalizedPage, size, content)`），
  //    与空集分支的 Math.max(size,1) 不一致 —— 这是刻意的照抄，不是笔误。
  it('有收件记录 → size 用原始值（与空集分支不同）', async () => {
    const service = serviceWith({
      findRecipientsByUserId: async () => [
        { message_id: 5, status: 'PENDING' },
      ],
      findUserMessagesPage: async () => ({
        rows: [
          {
            id: 5,
            tenant_id: 'default',
            template_code: 'T',
            event_code: null,
            sender_id: 1,
            sender_type: 'SYSTEM',
            title: 'x',
            content: null,
            link_json: null,
            content_type: null,
            priority: null,
            category: null,
            message_type: null,
            status: 'SENT',
            created_at: null,
          },
        ],
        total: 1,
      }),
    })
    // ⚠️ 非空分支会走 `PageRequest.of(normalizedPage - 1, size)`（Java 原样），
    //    所以 `size < 1` 在这里抛 400，而不是像空集分支那样归一成 1。
    //    契约场景「非法查询参数与分页边界」的 `qiNotifSizeZero` 实测钉住了这条分支差异：
    //    该用户**有**消息时 `?size=0` → HTTP 400 `Page size must not be less than one`，
    //    **没有**消息时 → 200 + `size:1`。
    await expect(
      service.listByUserId(1, 1, 0, {
        keyword: null,
        category: null,
        unread: null,
        start: null,
        end: null,
        messageType: null,
      }),
    ).rejects.toThrow('Page size must not be less than one')

    // size 合法时，响应里的 `size` 用**原始值**（Java `new PageResult<>(total, page, size, content)`）
    const result = await service.listByUserId(1, 1, 7, {
      keyword: null,
      category: null,
      unread: null,
      start: null,
      end: null,
      messageType: null,
    })
    expect(result.size).toBe(7)
    expect(result.rows[0].readStatus).toBe('PENDING')
  })

  it('unread 参数转成收件人状态过滤：true→PENDING，false→SENT', async () => {
    const seen: string[] = []
    const service = serviceWith({
      findRecipientsByUserId: async () => [],
      findRecipientsByUserIdAndStatus: async (_u: number, status: string) => {
        seen.push(status)
        return []
      },
    })
    const base = { keyword: null, category: null, start: null, end: null, messageType: null }
    await service.listByUserId(1, 1, 20, { ...base, unread: true })
    await service.listByUserId(1, 1, 20, { ...base, unread: false })
    expect(seen).toEqual(['PENDING', 'SENT'])
  })
})

describe('已读状态变更', () => {
  it('markAsRead 受影响 0 行 → 「消息不存在或已读」', async () => {
    const service = serviceWith({ markAsRead: async () => 0 })
    await expect(service.markAsRead(9, 1)).rejects.toMatchObject({
      code: 500,
      message: '消息不存在或已读',
    })
  })

  it('已读再标已读不报错（Java 的 UPDATE 不带 status 条件）', async () => {
    const service = serviceWith({ markAsRead: async () => 1 })
    await expect(service.markAsRead(9, 1)).resolves.toBeUndefined()
  })

  it('batchMarkAsRead 空列表直接返回，不碰数据库', async () => {
    let called = false
    const service = serviceWith({
      markBatchAsRead: async () => {
        called = true
        return 0
      },
    })
    await expect(service.batchMarkAsRead([], 1)).resolves.toBeUndefined()
    expect(called).toBe(false)
  })

  it('toggleRead：未读→已读写入 sentAt；已读→未读把 sentAt 清空', async () => {
    const patches: Array<{ status: string; sent_at: Date | null }> = []
    const makeService = (status: string) =>
      serviceWith({
        findRecipientByMessageAndUser: async () => ({ id: 11, status }),
        updateRecipient: async (_id: number, patch: { status: string; sent_at: Date | null }) => {
          patches.push(patch)
        },
      })

    expect(await makeService('PENDING').toggleRead(5, 1)).toBe('SENT')
    expect(patches[0].sent_at).toBeInstanceOf(Date)

    expect(await makeService('SENT').toggleRead(5, 1)).toBe('PENDING')
    expect(patches[1].sent_at).toBeNull()
  })

  it('没有收件人行 → 「消息不存在」', async () => {
    const service = serviceWith({ findRecipientByMessageAndUser: async () => null })
    await expect(service.toggleRead(5, 1)).rejects.toMatchObject({
      code: 500,
      message: '消息不存在',
    })
  })
})

describe('详情与删除的权限分支', () => {
  const message = { id: 5, sender_id: 2 }

  it('详情：既非收件人也不是发送者 → 403', async () => {
    const service = serviceWith({
      findMessageById: async () => message,
      findRecipientsByMessageId: async () => [{ user_id: 99 }],
    })
    await expect(service.getById(5, 1)).rejects.toMatchObject({
      code: 403,
      message: '无权查看此消息',
    })
  })

  it('详情：自己是发送者即可查看（即使没有收件人行）', async () => {
    const service = serviceWith({
      findMessageById: async () => ({ ...message, sender_id: 1 }),
      findRecipientsByMessageId: async () => [],
      findRecipientByMessageAndUser: async () => null,
    })
    await expect(service.getById(5, 1)).resolves.toBeDefined()
  })

  it('详情：消息不存在 → 「消息不存在」', async () => {
    const service = serviceWith({ findMessageById: async () => null })
    await expect(service.getById(5, 1)).rejects.toMatchObject({ message: '消息不存在' })
  })

  it('删除：非收件人 → 403（不是 404）', async () => {
    const service = serviceWith({
      findRecipientsByMessageId: async () => [{ user_id: 99 }],
    })
    await expect(service.delete(5, 1)).rejects.toMatchObject({
      code: 403,
      message: '无权删除此消息',
    })
  })

  it('删除：是收件人时只删自己那一行收件人记录', async () => {
    const deleted: Array<[number, number]> = []
    const service = serviceWith({
      findRecipientsByMessageId: async () => [{ user_id: 1 }, { user_id: 2 }],
      deleteRecipientByUserAndMessage: async (userId: number, messageId: number) => {
        deleted.push([userId, messageId])
      },
    })
    await service.delete(5, 1)
    expect(deleted).toEqual([[1, 5]])
  })
})
