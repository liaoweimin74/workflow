import { describe, expect, it } from 'vitest'
import { BUILD_TARGET } from '../../src/common/version'

describe('工具链冒烟', () => {
  it('能加载 TypeScript 源码', () => {
    expect(BUILD_TARGET).toBe('workflow-backend-node')
  })

  it('Node 版本不低于 24', () => {
    const major = Number(process.versions.node.split('.')[0])
    expect(major).toBeGreaterThanOrEqual(24)
  })

  it('能加载带装饰器的 NestJS 模块（验证装饰器元数据转译可用）', async () => {
    const { Injectable } = await import('@nestjs/common')
    // 若 swc 未启用 decoratorMetadata，下面的类在 Nest 注入时会缺失 design:paramtypes。
    // 这里只验证装饰器语法本身能被转译且可加载。
    @Injectable()
    class Probe {
      ping(): string {
        return 'pong'
      }
    }
    expect(new Probe().ping()).toBe('pong')
  })
})
