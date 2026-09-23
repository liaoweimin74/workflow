import { join } from 'node:path'
import { Kysely, MysqlDialect, sql } from 'kysely'
import { createPool } from 'mysql2'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadEnv } from '../../src/framework/config/env'
import { Migrator } from '../../src/framework/database/migrator'
import type { DB } from '../../src/framework/database/types'
import { runWithTenant } from '../../src/framework/tenant/tenant-context'
import { SystemRepository } from '../../src/system/repository/system.repository'
import { SystemService } from '../../src/system/service/system.service'

/**
 * 菜单 / 组织写端点的集成测试。
 *
 * 【为什么需要这个文件】菜单的三个写端点**不在契约网里**：
 * Java 的 `POST /api/menus` 因为 `MenuCreateRequest.menuType` 上写了
 * `@NotBlank Integer menuType`（`@NotBlank` 只能用于 CharSequence）
 * 而恒抛 HV000030 → HTTP 500，**无法产出 golden**。
 * 没有 golden 的实现等于没验证过 —— 所以这里用「真库 + 真 service」的
 * CRUD 往返测试来补上：
 *   创建 → tree 里出现 → 修改 → tree 里反映 → 删除 → tree 里消失。
 * 组织虽然**有** golden 覆盖，但这几个分支（软删除被 tree 过滤、
 * 有用户时拒绝删除）用真库测更直接，一并放在这里。
 *
 * 【为什么直连 service 而不打 HTTP】打 HTTP 要先过 JWT 认证，
 * 那需要种子里有可用的密码哈希；而这里要验证的是**写路径本身**，
 * 认证与路由由其它测试覆盖。少一层无关依赖，测试更稳。
 *
 * 【为什么用独立库】vitest 默认并行跑测试文件。迁移测试会 DROP 掉
 * `workflow_node_test`，共用会互相踩。这里用 `workflow_node_write_test`。
 */
const TEST_DB = 'workflow_node_write_test'
const MIGRATIONS_DIR = join(process.cwd(), 'migrations')

function makeDb(database?: string): Kysely<unknown> {
  const env = loadEnv()
  return new Kysely<unknown>({
    dialect: new MysqlDialect({
      pool: createPool({
        host: env.db.host,
        port: env.db.port,
        user: env.db.user,
        password: env.db.password,
        database,
        multipleStatements: false,
      }),
    }),
  })
}

