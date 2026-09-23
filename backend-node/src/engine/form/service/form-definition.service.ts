import { Injectable } from '@nestjs/common'
import { PageResponse } from '../../../common/domain/page-response'
import { assertPageSize, blankToNull } from '../../../framework/http/query-params'
import { getTenantId } from '../../../framework/tenant/tenant-context'
import {
  FormDefinitionRepository,
  type FormDefinitionRow,
} from '../repository/form-definition.repository'

/**
 * 表单定义 DTO，逐字对齐 Java `com.workflow.api.dto.FormDefinitionDTO`（11 个字段）。
 *
 * ⚠️ 与 `PageDefinitionDTO` 的区别不只是字段名：这里没有 `formKey` / `dataSourceId`，
 *    多一个 `processKey`。别把两个 DTO 混用。
 */
export interface FormDefinitionVO {
  id: string
  name: string
  key: string
  type: string
  version: number
  status: string
  publishedVersion: number | null
  processKey: string | null
  createdBy: string | null
  createdAt: Date | null
  updatedAt: Date | null
}

function toVO(row: FormDefinitionRow): FormDefinitionVO {
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    type: row.type,
    version: row.version,
    status: row.status,
    publishedVersion: row.published_version,
    processKey: row.process_key,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * 表单定义服务（对齐 Java `FormDefinitionService` 的**只读列表**部分）。
 *
 * 表单模块是 9 个子项目里最复杂的一个（动态列 DDL、字段权限、bizdata、JOIN 查询），
 * 按「补场景 → 录 golden → 按 golden 实现」的顺序增量推进。
 */
@Injectable()
export class FormDefinitionService {
  constructor(private readonly repository: FormDefinitionRepository) {}

  /** 分页查询表单定义列表（status/name/type 可选过滤）。 */
  async list(
    page: number,
    size: number,
    status: string | null,
    name: string | null,
    type: string | null,
  ): Promise<PageResponse<FormDefinitionVO>> {
    // Java 走 `PageRequest.of(Math.max(page, 1) - 1, size)` ⇒ size < 1 → HTTP 400
    assertPageSize(size)
    const tenantId = getTenantId()
    const normalizedPage = Math.max(page, 1)
    const { rows, total } = await this.repository.findPage(
      tenantId,
      { status: blankToNull(status), name: blankToNull(name), type: blankToNull(type) },
      (normalizedPage - 1) * size,
      size,
    )
    return new PageResponse<FormDefinitionVO>(rows.map(toVO), normalizedPage, size, total)
  }

  /** 按 id 取表单定义详情（含 schema / columnConfig）。 */
  async getById(id: string): Promise<FormDefinitionDetailVO> {
    return toDetailVO(await this.requireById(id))
  }

  /** 按 key 取最新版本详情（业务数据管理页用）。 */
  async getByKey(key: string): Promise<FormDefinitionDetailVO> {
    const row = await this.repository.findLatestByKey(key, getTenantId())
    if (row === null) throw notFound(key)
    return toDetailVO(row)
  }

  /** 表单的全部版本（version 倒序），仅返回版本摘要字段。 */
  async getVersions(id: string): Promise<FormVersionVO[]> {
    const formDef = await this.requireById(id)
    const rows = await this.repository.findAllVersionsByKey(formDef.key, getTenantId())
    return rows.map((row) => ({
      id: row.id,
      version: row.version,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
    }))
  }

  /** 指定版本的详情。 */
  async getByVersion(id: string, version: number): Promise<FormDefinitionDetailVO> {
    const formDef = await this.requireById(id)
    const row = await this.repository.findByKeyAndVersion(formDef.key, version, getTenantId())
    if (row === null) {
      // ⚠️ 消息与 Java 逐字一致（注意 `v` 前面没有空格）
      throw new Error(`Form version not found: ${formDef.key} v${version}`)
    }
    return toDetailVO(row)
  }

  private async requireById(id: string): Promise<FormDefinitionRow> {
    const row = await this.repository.findByIdAndTenantId(id, getTenantId())
    if (row === null) throw notFound(id)
    return row
  }
}

/**
 * 对齐 Java `FormDefinitionService` 的
 * `RuntimeException("Form definition not found: " + ...)`。
 *
 * ⚠️ 用**普通 Error**（→ HTTP 500 + 统一错误体）而不是 `BusinessException`：
 *    Java 抛的是 RuntimeException，被兜底异常处理器映射成 500，
 *    **不是** 200 + body 内 code。这里若「顺手」换成 BusinessException，
 *    状态码就从 500 变成 200 —— 那正是契约分叉。
 */
function notFound(keyOrId: string): Error {
  return new Error(`Form definition not found: ${keyOrId}`)
}

/**
 * 表单定义详情 DTO（11 个字段 + schema + columnConfig）。
 *
 * ⚠️ `columnConfig` 是 MySQL `json` 列，但 Java 实体映射成 String，
 *    序列化出来是 **JSON 字符串**而不是对象。DatabaseModule 的 typeCast
 *    已保证 mysql2 不做二次解析，这里直接透传。
 */
export interface FormDefinitionDetailVO extends FormDefinitionVO {
  schema: string | null
  columnConfig: string | null
}

function toDetailVO(row: FormDefinitionRow): FormDefinitionDetailVO {
  return { ...toVO(row), schema: row.schema, columnConfig: row.column_config }
}

/** 表单版本摘要，对齐 Java `FormVersionDTO`。 */
export interface FormVersionVO {
  id: string
  version: number
  status: string
  createdBy: string | null
  createdAt: Date | null
}
