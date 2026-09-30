import { Controller, Get, Param, Post, Query } from '@nestjs/common'
import { R } from '../../../common/domain/r'
import { PageResponse } from '../../../common/domain/page-response'
import { JavaStatusOk } from '../../../framework/http/java-status.decorator'
import { intQueryParam, assertPageSize } from '../../../framework/http/query-params'
import { getTenantId } from '../../../framework/tenant/tenant-context'
import { parseProcessPolicy } from '../compiler/process-policy'
import {
  ProcessDesignService,
  type ProcessDefinitionSummaryVO,
  type ProcessVersionVO,
  type VersionEditorVO,
} from '../process-design.service'

/**
 * 已部署流程接口，对齐 Java `ProcessDefinitionController`
 * （前缀 `/api/v1/deployed-processes`）。
 *
 * 响应元素形状对齐 Flowable 的 `ProcessDefinition` 序列化（实测确认）：
 *   { id, key, name, version, deploymentId, resourceName, diagramResourceName,
 *     description, category, tenantId, suspended }
 * 其中 `id` 形如 `key:version:uuid`，`resourceName` 形如 `key.bpmn20.xml`。
 *
 * `category` 的语义（Task 112，流程中心分组修复）：
 * 优先返回 `wfe_process_def.category_id`（部署时从草稿快照的分类，
 * 引擎版 deploy 落库），回退 BPMN targetNamespace（Flowable 语义，
 * 兼容 category_id 为 null 的历史定义）。前端流程中心据此按真分类分组；
 * targetNamespace 的默认值 `http://flowable.org/bpmn` 在前端被归入「未分类」。
 */
@Controller('api/v1/deployed-processes')
@JavaStatusOk()
export class ProcessDefinitionController {
  constructor(private readonly service: ProcessDesignService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('size') size?: string,
  ): Promise<R<PageResponse<Record<string, unknown>>>> {
    const tenantId = getTenantId()
    const safePage = Math.max(intQueryParam(page, 'page', 1), 1)
    const safeSize = intQueryParam(size, 'size', 20)
    // Java 用 `PageRequest.of(Math.max(page,1) - 1, size)` ⇒ size < 1 → HTTP 400
    assertPageSize(safeSize)

    const { rows, total } = await this.service
      .getRepository()
      .listProcessDefs(tenantId, (safePage - 1) * safeSize, safeSize)

    // 流程级可发起范围下发（Task 76）：发起中心据此过滤“我能发起的流程”；
    // 引擎 start() 门禁是真闸门，此处仅是展示层过滤
    const defIds = rows.map((row) => String(row.id))
    const scopeByDef = new Map<string, Record<string, unknown>>()
    if (defIds.length > 0) {
      const configRows = await this.service
        .getRepository()
        .findProcessLevelConfigsByDefIds(defIds)
      for (const cfg of configRows) {
        scopeByDef.set(cfg.process_definition_id ?? '', parseProcessPolicy(cfg.config_json).starterScope)
      }
    }

    const content = rows.map((row) => {
      const key = String(row.process_key)
      const version = Number(row.version)
      return {
        id: String(row.id),
        key,
        name: row.name === null ? null : String(row.name),
        version,
        deploymentId: String(row.id),
        resourceName: `${key}.bpmn20.xml`,
        diagramResourceName: null,
        description: null,
        // Task 112：优先部署时快照的分类 id（流程中心按真分类分组），
        // 回退 Flowable 语义（BPMN targetNamespace），兼容历史 category_id=null 的定义
        category:
          row.category_id !== null && row.category_id !== undefined && String(row.category_id) !== ''
            ? String(row.category_id)
            : row.target_namespace === null
              ? null
              : String(row.target_namespace),
        tenantId,
        suspended: String(row.status) !== 'ACTIVE',
        starterScope: scopeByDef.get(String(row.id)) ?? null,
      }
    })

    return R.ok(new PageResponse(content, safePage, safeSize, total))
  }

  /**
   * 已部署流程精简列表（供调用活动子流程选择下拉）。
   *
   * ⚠️ 必须声明在 `:id` **之前** —— 否则 `summaries` 会被当成流程定义 id。
   *    （Java 侧 `/summaries` 同样排在 `/{id}` 之前；Spring 另有「字面量优先」
   *    规则兜底，Nest 没有，只能靠声明顺序。）
   */
  @Get('summaries')
  async summaries(): Promise<R<ProcessDefinitionSummaryVO[]>> {
    return R.ok(await this.service.listSummaries())
  }

  /**
   * 某 key 的全部已部署版本（version 倒序，最高版本标记 latest）。
   *
   * 路径用**多段** `/key/{key}/versions`，与单段 `/{id}` 不会冲突（Java 亦如此）。
   */
  @Get('key/:key/versions')
  async versions(@Param('key') key: string): Promise<R<ProcessVersionVO[]>> {
    return R.ok(await this.service.listProcessVersions(key))
  }

  /**
   * 历史版本的编辑器数据（BPMN XML + 节点配置快照）。
   *
   * 读取失败 → `R.fail(404, '历史版本数据读取失败')`（HTTP 200 + body 内 code 404）。
   */
  @Get('versions/:procDefId/editor')
  async versionEditor(
    @Param('procDefId') procDefId: string,
  ): Promise<R<VersionEditorVO | null>> {
    const editor = await this.service.getVersionEditor(procDefId)
    if (editor === null) return R.fail(404, '历史版本数据读取失败')
    return R.ok(editor)
  }

  /**
   * 已部署流程定义详情。
   *
   * 不存在时 Java 返回 `R.fail(404, 'Process definition not found')` ——
   * HTTP 仍然是 **200**，404 只出现在 body 里。
   */
  @Get(':id')
  async get(@Param('id') id: string): Promise<R<Record<string, unknown> | null>> {
    const definition = await this.service.getProcessDefinition(id)
    if (definition === null) return R.fail(404, 'Process definition not found')
    return R.ok(definition)
  }

  /** 已部署流程的 BPMN XML（找不到时 data 为 null，状态仍是 200）。 */
  @Get(':id/xml')
  async xml(@Param('id') id: string): Promise<R<string | null>> {
    return R.ok(await this.service.getProcessDefinitionXml(id))
  }

  /** 挂起已部署流程。 */
  @Post(':id/suspend')
  async suspend(@Param('id') id: string): Promise<R<null>> {
    await this.service.suspendProcessDefinition(id)
    return R.ok()
  }

  /** 激活已部署流程。 */
  @Post(':id/activate')
  async activate(@Param('id') id: string): Promise<R<null>> {
    await this.service.activateProcessDefinition(id)
    return R.ok()
  }
}

