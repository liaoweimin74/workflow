import { describe, expect, it } from 'vitest'
import { ProcessDesignService } from '../../../src/engine/process/process-design.service'
import { runWithTenant } from '../../../src/framework/tenant/tenant-context'

/**
 * 流程定义复制（`POST /process-definitions/{id}/copy`）的单测。
 *
 * golden（场景「流程定义复制」）覆盖了响应与编辑器两条链路，
 * 这里补它**看不到**的三件事：
 *   ① 写入库里的行与**响应**不同（响应的时间戳必须是 null，库里却有值）；
 *   ② 节点配置复制时**换了新 id / 新 process_def_id**，而不是原样搬过去；
 *   ③ 源不存在时的**异常类型**（普通 Error → HTTP 500，不是 BusinessException）。
 */

const SOURCE = {
  id: 'source-draft-id',
  tenant_id: 'default',
  process_key: 'contract_copy_ab12cd',
  name: '契约复制流程',
  category_id: 'cat-1',
  bpmn_xml: '<bpmn:definitions><bpmn:process id="contract_copy_ab12cd" /></bpmn:definitions>',
  status: 'DRAFT',
  version: 3,
  deploy_id: 'old-deploy',
  process_definition_id: 'old-def:1:uuid',
  deployed_config_hash: 'hash',
  deployed_xml: '<old/>',
  last_deployed_at: new Date('2026-01-01T00:00:00Z'),
  created_by: 'admin',
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-02T00:00:00Z'),
}

function serviceWith(options: { source?: typeof SOURCE | null; configs?: unknown[] } = {}) {
  const inserted: Array<Record<string, unknown>> = []
  const insertedConfigs: Array<Array<Record<string, unknown>>> = []
  const service = new ProcessDesignService({
    findDraftById: async () => (options.source === undefined ? SOURCE : options.source),
    insertDraft: async (row: Record<string, unknown>) => {
      inserted.push(row)
    },
    findEditingConfigs: async () => options.configs ?? [],
    insertConfigs: async (rows: Array<Record<string, unknown>>) => {
      insertedConfigs.push(rows)
    },
  } as never)
  return { service, inserted, insertedConfigs }
}

describe('copyProcess', () => {
  it('名称加 " (副本)"、key 加 "_copy_" + 新 id 前 8 位', async () => {
    const { service } = serviceWith()
    const vo = await runWithTenant('default', () => service.copyProcess('source-draft-id'))
    expect(vo.name).toBe('契约复制流程 (副本)')
    // ⚠️ 后缀必须是**新 id 的前 8 位**，不是时间戳 —— 用时间戳会让副本 key
    //    无法在两侧归一化（契约永远对不上），且格式也与 Java 不同。
    expect(vo.key).toBe(`contract_copy_ab12cd_copy_${vo.id.substring(0, 8)}`)
    expect(vo.key).toMatch(/_copy_[0-9a-f]{8}$/)
  })

  it('bpmnXml **原样复制**（不是空图）', async () => {
    const { service } = serviceWith()
    const vo = await runInTenant(() => service.copyProcess('source-draft-id'))
    expect(vo.bpmnXml).toBe(SOURCE.bpmn_xml)
    // 空图会是一张只有 startEvent 的骨架；这里必须仍带源流程的 process id
    expect(vo.bpmnXml).toContain('contract_copy_ab12cd')
  })

  it('部署相关字段全部复位', async () => {
    const { service } = serviceWith()
    const vo = await runInTenant(() => service.copyProcess('source-draft-id'))
    expect(vo.status).toBe('DRAFT')
    expect(vo.version).toBe(0)
    expect(vo.deployId).toBeNull()
    expect(vo.processDefinitionId).toBeNull()
    expect(vo.deployedXml).toBeNull()
    expect(vo.deployedConfigHash).toBeNull()
    expect(vo.lastDeployedAt).toBeNull()
  })

  // ⚠️ 这是最容易写错的一条：Java 的 copyProcess 带 @Transactional，
  //    flush 被推迟到方法返回之后 ⇒ 实体上的 @PrePersist 还没跑 ⇒ 响应里两个时间戳是 null；
  //    而**不带事务的 createDraft** 因为在 save() 内部就 flush 了，响应里时间是有的。
  //    所以库里的行要有值、返回的 VO 必须置空。
  it('时间戳：写库有值，但响应里为 null', async () => {
    const { service, inserted } = serviceWith()
    const vo = await runInTenant(() => service.copyProcess('source-draft-id'))
    expect(vo.createdAt).toBeNull()
    expect(vo.updatedAt).toBeNull()
    expect(inserted[0].created_at).toBeInstanceOf(Date)
    expect(inserted[0].updated_at).toBeInstanceOf(Date)
  })

  it('节点配置一起复制，但换新 id 与新的 process_def_id', async () => {
    const configs = [
      { id: 'cfg-1', tenant_id: 'default', process_def_id: 'source-draft-id', node_id: 'Approve_1', node_type: 'userTask', config_json: '{"operations":{"allowTransfer":true}}', process_definition_id: null },
      { id: 'cfg-2', tenant_id: 'default', process_def_id: 'source-draft-id', node_id: '__PROCESS__', node_type: 'process', config_json: '{}', process_definition_id: null },
    ]
    const { service, insertedConfigs } = serviceWith({ configs })
    const vo = await runInTenant(() => service.copyProcess('source-draft-id'))

    expect(insertedConfigs).toHaveLength(1)
    const copied = insertedConfigs[0]
    expect(copied).toHaveLength(2)
    // 内容是照搬的
    expect(copied.map((c) => c.node_id)).toEqual(['Approve_1', '__PROCESS__'])
    expect(copied[0].config_json).toBe(configs[0].config_json)
    // 但主键与归属必须换新，否则会把源草稿的配置抢过来
    expect(copied[0].process_def_id).toBe(vo.id)
    expect(copied[0].process_def_id).not.toBe('source-draft-id')
    expect(copied[0].id).not.toBe('cfg-1')
    expect(copied[0].tenant_id).toBe('default')
  })

  it('源没有编辑态配置时不调用插入', async () => {
    const { service, insertedConfigs } = serviceWith({ configs: [] })
    await runInTenant(() => service.copyProcess('source-draft-id'))
    expect(insertedConfigs).toEqual([])
  })

  // ⚠️ 普通 Error：Java 抛 RuntimeException("Process draft not found: ") → HTTP 500 + body code 500，
  //    而 BusinessException 会走 HTTP 200 + body code。两者在契约里完全不同。
  it('源不存在 → 普通 Error「Process draft not found: id」', async () => {
    const { service, inserted } = serviceWith({ source: null })
    await expect(
      runInTenant(() => service.copyProcess('ghost')),
    ).rejects.toThrow('Process draft not found: ghost')
    expect(inserted).toEqual([])
  })
})

/** 租户作用域包装（名字短一点，避免每处都写 runWithTenant）。 */
function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return runWithTenant('default', fn)
}
