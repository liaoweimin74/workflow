import { describe, expect, it } from 'vitest'
import {
  clearTenant,
  getTenantId,
  hasTenantId,
  runWithTenant,
  setTenantId,
  tryGetTenantId,
} from '../../../src/framework/tenant/tenant-context'
import {
  TENANT_NOT_SET_MESSAGE,
  TenantNotSetException,
} from '../../../src/common/exception/tenant-not-set.exception'

describe('租户上下文', () => {
  it('未设置时 getTenantId 抛 TenantNotSetException', () => {
    expect(() => getTenantId()).toThrow(TenantNotSetException)
  })

  it('异常消息与 Java 逐字一致（黄金样本实测确认）', () => {
    expect(() => getTenantId()).toThrow(
      'Tenant ID is not set. Ensure X-Tenant-Id header is provided.',
    )
    expect(TENANT_NOT_SET_MESSAGE).toBe(
      'Tenant ID is not set. Ensure X-Tenant-Id header is provided.',
    )
  })

  it('hasTenantId 对齐 Java TenantProvider.hasTenantId', () => {
    expect(hasTenantId()).toBe(false)
    runWithTenant('t1', () => expect(hasTenantId()).toBe(true))
    runWithTenant('   ', () => expect(hasTenantId()).toBe(false))
    runWithTenant(null, () => expect(hasTenantId()).toBe(false))
  })

  it('未设置时 tryGetTenantId 返回 null', () => {
    expect(tryGetTenantId()).toBeNull()
  })

  it('set 后 get 能取到', () => {
    runWithTenant('t1', () => {
      expect(getTenantId()).toBe('t1')
    })
  })

  it('runWithTenant 结束后作用域外不可见', () => {
    runWithTenant('t1', () => getTenantId())
    expect(tryGetTenantId()).toBeNull()
  })

  it('clearTenant 后 getTenantId 抛异常', () => {
    runWithTenant('t1', () => {
      clearTenant()
      expect(() => getTenantId()).toThrow(TenantNotSetException)
    })
  })

  it('runWithTenant(null) 不设置租户（对齐 Java：header 为空则不设置）', () => {
    runWithTenant(null, () => {
      expect(tryGetTenantId()).toBeNull()
    })
  })

  it('runWithTenant("  ") 空白串同样不设置租户', () => {
    runWithTenant('   ', () => {
      expect(tryGetTenantId()).toBeNull()
    })
  })

  it('setTenantId 可在作用域内追加设置', () => {
    runWithTenant(null, () => {
      setTenantId('t2')
      expect(getTenantId()).toBe('t2')
    })
  })

  it('setTenantId 在作用域外调用直接报错（防止误用模块级状态）', () => {
    expect(() => setTenantId('t1')).toThrow(/必须在 runWithTenant 作用域内调用/)
  })

  /**
   * 并发串号专测 —— 这是 ThreadLocal → AsyncLocalStorage 迁移的核心风险。
   * 三个并发「请求」各自 await 交替，租户不得互相污染。
   */
  it('并发请求不会串号', async () => {
    const observed: string[] = []

    async function fakeRequest(tenant: string): Promise<void> {
      await runWithTenant(tenant, async () => {
        for (let i = 0; i < 50; i++) {
          // 主动让出事件循环，制造交错
          await new Promise((r) => setImmediate(r))
          observed.push(`${tenant}:${getTenantId()}`)
        }
      })
    }

    await Promise.all([fakeRequest('tenantA'), fakeRequest('tenantB'), fakeRequest('tenantC')])

    expect(observed).toHaveLength(150)
    for (const entry of observed) {
      const [expected, actual] = entry.split(':')
      expect(actual).toBe(expected)
    }
  })

  it('异步链中租户保持可见（await 跨越）', async () => {
    await runWithTenant('t9', async () => {
      await new Promise((r) => setTimeout(r, 5))
      expect(getTenantId()).toBe('t9')
      await Promise.resolve()
      expect(getTenantId()).toBe('t9')
    })
  })

  it('嵌套作用域内层覆盖外层，退出后外层恢复', () => {
    runWithTenant('outer', () => {
      expect(getTenantId()).toBe('outer')
      runWithTenant('inner', () => {
        expect(getTenantId()).toBe('inner')
      })
      expect(getTenantId()).toBe('outer')
    })
  })
})
