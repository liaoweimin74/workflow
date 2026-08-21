package com.workflow.engine.datasource;

import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.tenant.TenantProvider;
import org.springframework.stereotype.Component;

import java.util.Set;

/**
 * internal:// 数据源本地派发路由。
 * 将 DataSourceDefinition + 操作名，映射到允许内dispatch 的控制器方法（allowlist）。
 *
 * 约定：
 * - FORM：formKey → BizDataController REST 路径
 * - SYSTEM：sourceKey 必须在 allowlist 中（dept-tree / user-tree）→ SystemInternalController REST 路径
 * - 未注册类型 / 缺少 formKey / 未知 sourceKey → 400 拒绝
 *
 * allowlist 仅允许已注册的 controller 方法调用，防止 internal:// 被用于任意路径探测（SSRF-safe）。
 */
@Component
public class InternalDataSourceRouter {

    /** SYSTEM sourceKey 允许列表 */
    private static final Set<String> SYSTEM_SOURCE_KEYS = Set.of("dept-tree", "user-tree");

    private final TenantProvider tenantProvider;

    public InternalDataSourceRouter(TenantProvider tenantProvider) {
        this.tenantProvider = tenantProvider;
    }

    /**
     * 解析 internal:// 数据源到内部端点。
     *
     * @param ds         数据源定义（type + formKey/sourceKey）
     * @param operation  操作名：list / get / create / update / delete
     * @return ResolvedEndpoint（controller bean 名 + 方法名 + HTTP 方法 + REST 路径）
     * @throws BusinessException    400 — 类型不支持 / formKey 缺失 / sourceKey 未注册 / 操作不支持
     * @throws TenantNotSetException 租户上下文未设置
     */
    public ResolvedEndpoint resolve(DataSourceDefinition ds, String operation) {
        // 透传租户上下文：确保每个 internal:// 调用都在租户上下文中执行
        tenantProvider.getTenantId();

        String type = ds.getType();
        if ("FORM".equals(type)) {
            return resolveForm(ds.getFormKey(), operation);
        }
        if ("SYSTEM".equals(type)) {
            return resolveSystem(ds.getSourceKey(), operation);
        }
        throw new BusinessException(400, "不支持的内部数据源类型: " + type);
    }

    /** 内部端点描述：目标 controller + 方法 + HTTP 方法 + REST 路径。 */
    public record ResolvedEndpoint(String controller, String method,
                                   String httpMethod, String path) {}

    // ==================== FORM → BizDataController ====================

    private ResolvedEndpoint resolveForm(String formKey, String operation) {
        if (formKey == null || formKey.isBlank()) {
            throw new BusinessException(400, "FORM 数据源缺少 formKey");
        }
        String base = "/api/v1/biz-data/" + formKey;
        return switch (operation) {
            case "list"   -> new ResolvedEndpoint("BizDataController", "query",    "GET",    base);
            case "get"    -> new ResolvedEndpoint("BizDataController", "getById",  "GET",    base + "/{id}");
            case "create" -> new ResolvedEndpoint("BizDataController", "create",   "POST",   base);
            case "update" -> new ResolvedEndpoint("BizDataController", "update",   "PUT",    base + "/{id}");
            case "delete" -> new ResolvedEndpoint("BizDataController", "delete",   "DELETE", base + "/{id}");
            default -> throw new BusinessException(400, "不支持的操作: " + operation);
        };
    }

    // ==================== SYSTEM → SystemInternalController ====================

    private ResolvedEndpoint resolveSystem(String sourceKey, String operation) {
        if (sourceKey == null || sourceKey.isBlank()) {
            throw new BusinessException(400, "SYSTEM 数据源缺少 sourceKey");
        }
        if (!SYSTEM_SOURCE_KEYS.contains(sourceKey)) {
            throw new BusinessException(400, "未注册的系统数据源: " + sourceKey);
        }
        return switch (sourceKey) {
            case "dept-tree" -> switch (operation) {
                case "list"   -> new ResolvedEndpoint("SystemInternalController", "deptTree",    "GET",    "/api/v1/internal/system/dept-tree");
                case "create" -> new ResolvedEndpoint("SystemInternalController", "createDept",  "POST",   "/api/v1/internal/system/dept");
                case "delete" -> new ResolvedEndpoint("SystemInternalController", "deleteDept",  "DELETE", "/api/v1/internal/system/dept/{id}");
                // dept-tree 仅支持 list/create/delete（无 get/update endpoint）
                default -> throw new BusinessException(400, "dept-tree 不支持的操作: " + operation);
            };
            case "user-tree" -> switch (operation) {
                case "list"   -> new ResolvedEndpoint("SystemInternalController", "users",       "GET",    "/api/v1/internal/system/users");
                case "get"    -> new ResolvedEndpoint("SystemInternalController", "getUser",     "GET",    "/api/v1/internal/system/users/{id}");
                case "create" -> new ResolvedEndpoint("SystemInternalController", "createUser",  "POST",   "/api/v1/internal/system/user");
                case "delete" -> new ResolvedEndpoint("SystemInternalController", "deleteUser",  "DELETE", "/api/v1/internal/system/user/{id}");
                // user-tree 仅支持 list/get/create/delete（无 update endpoint）
                default -> throw new BusinessException(400, "user-tree 不支持的操作: " + operation);
            };
            default -> throw new BusinessException(400, "未注册的系统数据源: " + sourceKey);
        };
    }
}
