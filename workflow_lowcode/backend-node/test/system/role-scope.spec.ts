import { describe, expect, it } from 'vitest'
import { BusinessException } from '../../src/common/exception/business-exception'
import { ValidationError } from '../../src/common/exception/validation-error'
import { ClientService } from '../../src/system/service/client.service'
import { SystemService } from '../../src/system/service/system.service'

/**
 * Task 5 单元测试：角色挂端（client-scoped-role）。
 *
 * stub repository，不连数据库。钉住简报规则：
 *   - listRoles 按 clientId 过滤 + RoleVO.clientId 增量字段；
 *   - createRole clientId 缺省 1、insertRole 落 client_id；
 *   - updateRole 改端：portal 内置角色集（ROLE_ADMIN/ROLE_USER）拒绝；自定义角色放行；
 *   - ClientService.update defaultRoleId 归属校验（跨端拒 400 / 本端放行 / 不存在拒 / null 清除放行）。
 */

interface FakeRoleRow {
  id: number
  client_id: number
  role_name: string
  role_code: string
  description: string | null
  status: number
  created_at: Date | null
}

function roleRow(patch: Partial<FakeRoleRow>): FakeRoleRow {
  return {
    id: 5,
    client_id: 1,
    role_name: '调度员',
    role_code: 'DISPATCHER',
    description: null,
    status: 1,
    created_at: null,
    ...patch,
  }
}

function makeSystem(stub: Record<string, unknown>): SystemService {
  // clientService 在角色路径不被消费（落点校验只在菜单路径），传空桩即可。
  return new SystemService(stub as never, { options: async () => [] } as never)
}

describe('listRoles 按端过滤', () => {
  it('clientId 参数透传 repository，VO 携带 clientId', async () => {
    const seen: Array<number | undefined> = []
    const svc = makeSystem({
      listRoles: async (_o: number, _l: number, clientId?: number) => {
        seen.push(clientId)
        return {
          rows: [
            {
              id: 1,
              client_id: 2,
              role_name: '平台管理员',
              role_code: 'ROLE_ADMIN',
              description: null,
              status: 1,
              created_at: null,
            },
          ],
          total: 1,
        }
      },
    })
    const page = await svc.listRoles(1, 20, 2)
    expect(seen[0]).toBe(2)
    expect(page.rows[0].clientId).toBe(2)
  })

  it('不传 clientId 时不过滤（透传 undefined，零破坏）', async () => {
    const seen: Array<number | undefined> = []
    const svc = makeSystem({
      listRoles: async (_o: number, _l: number, clientId?: number) => {
        seen.push(clientId)
        return { rows: [], total: 0 }
      },
    })
    await svc.listRoles(1, 20)
    expect(seen[0]).toBeUndefined()
  })
})

describe('createRole 挂端', () => {
  it('clientId 缺省落 1（portal）', async () => {
    const inserts: Array<Record<string, unknown>> = []
    const svc = makeSystem({
      roleCodeExists: async () => false,
      insertRole: async (row: Record<string, unknown>) => {
        inserts.push(row)
        return 9
      },
      findRoleById: async (id: number) => roleRow({ id, client_id: 1 }),
    })
    const vo = await svc.createRole({ roleName: '自定义', roleCode: 'CUSTOM' })
    expect(inserts[0].client_id).toBe(1)
    expect(vo.clientId).toBe(1)
  })

  it('显式 clientId=7 透传落库', async () => {
    const inserts: Array<Record<string, unknown>> = []
    const svc = makeSystem({
      roleCodeExists: async () => false,
      insertRole: async (row: Record<string, unknown>) => {
        inserts.push(row)
        return 9
      },
      findRoleById: async (id: number) => roleRow({ id, client_id: 7 }),
    })
    const vo = await svc.createRole({ roleName: '移动端', roleCode: 'MOB', clientId: 7 })
    expect(inserts[0].client_id).toBe(7)
    expect(vo.clientId).toBe(7)
  })
})

