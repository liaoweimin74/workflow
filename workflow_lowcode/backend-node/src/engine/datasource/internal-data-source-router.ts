import { Injectable } from '@nestjs/common'
import { BusinessException } from '../../common/exception/business-exception'
import { getTenantId } from '../../framework/tenant/tenant-context'
import type { DataSourceRef } from './adapter/data-source-adapter'
import { BUILT_IN_SOURCE_KEYS, mapSystemInternalPath } from './service/system-source-catalog'

/**
 * SYSTEM 数据源允许的 `sourceKey`，对齐 Java `InternalDataSourceRouter.SYSTEM_SOURCE_KEYS`。
 *
 * 白名单与内建目录同源（`BUILT_IN_SOURCE_KEYS`，8 个）：`internal://` 只允许派发
 * 到已注册的控制器方法，防止它被当成任意路径探测（Java 注释里写明是 SSRF-safe 的意图）。
 */
const SYSTEM_SOURCE_KEYS = BUILT_IN_SOURCE_KEYS

/** 内部端点描述：目标 controller + 方法 + HTTP 方法 + REST 路径。 */
export interface ResolvedEndpoint {
  controller: string
  method: string
  httpMethod: string
  path: string
}

/**
 * `internal://` 数据源的本地派发路由（对齐 Java `InternalDataSourceRouter`）。
 *
 * ⚠️ 路由的**返回值**目前在 Node 侧没有消费者 —— 各适配器分支本来就是直接调用
 *    具体服务（`bizDataService` / 系统内部控制器），不需要绕一圈 HTTP 回自己。
 *    Java 里这个类存在的意义是「校验 + 审计」，其中**校验**部分必须保留：
 *    `resolve` 会先取租户上下文、再校验 formKey / sourceKey 是否在 allowlist 内，
 *    并**在类型或操作不受支持时抛 400**。少了这一步，「未注册的系统数据源」
 *    就会静默走到下游去报一个别的错。
 *
 * ⚠️ 另一处必须照抄的细节：Java 的 `resolveForm` 只要求 `formKey` 非空，
 *    而 SQL 分支另有自己的 `requireFormKey`（消息不同）。两者**不能合并**。
 */
@Injectable()
export class InternalDataSourceRouter {
  /**
   * 解析 `internal://` 数据源到内部端点。
   *
   * 操作名：`list` / `get` / `create` / `update` / `delete`。
   * 失败一律 `BusinessException(400)`（消息与 Java 逐字一致）。
   */
  resolve(dataSource: DataSourceRef, operation: string): ResolvedEndpoint {
    // 透传租户上下文：确保每个 internal:// 调用都在租户上下文中执行
    getTenantId()

    const type = dataSource.type
    if (type === 'FORM') {
      return resolveForm(dataSource.formKey, operation)
    }
    if (type === 'SQL') {
      // SQL：有 formKey 时路由到 BizDataController，无 formKey 时返回虚拟端点
      // （虚拟端点仅用于租户上下文验证，因此**不报错**）
      if (dataSource.formKey !== null && dataSource.formKey.trim() !== '') {
        return resolveForm(dataSource.formKey, operation)
      }
      return { controller: 'SqlDataSource', method: 'query', httpMethod: 'GET', path: '/api/v1/sql-data-source' }
    }
    if (type === 'SYSTEM') {
      return resolveSystem(dataSource.sourceKey, operation)
    }
    throw new BusinessException(400, `不支持的内部数据源类型: ${type}`)
  }
}