describe('菜单与组织写路径（无 golden，用真库验证）', () => {
  let admin: Kysely<unknown>
  let db: Kysely<unknown>
  let service: SystemService

  beforeAll(async () => {
    admin = makeDb()
    await sql`DROP DATABASE IF EXISTS ${sql.id(TEST_DB)}`.execute(admin)
    await sql`CREATE DATABASE ${sql.id(TEST_DB)} CHARACTER SET utf8mb4`.execute(admin)
    db = makeDb(TEST_DB)
    await new Migrator(db, MIGRATIONS_DIR).run()
    service = new SystemService(new SystemRepository(db as Kysely<DB>))
  }, 120_000)

  afterAll(async () => {
    await db?.destroy()
    await admin?.destroy()
  })

  /** 在租户作用域内执行 —— `getTenantId()` 没有作用域会抛 TenantNotSetException。 */
  const asTenant = <T>(fn: () => Promise<T>): Promise<T> => runWithTenant('default', fn)

  describe('菜单', () => {
    it('创建 → tree 里出现 → 修改 → tree 里反映 → 删除 → tree 里消失', async () => {
      await asTenant(async () => {
        const before = await service.menuTree()
        expect(before.some((m) => m.menuName === '集成测试菜单')).toBe(false)

        // ---- 创建：空 children 必须是 null（对齐 Java 的三元表达式）----
        const created = await service.createMenu({
          parentId: null,
          menuName: '集成测试菜单',
          menuType: 2,
          path: '/integration-menu',
          component: 'it/Menu',
          permission: 'it:menu:read',
          icon: 'it-icon',
          sortOrder: 99,
          status: 1,
        })
        expect(created.menuName).toBe('集成测试菜单')
        expect(created.menuType).toBe(2)
        expect(created.sortOrder).toBe(99)
        expect(created.children).toBeNull()
        // parentId 为 null 的菜单是**根节点**，必须出现在 tree 里
        const afterCreate = await service.menuTree()
        expect(afterCreate.map((m) => m.id)).toContain(created.id)

        // ---- 修改：menuName 有文本才改、其余非 null 才改 ----
        const updated = await service.updateMenu(created.id, {
          menuName: '集成测试菜单-改名',
          sortOrder: 98,
          icon: null, // null = 不改
        })
        expect(updated.menuName).toBe('集成测试菜单-改名')
        expect(updated.sortOrder).toBe(98)
        expect(updated.icon).toBe('it-icon')
        const afterUpdate = await service.menuTree()
        expect(afterUpdate.find((m) => m.id === created.id)?.menuName).toBe('集成测试菜单-改名')

        // ---- 删除：软删除，tree 会过滤掉 ----
        await service.deleteMenu(created.id)
        const afterDelete = await service.menuTree()
        expect(afterDelete.map((m) => m.id)).not.toContain(created.id)
      })
    })

    it('存在子菜单时拒绝删除', async () => {
      await asTenant(async () => {
        const parent = await service.createMenu({
          parentId: null,
          menuName: '集成测试父菜单',
          menuType: 1,
          sortOrder: 97,
        })
        const child = await service.createMenu({
          parentId: parent.id,
          menuName: '集成测试子菜单',
          menuType: 2,
          sortOrder: 97,
        })
        // 父菜单的 children 必须带上刚建的子菜单
        const reloaded = (await service.menuTree()).find((m) => m.id === parent.id)
        expect(reloaded?.children?.map((c) => c.id)).toEqual([child.id])

        await expect(service.deleteMenu(parent.id)).rejects.toThrow('存在子菜单，无法删除')

        // ⚠️ 把子菜单**软删除之后，父菜单依然删不掉** —— 因为
        //    `countByParentId` 不过滤 `is_deleted`，软删的子行仍被计入。
        //    Java 的派生查询 `countByParentId` 同样没有这个条件，所以这是
        //    **刻意照抄的行为**，不是 Node 侧的疏漏。写成显式断言，
        //    免得将来有人"顺手"给计数加上 is_deleted 过滤而无人察觉。
        await service.deleteMenu(child.id)
        await expect(service.deleteMenu(parent.id)).rejects.toThrow('存在子菜单，无法删除')
      })
    })

    it('菜单不存在时修改/删除报「菜单不存在」', async () => {
      await asTenant(async () => {
        await expect(service.updateMenu(999_999, { menuName: 'x' })).rejects.toThrow('菜单不存在')
        await expect(service.deleteMenu(999_999)).rejects.toThrow('菜单不存在')
      })
    })
  })

  describe('组织', () => {
    it('创建 → tree 里出现 → 修改 → tree 里反映 → 删除 → tree 里消失', async () => {
      await asTenant(async () => {
        const created = await service.createOrg({
          parentId: null,
          orgName: '集成测试机构',
          orgCode: 'it_org',
          sortOrder: 99,
          status: 1,
        })
        // ⚠️ 字段名是 label / code，不是 orgName / orgCode
        expect(created.label).toBe('集成测试机构')
        expect(created.code).toBe('it_org')
        expect(created.children).toBeNull()

        const afterCreate = await service.orgTree()
        expect(afterCreate.map((o) => o.id)).toContain(created.id)

        const updated = await service.updateOrg(created.id, {
          orgName: '集成测试机构-改名',
          status: null, // null = 不改
        })
        expect(updated.label).toBe('集成测试机构-改名')
        expect(updated.status).toBe(1)

        await service.deleteOrg(created.id)
        expect((await service.orgTree()).map((o) => o.id)).not.toContain(created.id)
      })
    })

    it('存在子节点时拒绝删除', async () => {
      await asTenant(async () => {
        const parent = await service.createOrg({
          parentId: null,
          orgName: '集成测试父机构',
          orgCode: 'it_parent',
          sortOrder: 97,
        })
        const child = await service.createOrg({
          parentId: parent.id,
          orgName: '集成测试子机构',
          orgCode: 'it_child',
          sortOrder: 97,
        })
        await expect(service.deleteOrg(parent.id)).rejects.toThrow('存在子节点，无法删除')
        // 同上：软删除子节点后，父节点**依然**删不掉（计数不过滤 is_deleted）
        await service.deleteOrg(child.id)
        await expect(service.deleteOrg(parent.id)).rejects.toThrow('存在子节点，无法删除')
      })
    })

    it('机构下存在用户时拒绝删除', async () => {
      await asTenant(async () => {
        const org = await service.createOrg({
          parentId: null,
          orgName: '集成测试有用户机构',
          orgCode: 'it_org_with_user',
          sortOrder: 96,
        })
        // 插一个挂在该机构下的用户（直接写库：用户写端点还没迁移）
        const typed = db as Kysely<DB>
        const inserted = await typed
          .insertInto('sys_user')
          .values({
            username: 'it_org_user',
            nickname: 'IT',
            password: 'x',
            status: 1,
            is_deleted: 0,
            org_id: org.id,
            created_at: new Date(),
            updated_at: new Date(),
          })
          .executeTakeFirst()

        await expect(service.deleteOrg(org.id)).rejects.toThrow('该机构下存在用户，无法删除')

        await typed.deleteFrom('sys_user').where('id', '=', Number(inserted.insertId)).execute()
        // 用户删掉后就能删机构了 —— 证明上一条失败确实是「有用户」
        await service.deleteOrg(org.id)
      })
    })

    it('组织不存在时修改/删除报「组织机构不存在」', async () => {
      await asTenant(async () => {
        await expect(service.updateOrg(999_999, { orgName: 'x' })).rejects.toThrow(
          '组织机构不存在',
        )
        await expect(service.deleteOrg(999_999)).rejects.toThrow('组织机构不存在')
      })
    })
  })
})
