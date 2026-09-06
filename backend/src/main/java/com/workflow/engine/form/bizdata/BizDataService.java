package com.workflow.engine.form.bizdata;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.engine.form.FormDefinitionService;
import com.workflow.engine.form.column.DynamicTableManager;
import com.workflow.engine.tenant.TenantProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 业务数据服务门面。
 * 按统一顺序路由：覆盖短路 → 守卫检查（update/delete）→ 装饰钩子链 → 通用委托（BizDataSupport）。
 * 通用 SQL 实现与子表读写全部下沉至 {@link BizDataSupport}，本类仅保留路由与编排。
 */
@Service
public class BizDataService {

    /** 覆盖索引的可覆盖操作集合 */
    private static final Set<String> OVERRIDE_OPS = Set.of("create", "update", "delete", "query");

    private final BizDataSupport support;
    private final TenantProvider tenantProvider;
    private final List<FormProcessGuard> guards;
    /** formKey → 钩子列表（按 Spring 注入顺序） */
    private final Map<String, List<BizDataHandler>> handlerIndex;
    /** formKey+操作 → 覆盖 handler（覆盖声明为 true 时的短路径接管，不执行通用实现） */
    private final Map<String, BizDataHandler> coveringIndex;

    /**
     * @param handlers Spring 自动注入所有 BizDataHandler bean（无则空列表）
     * @param guards   Spring 自动注入所有 FormProcessGuard bean（无则空列表）
     */
    public BizDataService(JdbcTemplate jdbcTemplate,
                          DynamicTableManager tableManager,
                          FormDefinitionService formDefService,
                          TenantProvider tenantProvider,
                          ObjectMapper objectMapper,
                          List<BizDataHandler> handlers,
                          List<FormProcessGuard> guards) {
        this.support = new BizDataSupport(jdbcTemplate, tableManager, formDefService, tenantProvider, objectMapper);
        this.tenantProvider = tenantProvider;
        this.guards = guards == null ? List.of() : guards;
        this.handlerIndex = buildHandlerIndex(handlers);
        this.coveringIndex = buildCoveringIndex(handlers);
    }

    private static Map<String, List<BizDataHandler>> buildHandlerIndex(List<BizDataHandler> handlers) {
        Map<String, List<BizDataHandler>> index = new HashMap<>();
        if (handlers == null) {
            return index;
        }
        for (BizDataHandler handler : handlers) {
            if (handler.getFormKey() == null || handler.getFormKey().isBlank()) {
                throw new IllegalStateException("BizDataHandler.getFormKey() 不能为空: " + handler.getClass().getName());
            }
            index.computeIfAbsent(handler.getFormKey(), k -> new ArrayList<>()).add(handler);
        }
        return index;
    }

    /**
     * 构建覆盖索引（key = formKey + "." + 操作 → handler）。
     * 同一 (formKey, op) 出现 2 个及以上有效覆盖声明时抛 IllegalStateException（启动 fail-fast）。
     */
    private static Map<String, BizDataHandler> buildCoveringIndex(List<BizDataHandler> handlers) {
        Map<String, BizDataHandler> index = new HashMap<>();
        if (handlers == null) {
            return index;
        }
        for (BizDataHandler handler : handlers) {
            String formKey = handler.getFormKey();
            for (String op : OVERRIDE_OPS) {
                if (!isOverriding(handler, op)) {
                    continue;
                }
                BizDataHandler previous = index.putIfAbsent(formKey + "." + op, handler);
                if (previous != null) {
                    throw new IllegalStateException("duplicate override declaration: " + formKey + "." + op);
                }
            }
        }
        return index;
    }

    private static boolean isOverriding(BizDataHandler handler, String op) {
        return switch (op) {
            case "create" -> handler.overridesCreate();
            case "update" -> handler.overridesUpdate();
            case "delete" -> handler.overridesDelete();
            case "query" -> handler.overridesQuery();
            default -> false;
        };
    }

    private List<BizDataHandler> handlersOf(String formKey) {
        return handlerIndex.getOrDefault(formKey, List.of());
    }

    // ==================== 主表 CRUD 入口 ====================

