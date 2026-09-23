import { describe, expect, it } from 'vitest'
import { normalizeBody } from '../../../tools/lib/normalize'

describe('normalizeBody', () => {
  it('把 32 位十六进制 ID 替换为占位符', () => {
    expect(normalizeBody({ id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90' })).toEqual({ id: '<ID>' })
  })

  it('把 UUID 替换为占位符', () => {
    expect(normalizeBody({ id: '550e8400-e29b-41d4-a716-446655440000' })).toEqual({ id: '<UUID>' })
  })

  it('把 ISO 时间戳替换为占位符', () => {
    expect(normalizeBody({ t: '2026-09-16T10:20:30.123Z' })).toEqual({ t: '<TIME>' })
  })

  it('把 "yyyy-MM-dd HH:mm:ss" 替换为占位符', () => {
    expect(normalizeBody({ t: '2026-09-16 10:20:30' })).toEqual({ t: '<TIME>' })
  })

  // 「自增主键依赖环境」这一条在两种形态下都要成立：
  // 数字形态（`UserVO.id` 等）与**字符串**形态（`BizDataVO.id`，值是 "24" 这样的自增主键）。
  // 字符串形态是后来才补的 —— 缺了它，`/api/v1/internal/system/*` 的写端点
  // 必然两侧不一致（实测就是这样挂的）。
  it('路径末段为 id 的纯数字**字符串**也归一为 <NUM>', () => {
    expect(normalizeBody({ id: '24' })).toEqual({ id: '<NUM>' })
    expect(normalizeBody({ data: { records: [{ id: '18' }] } })).toEqual({
      data: { records: [{ id: '<NUM>' }] },
    })
  })

  it('纯数字但路径末段不是 id 时不归一（避免误伤业务字段）', () => {
    expect(normalizeBody({ count: '24', data: { code: '001' } })).toEqual({
      count: '24',
      data: { code: '001' },
    })
  })

  it('id 路径上的 UUID / 32 位 hex 仍走各自的占位符，不被 <NUM> 吃掉', () => {
    expect(normalizeBody({ id: '550e8400-e29b-41d4-a716-446655440000' })).toEqual({ id: '<UUID>' })
    expect(normalizeBody({ id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90' })).toEqual({ id: '<ID>' })
  })

  it('把纯日期替换为占位符', () => {
    expect(normalizeBody({ t: '2026-09-16' })).toEqual({ t: '<DATE>' })
  })

  it('把 JWT 替换为占位符', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc'
    expect(normalizeBody({ accessToken: jwt })).toEqual({ accessToken: '<JWT>' })
  })

  it('递归处理数组与嵌套对象', () => {
    expect(
      normalizeBody({
        rows: [{ id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90', name: '张三' }],
        meta: { updatedAt: '2026-09-16 10:20:30' },
      }),
    ).toEqual({
      rows: [{ id: '<ID>', name: '张三' }],
      meta: { updatedAt: '<TIME>' },
    })
  })

  it('保留普通字符串、数字、布尔、null', () => {
    expect(normalizeBody({ a: '张三', b: 1, c: true, d: null })).toEqual({
      a: '张三',
      b: 1,
      c: true,
      d: null,
    })
  })

  it('保持键的顺序不变（用于逐字段对比）', () => {
    const out = normalizeBody({ z: 1, a: 2, m: 3 })
    expect(Object.keys(out as object)).toEqual(['z', 'a', 'm'])
  })

  it('顶层数组也能处理', () => {
    expect(normalizeBody(['a1b2c3d4e5f60718293a4b5c6d7e8f90', 'x'])).toEqual(['<ID>', 'x'])
  })

  it('空字符串与原样字符串保持不动', () => {
    expect(normalizeBody({ a: '', b: 'admin' })).toEqual({ a: '', b: 'admin' })
  })

  // 错误消息里会回显自己刚生成的 id，两侧必然不同。
  // 漏了这条规则，契约场景「数据源写操作」的 dswGetAfterDelete 会挂出唯一一处不一致。
  describe('串内 32 位 hex ID', () => {
    it('替换消息里内嵌的 id，保留消息格式', () => {
      expect(
        normalizeBody({ msg: '数据源不存在: cc3693a34fb5482a8b616392572a32e9' }),
      ).toEqual({ msg: '数据源不存在: <ID>' })
    })

    it('一句话里出现多个 id 时全部替换', () => {
      expect(
        normalizeBody({
          msg: 'a1b2c3d4e5f60718293a4b5c6d7e8f90 与 00112233445566778899aabbccddeeff',
        }),
      ).toEqual({ msg: '<ID> 与 <ID>' })
    })

    // 边界：宁可漏归一（报不一致、有人去看）也不能误伤真实内容。
    it('长 hex 串（如 64 位摘要）不被切出 32 位误伤', () => {
      const sha256 = 'a'.repeat(64)
      expect(normalizeBody({ hash: sha256 })).toEqual({ hash: sha256 })
    })

    it('32 位 hex 后面紧跟字母数字的标识符不归一', () => {
      const token = `${'a'.repeat(32)}xyz`
      expect(normalizeBody({ token })).toEqual({ token })
    })

    // 格式契约没有削弱：两侧 id 形态不同时仍然会挂。
    it('一侧内嵌 32 位 hex、一侧内嵌 UUID 时判为不一致', () => {
      const hex = normalizeBody({ msg: '数据源不存在: a1b2c3d4e5f60718293a4b5c6d7e8f90' })
      const uuid = normalizeBody({ msg: '数据源不存在: 550e8400-e29b-41d4-a716-446655440000' })
      expect(hex).not.toEqual(uuid)
    })

    it('一侧漏写 id 时判为不一致', () => {
      expect(normalizeBody({ msg: '数据源不存在: a1b2c3d4e5f60718293a4b5c6d7e8f90' })).not.toEqual(
        normalizeBody({ msg: '数据源不存在' }),
      )
    })
  })

  // 串内 UUID 规则是既有的：`key:1:<uuid>` 形式的 processDefinitionId
  it('串内 UUID 也替换（既有规则，回归保护）', () => {
    expect(
      normalizeBody({ id: 'contract_flow_x:1:8a54b318-b1f0-11f1-8e4b-7c8ae1a7aa09' }),
    ).toEqual({ id: 'contract_flow_x:1:<UUID>' })
  })

  // 流程副本的 key = 源 key + `_copy_` + 新 UUID 前 8 位 —— 那 8 位每次复制都不同。
  describe('副本 key 的后缀', () => {
    it('只把 `_copy_` 后的 8 位换成占位符，保留 key 的格式约束', () => {
      expect(normalizeBody({ key: 'contract_flow_abc123_copy_deadbeef' })).toEqual({
        key: 'contract_flow_abc123_copy_<ID8>',
      })
    })

    it('后缀不是 8 位十六进制时不替换（格式变了要能看出来）', () => {
      expect(normalizeBody({ key: 'contract_flow_copy_ZZZZ' })).toEqual({
        key: 'contract_flow_copy_ZZZZ',
      })
      // 时间戳后缀（错误的实现方式）不该被吃掉：它无法归一，必须暴露成差异
      expect(normalizeBody({ key: 'contract_flow_copy_1789579653551' })).toEqual({
        key: 'contract_flow_copy_1789579653551',
      })
    })

    it('runId 与副本后缀同时出现时各归各的', () => {
      expect(normalizeBody({ key: 'contract_flow_ab12cd_copy_00112233' }, ['ab12cd'])).toEqual({
        key: 'contract_flow_<RUN>_copy_<ID8>',
      })
    })
  })
})
