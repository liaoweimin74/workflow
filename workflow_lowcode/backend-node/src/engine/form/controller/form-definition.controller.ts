import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { R } from '../../../common/domain/r'
import { PageResponse } from '../../../common/domain/page-response'
import { JavaStatusOk } from '../../../framework/http/java-status.decorator'
import { intQueryParam } from '../../../framework/http/query-params'
import { FormDefinitionWriteService } from '../form-definition-write.service'
import {
  FormDefinitionService,
  type FormDefinitionDetailVO,
  type FormDefinitionVO,
  type FormVersionVO,
} from '../service/form-definition.service'

/**
 * 表单定义（对齐 Java `FormDefinitionController`，前缀 `/api/v1/form-definitions`）。
 *
 * 列表分页形状是 `PageResponse{content,pageNumber,pageSize,totalElements,totalPages}`。
 *
 * ⚠️ **写端点返回实体、读端点返回 DTO**（见 `form-definition-write.service.ts`
 *    的 `toEntity`）：写端点带 `tenantId`，读端点不带。这是契约的一部分。
 */
@Controller('api/v1/form-definitions')
@JavaStatusOk()
export class FormDefinitionController {
  constructor(
    private readonly service: FormDefinitionService,
    private readonly writeService: FormDefinitionWriteService,
  ) {}

  /** 分页查询表单定义列表（status/name/type 可选过滤）。 */
  @Get()
  async list(
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('status') status?: string,
    @Query('name') name?: string,
    @Query('type') type?: string,
  ): Promise<R<PageResponse<FormDefinitionVO>>> {
    return R.ok(
      await this.service.list(
        intQueryParam(page, 'page', 1),
        intQueryParam(size, 'size', 20),
        status ?? null,
        name ?? null,
        type ?? null,
      ),
    )
  }

  /**
   * 按 key 取表单定义（最新版本）。
   *
   * ⚠️ 必须声明在 `:id` 之前 —— 否则 `by-key` 会被 `:id` 当成 id 吃掉
   *    （同一个坑在 `/internal/system/users/metadata` 上已经踩过一次）。
   */
  @Get('by-key/:key')
  async getByKey(@Param('key') key: string): Promise<R<FormDefinitionDetailVO>> {
    return R.ok(await this.service.getByKey(key))
  }

  /** 表单定义详情（含 schema / columnConfig）。 */
  @Get(':id')
  async getById(@Param('id') id: string): Promise<R<FormDefinitionDetailVO>> {
    return R.ok(await this.service.getById(id))
  }

  /** 表单的全部版本（version 倒序）。 */
  @Get(':id/versions')
  async getVersions(@Param('id') id: string): Promise<R<FormVersionVO[]>> {
    return R.ok(await this.service.getVersions(id))
  }

  /** 指定版本的表单定义。 */
  @Get(':id/versions/:version')
  async getByVersion(
    @Param('id') id: string,
    @Param('version') version: string,
  ): Promise<R<FormDefinitionDetailVO>> {
    return R.ok(await this.service.getByVersion(id, Number(version)))
  }

  /**
   * 创建表单定义。参数都是**查询参数**（对齐 Java 的 `@RequestParam`）。
   *
   * ⚠️ key 重复 → HTTP **500**（Java 抛 `RuntimeException`），不是业务 200。
   * ⚠️ 创建会**自动建一条数据源**（BUSINESS → FORM、WORKFLOW → WORKFLOW），
   *    见 `FormDefinitionWriteService.syncOnCreated`。
   */
  @Post()
  async create(
    @Query('name') name?: string,
    @Query('key') key?: string,
    @Query('type') type?: string,
    @Query('processKey') processKey?: string,
  ): Promise<R<Record<string, unknown>>> {
    return R.ok(
      await this.writeService.create(name ?? '', key ?? '', type ?? null, processKey ?? null),
    )
  }

  /**
   * 更新表单定义（原地更新，不创建新版本）。
   *
   * ⚠️ 五个字段都是「null 表示不改」；**`version` / `status` 都不变**
   *    —— Java 在 PUBLISHED 上也直接原地改。
   */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: FormDefinitionSaveRequest | null,
  ): Promise<R<Record<string, unknown>>> {
    return R.ok(
      await this.writeService.update(
        id,
        body?.name ?? null,
        body?.key ?? null,
        body?.schema ?? null,
        body?.columnConfig ?? null,
        body?.processKey ?? null,
      ),
    )
  }

  /**
   * 删除表单定义（**软删除**：status → ARCHIVED）。
   *
   * ⚠️ 已发布的表单不允许删除 → `BusinessException(400, "已发布的表单不能删除")`
   *    → **HTTP 200 + body 内 code 400**（与上面两个 500 不同）。
   * ⚠️ 删除会**硬删**对应的数据源。
   */
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<R<null>> {
    await this.writeService.remove(id)
    return R.ok()
  }

  /**
   * 复制表单定义（新功能端点，支持跨类型：工作流 ↔ 业务）。
   *
   * ⚠️ 产物为**草稿**（version=1、publishedVersion=null），发布走既有 `publish`
   *    校验链 —— 工作流表单复制为业务表单时，schema 中的审批类组件会在发布时
   *    被 `validateBusinessSchema` 白名单拦截（复制不拦、发布拦截）。
   * ⚠️ 复制会**同步创建数据源**（同 create），name 跟随新表单名。
   * ⚠️ key 重复 → HTTP **500**（与 create 一致）；name/key 空白或 type 非法 →
   *    业务 400（HTTP 200 + body code）。
   */
  @Post(':id/copy')
  async copy(
    @Param('id') id: string,
    @Body() body: FormCopyRequest | null,
  ): Promise<R<Record<string, unknown>>> {
    return R.ok(
      await this.writeService.copy(id, body?.name ?? '', body?.key ?? '', body?.type ?? null),
    )
  }

  /**
   * 发布表单定义（对齐 Java `@PostMapping("/{id}/publish")`）。
   *
   * ⚠️ **建物理表就发生在这里**（不是 create）：`type=BUSINESS` 时按 `column_config`
   *    创建/变更 `wf_biz_<key>`，带子列的再建子表 `wf_biz_<key>_<field>`。
   * ⚠️ 返回的是**实体**（与 create/update 一样），不是 DTO。
   * ⚠️ 校验失败的错误形态**分两种**：`BusinessException`（→ HTTP 200 + body code）与
   *    DDL 层的 `IllegalArgumentException`（→ **HTTP 400**）。见 `publish` 的注释。
   */
  @Post(':id/publish')
  async publish(@Param('id') id: string): Promise<R<Record<string, unknown>>> {
    return R.ok(await this.writeService.publish(id))
  }
}

/** 表单定义保存请求体，对齐 Java `FormDefinitionSaveRequest`。 */
interface FormDefinitionSaveRequest {
  name?: string | null
  key?: string | null
  schema?: string | null
  columnConfig?: string | null
  processKey?: string | null
}

/** 表单复制请求体（type：目标类型 WORKFLOW / BUSINESS，缺省跟随源类型）。 */
interface FormCopyRequest {
  name?: string | null
  key?: string | null
  type?: string | null
}