    /**
     * 新增业务数据（覆盖短路 → 装饰钩子链 → 通用委托）。
     */
    @Transactional
    public BizDataVO create(String formKey, Map<String, Object> data) {
        BizDataHandler covering = coveringIndex.get(formKey + ".create");
        if (covering != null) {
            return covering.create(data);
        }
        support.loadContext(formKey);
        for (BizDataHandler handler : handlersOf(formKey)) {
            handler.beforeCreate(data);
        }
        BizDataVO created = support.createGeneric(formKey, data);
        for (BizDataHandler handler : handlersOf(formKey)) {
            handler.afterCreate(created);
        }
        return created;
    }

    /**
     * 分页查询业务数据（覆盖短路 → 通用委托）。
     */
    public BizDataPageVO query(String formKey, BizDataQueryRequest req) {
        BizDataHandler covering = coveringIndex.get(formKey + ".query");
        if (covering != null) {
            return covering.query(req);
        }
        return support.queryGeneric(formKey, req);
    }

    /**
     * 查询单条业务数据。
     */
    public BizDataVO getById(String formKey, String id) {
        BizDataContext ctx = support.loadContext(formKey);
        return support.findById(ctx.tableName(), tenantProvider.getTenantId(), ctx, id);
    }

    /**
     * 更新业务数据（乐观锁；覆盖短路 → 守卫检查 → 装饰钩子链 → 通用委托）。
     */
    @Transactional
    public BizDataVO update(String formKey, String id, Map<String, Object> data, Integer version) {
        BizDataHandler covering = coveringIndex.get(formKey + ".update");
        if (covering != null) {
            return covering.update(id, data, version);
        }
        BizDataContext ctx = support.loadContext(formKey);
        BizDataVO existing = support.findById(ctx.tableName(), tenantProvider.getTenantId(), ctx, id);
        for (BizDataHandler handler : handlersOf(formKey)) {
            handler.beforeUpdate(data, existing);
        }
        BizDataVO updated = support.updateGeneric(formKey, id, data, version);
        return updated;
    }

    /**
     * 删除业务数据（租户范围限定；覆盖短路 → 守卫检查 → 装饰钩子链 → 通用委托）。
     */
    @Transactional
    public void delete(String formKey, String id) {
        BizDataHandler covering = coveringIndex.get(formKey + ".delete");
        if (covering != null) {
            covering.delete(id);
            return;
        }
        BizDataContext ctx = support.loadContext(formKey);
        BizDataVO existing = support.findById(ctx.tableName(), tenantProvider.getTenantId(), ctx, id);
        for (BizDataHandler handler : handlersOf(formKey)) {
            handler.beforeDelete(existing);
        }
        support.deleteGeneric(formKey, id);
    }

    // ==================== 独立子表行 CRUD ====================

    /**
     * 分页查询独立子表行（sort_no 升序）。
     */
    public List<Map<String, Object>> listSubRows(String formKey, String id, String field) {
        return support.listSubRows(formKey, id, field);
    }

    /**
     * 新增独立子表行（追加到末尾，sort_no 续接）。
     */
    @Transactional
    public Map<String, Object> addSubRow(String formKey, String id, String field, Map<String, Object> data) {
        return support.addSubRow(formKey, id, field, data);
    }

    /**
     * 更新独立子表行（乐观锁：须携带当前 version）。
     */
    @Transactional
    public Map<String, Object> updateSubRow(String formKey, String id, String field, String rowId,
                                            Map<String, Object> data, Integer version) {
        return support.updateSubRow(formKey, id, field, rowId, data, version);
    }

    /**
     * 删除独立子表行。
     */
    @Transactional
    public void deleteSubRow(String formKey, String id, String field, String rowId) {
        support.deleteSubRow(formKey, id, field, rowId);
    }

    // ==================== 引用解析 ====================

    /**
     * 按表单 key 批量解析显示文本（resolve API 入口）。
     */
    public Map<String, String> resolveByFormKey(String formKey, List<String> ids, String displayField) {
        return support.resolveByFormKey(formKey, ids, displayField);
    }

    /**
     * 批量解析被引用记录的显示文本（id → displayField 值）。
     */
    public Map<String, String> resolveDisplayTexts(String sourceFormKey, List<String> ids, String displayField) {
        return support.resolveDisplayTexts(sourceFormKey, ids, displayField);
    }

    /**
     * 统计各业务表单被 dataPicker 引用的情况（引用感知）。
     */
    public Map<String, Map<String, Object>> countReferencedBy() {
        return support.countReferencedBy();
    }
}