describe('updateRole 改端约束', () => {
  it('portal 内置角色（ROLE_ADMIN）拒绝改端', async () => {
    const svc = makeSystem({
      findRoleById: async () => roleRow({ id: 1, role_code: 'ROLE_ADMIN', client_id: 1 }),
      updateRole: async () => undefined,
    })
    await expect(svc.updateRole(1, { clientId: 2 })).rejects.toBeInstanceOf(BusinessException)
    await expect(svc.updateRole(1, { clientId: 2 })).rejects.toThrow(/内置角色不允许修改所属客户端/)
  })

  it('内置角色 ROLE_USER 同样拒绝改端', async () => {
    const svc = makeSystem({
      findRoleById: async () => roleRow({ id: 2, role_code: 'ROLE_USER', client_id: 1 }),
      updateRole: async () => undefined,
    })
    await expect(svc.updateRole(2, { clientId: 3 })).rejects.toThrow(/内置角色/)
  })

  it('内置角色不带 clientId 的普通编辑放行', async () => {
    const updates: Array<{ id: number; patch: Record<string, unknown> }> = []
    const svc = makeSystem({
      findRoleById: async () => roleRow({ id: 1, role_code: 'ROLE_ADMIN', client_id: 1 }),
      updateRole: async (id: number, patch: Record<string, unknown>) => {
        updates.push({ id, patch })
      },
    })
    await svc.updateRole(1, { roleName: '改名' })
    expect(updates[0].patch.role_name).toBe('改名')
    expect(updates[0].patch.client_id).toBeUndefined()
  })

  it('自定义角色改端：patch 落 client_id 新值', async () => {
    const updates: Array<{ id: number; patch: Record<string, unknown> }> = []
    const svc = makeSystem({
      findRoleById: async (id: number) =>
        id === 11 ? roleRow({ id: 11, client_id: 1 }) : roleRow({ id, client_id: 7 }),
      updateRole: async (id: number, patch: Record<string, unknown>) => {
        updates.push({ id, patch })
      },
    })
    await svc.updateRole(11, { clientId: 7 })
    expect(updates[0].patch.client_id).toBe(7)
  })

  it('clientId 与原值相同视为不改端（放行，不落 patch）', async () => {
    const updates: Array<{ id: number; patch: Record<string, unknown> }> = []
    const svc = makeSystem({
      findRoleById: async (id: number) => roleRow({ id, role_code: 'ROLE_ADMIN', client_id: 1 }),
      updateRole: async (id: number, patch: Record<string, unknown>) => {
        updates.push({ id, patch })
      },
    })
    await svc.updateRole(1, { clientId: 1 })
    expect(updates[0].patch.client_id).toBeUndefined()
  })
})

describe('ClientService.update defaultRoleId 归属校验（tasks 3.3）', () => {
  function makeClient(stub: Record<string, unknown>): ClientService {
    return new ClientService(stub as never)
  }
  const clientStub = {
    findClientById: async (id: number) => ({
      id,
      code: 'it_app',
      name: '应用端',
      icon: null,
      status: 1,
      default_role_id: null,
      default_member_group_id: null,
    }),
    updateClient: async () => undefined,
    listChannelsByClientIds: async () => [],
  }

  it('defaultRoleId 属于别的端 → ValidationError「默认角色必须属于本端」', async () => {
    const svc = makeClient({
      ...clientStub,
      findRoleBrief: async () => roleRow({ id: 1, role_code: 'ROLE_ADMIN', client_id: 1 }),
    })
    await expect(svc.update(9, { defaultRoleId: 1 })).rejects.toBeInstanceOf(ValidationError)
    await expect(svc.update(9, { defaultRoleId: 1 })).rejects.toThrow(/默认角色必须属于本端/)
  })

  it('defaultRoleId 属于本端 → 放行并落库', async () => {
    const patches: Array<Record<string, unknown>> = []
    const svc = makeClient({
      ...clientStub,
      findRoleBrief: async () => roleRow({ id: 12, client_id: 9 }),
      updateClient: async (_id: number, patch: Record<string, unknown>) => {
        patches.push(patch)
      },
    })
    await svc.update(9, { defaultRoleId: 12 })
    expect(patches[0].default_role_id).toBe(12)
  })

  it('defaultRoleId 指向不存在的角色 → ValidationError', async () => {
    const svc = makeClient({ ...clientStub, findRoleBrief: async () => null })
    await expect(svc.update(9, { defaultRoleId: 999 })).rejects.toThrow(/默认角色不存在/)
  })

  it('defaultRoleId=null 清除绑定，不做归属校验', async () => {
    const patches: Array<Record<string, unknown>> = []
    const svc = makeClient({
      ...clientStub,
      updateClient: async (_id: number, patch: Record<string, unknown>) => {
        patches.push(patch)
      },
    })
    await svc.update(9, { defaultRoleId: null })
    expect(patches[0].default_role_id).toBeNull()
  })
})
