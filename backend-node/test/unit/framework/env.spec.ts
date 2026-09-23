import { describe, expect, it } from 'vitest'
import { loadEnv } from '../../../src/framework/config/env'

describe('loadEnv', () => {
  it('未提供任何覆盖时给出与 Java application.yml 一致的默认值', () => {
    const env = loadEnv({})
    expect(env.db.host).toBe('localhost')
    expect(env.db.port).toBe(3306)
    expect(env.db.user).toBe('root')
    // 默认库是 workflow_v6 而非 workflow：
    // 原开发库的 Flyway 历史与仓库文件不一致，按用户要求不修改它，
    // 另建了历史自洽的 workflow_v6（见规格 U7）。
    expect(env.db.database).toBe('workflow_v6')
  })

  it('Node 后端默认端口为 8081，避免与 GUI(8080) 和 Java 基准(8082) 冲突', () => {
    expect(loadEnv({}).port).toBe(8081)
  })

  it('JWT 默认密钥与 Java 侧一致（base64 后可解码为 47 字节 → HS256）', () => {
    const env = loadEnv({})
    expect(env.jwt.secret).toBe('YnJfRFdpbjQ5dU5hZzJ4c0VvN0s2bUx4R0R4aUZ3cG1WeU9yS3F6RXhDdVN4V0E=')
    expect(Buffer.from(env.jwt.secret, 'base64').length).toBe(47)
  })

  it('access / refresh 有效期默认 30 与 10080 分钟', () => {
    const env = loadEnv({})
    expect(env.jwt.accessTokenExpireMinutes).toBe(30)
    expect(env.jwt.refreshTokenExpireMinutes).toBe(10080)
  })

  it('覆盖项可只改嵌套字段，其余保留默认', () => {
    const env = loadEnv({ db: { database: 'workflow_node_test' } as never })
    expect(env.db.database).toBe('workflow_node_test')
    // 未被覆盖的兄弟字段保持默认
    expect(env.db.host).toBe(loadEnv({}).db.host)
    expect(env.db.port).toBe(3306)
  })

  it('覆盖项可只改 JWT 的某个字段', () => {
    const env = loadEnv({ jwt: { accessTokenExpireMinutes: 5 } as never })
    expect(env.jwt.accessTokenExpireMinutes).toBe(5)
    expect(env.jwt.refreshTokenExpireMinutes).toBe(10080)
  })
})