/** FORM → BizDataController 的 REST 路径。 */
function resolveForm(formKey: string | null, operation: string): ResolvedEndpoint {
  if (formKey === null || formKey.trim() === '') {
    throw new BusinessException(400, 'FORM 数据源缺少 formKey')
  }
  const base = `/api/v1/biz-data/${formKey}`
  switch (operation) {
    case 'list':
      return { controller: 'BizDataController', method: 'query', httpMethod: 'GET', path: base }
    case 'get':
      return { controller: 'BizDataController', method: 'getById', httpMethod: 'GET', path: `${base}/{id}` }
    case 'create':
      return { controller: 'BizDataController', method: 'create', httpMethod: 'POST', path: base }
    case 'update':
      return { controller: 'BizDataController', method: 'update', httpMethod: 'PUT', path: `${base}/{id}` }
    case 'delete':
      return { controller: 'BizDataController', method: 'delete', httpMethod: 'DELETE', path: `${base}/{id}` }
    default:
      throw new BusinessException(400, `不支持的操作: ${operation}`)
  }
}

/** SYSTEM → SystemInternalController 的 REST 路径（sourceKey 必须在 allowlist 内）。 */
function resolveSystem(sourceKey: string | null, operation: string): ResolvedEndpoint {
  if (sourceKey === null || sourceKey.trim() === '') {
    throw new BusinessException(400, 'SYSTEM 数据源缺少 sourceKey')
  }
  if (!SYSTEM_SOURCE_KEYS.has(sourceKey)) {
    throw new BusinessException(400, `未注册的系统数据源: ${sourceKey}`)
  }
  // 历史两个 key 的操作面不对称（dept-tree 无 get/update，user-tree 无 update），
  // 逐字保留各自的 default 报错；新 6 个 key 的操作面只有 list/get（只读数据源）。
  if (sourceKey === 'dept-tree') {
    switch (operation) {
      case 'list':
        return {
          controller: 'SystemInternalController',
          method: 'deptTree',
          httpMethod: 'GET',
          path: '/api/v1/internal/system/dept-tree',
        }
      case 'create':
        return {
          controller: 'SystemInternalController',
          method: 'createDept',
          httpMethod: 'POST',
          path: '/api/v1/internal/system/dept',
        }
      case 'delete':
        return {
          controller: 'SystemInternalController',
          method: 'deleteDept',
          httpMethod: 'DELETE',
          path: '/api/v1/internal/system/dept/{id}',
        }
      // dept-tree 仅支持 list/create/delete（无 get/update endpoint）
      default:
        throw new BusinessException(400, `dept-tree 不支持的操作: ${operation}`)
    }
  }
  if (sourceKey === 'user-tree') {
    switch (operation) {
      case 'list':
        return {
          controller: 'SystemInternalController',
          method: 'users',
          httpMethod: 'GET',
          path: '/api/v1/internal/system/users',
        }
      case 'get':
        return {
          controller: 'SystemInternalController',
          method: 'getUser',
          httpMethod: 'GET',
          path: '/api/v1/internal/system/users/{id}',
        }
      case 'create':
        return {
          controller: 'SystemInternalController',
          method: 'createUser',
          httpMethod: 'POST',
          path: '/api/v1/internal/system/user',
        }
      case 'delete':
        return {
          controller: 'SystemInternalController',
          method: 'deleteUser',
          httpMethod: 'DELETE',
          path: '/api/v1/internal/system/user/{id}',
        }
      // user-tree 仅支持 list/get/create/delete（无 update endpoint）
      default:
        throw new BusinessException(400, `user-tree 不支持的操作: ${operation}`)
    }
  }
  // 新 6 个内建系统数据源（菜单/角色/字典/流程定义/流程实例/待办任务）：只读，list/get
  const mapped = mapSystemInternalPath(sourceKey)
  switch (operation) {
    case 'list':
      return {
        controller: 'SystemInternalController',
        method: 'systemSourceList',
        httpMethod: 'GET',
        path: `/api/v1/internal/system/${mapped}`,
      }
    case 'get':
      return {
        controller: 'SystemInternalController',
        method: 'systemSourceGet',
        httpMethod: 'GET',
        path: `/api/v1/internal/system/${mapped}/{id}`,
      }
    default:
      throw new BusinessException(400, `${sourceKey} 不支持的操作: ${operation}`)
  }
}
