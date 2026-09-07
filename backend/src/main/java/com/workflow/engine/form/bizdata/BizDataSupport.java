package com.workflow.engine.form.bizdata;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.FormDefinitionService;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.form.column.DynamicTableManager;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.tenant.TenantProvider;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 业务数据通用实现复用面。
 * 覆盖 handler 与业务服务可注入本组件以复用能力（loadContext/findById/validateRequired/resolvePickerValues）
 * 或委托通用 CRUD（createGeneric/updateGeneric/deleteGeneric/queryGeneric）。
 */
@Component
public class BizDataSupport {

    private static final Pattern FORM_KEY_PATTERN = Pattern.compile("^[a-zA-Z][a-zA-Z0-9_]{0,63}$");

    /** 子表行单次请求上限 */
    private static final int MAX_SUB_ROWS = 100;

    private final JdbcTemplate jdbcTemplate;
    private final DynamicTableManager tableManager;
    private final FormDefinitionService formDefService;
    private final TenantProvider tenantProvider;
    private final ObjectMapper objectMapper;
    private final SqlQueryEngine sqlQueryEngine;

    public BizDataSupport(JdbcTemplate jdbcTemplate,
                          DynamicTableManager tableManager,
                          FormDefinitionService formDefService,
                          TenantProvider tenantProvider,
                          ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.tableManager = tableManager;
        this.formDefService = formDefService;
        this.tenantProvider = tenantProvider;
        this.objectMapper = objectMapper;
        this.sqlQueryEngine = new SqlQueryEngine(jdbcTemplate);
    }

    // ==================== 复用面：上下文/校验/查询 ====================

    /**
     * 加载表单运行时上下文（表名 + 列 + 子表元数据）。
     */
    public BizDataContext loadContext(String formKey) {
        if (formKey == null || !FORM_KEY_PATTERN.matcher(formKey).matches()) {
            throw new BusinessException(400, "非法表单 key: " + formKey);
        }
        String tableName = "wf_biz_" + formKey;
        if (!tableManager.tableExists(tableName)) {
            throw new BusinessException(404, "业务表单数据表不存在: " + formKey);
        }
        List<ColumnConfig> columns = formDefService.getBusinessColumnsByKey(formKey);
        // 主表列：排除子表字段（子表字段映射独立物理表，非主表列）
        List<String> keys = columns.stream()
                .filter(c -> c.getSubColumns() == null || c.getSubColumns().isEmpty())
                .map(ColumnConfig::getKey)
                .toList();
        Map<String, BizDataContext.SubTableDef> subTables = new LinkedHashMap<>();
        for (ColumnConfig c : columns) {
            if (c.getSubColumns() != null && !c.getSubColumns().isEmpty()) {
                String mode = c.getSubMode() == null || c.getSubMode().isBlank() ? "embedded" : c.getSubMode();
                List<String> subKeys = c.getSubColumns().stream().map(ColumnConfig::getKey).toList();
                subTables.put(c.getKey(), new BizDataContext.SubTableDef(
                        "wf_biz_" + formKey + "_" + c.getKey(), mode, c.getSubColumns(), subKeys));
            }
        }
        return new BizDataContext(tableName, formKey, columns, keys, subTables);
    }

    /**
     * 查询单条业务数据；不存在抛 404。
     */
    public BizDataVO findById(String tableName, String tenantId, BizDataContext ctx, String id) {
        String sql = "SELECT * FROM " + tableName + " WHERE id = ? AND tenant_id = ?";
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, id, tenantId);
        if (rows.isEmpty()) {
            throw new BusinessException(404, "业务数据不存在: " + id);
        }
        return toVO(ctx, rows.get(0));
    }

    /**
     * 必填字段校验。
     */
    public void validateRequired(List<ColumnConfig> columns, Map<String, Object> data) {
        Map<String, Object> safe = data == null ? Map.of() : data;
        for (ColumnConfig c : columns) {
            if (c.isRequired()) {
                Object v = safe.get(c.getKey());
                if (v == null || (v instanceof String s && s.isBlank())) {
                    throw new BusinessException(400, "必填字段不能为空: " + c.getLabel());
                }
            }
        }
    }

    /**
     * 遍历 data-picker 引用列：校验 id 存在并生成 {@code <key>_text} 展示缓存文本。
     * 不修改原 data，返回附加字段（{@code <key>_text} → 文本）；引用值为空时返回空文本。
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> resolvePickerValues(BizDataContext ctx, Map<String, Object> data) {
        Map<String, Object> extra = new LinkedHashMap<>();
        for (ColumnConfig col : ctx.columns()) {
            String pickerConfig = col.getPickerConfig();
            if (pickerConfig == null || pickerConfig.isBlank()) {
                continue;
            }
            // 仅 data-picker 引用列生成冗余文本；LookupPicker 列跳过
            if (!isDataPickerColumn(ctx, col)) {
                continue;
            }
            String key = col.getKey();
            Object raw = data.get(key);
            String text = resolvePickerText(ctx, col, raw);
            extra.put(key + "_text", text);
        }
        return extra;
    }

    /**
     * 按表单 key 批量解析显示文本（resolve API 入口）。
     */
    public Map<String, String> resolveByFormKey(String formKey, List<String> ids, String displayField) {
        BizDataContext ctx = loadContext(formKey);
        String field = displayField;
        if (field == null || field.isBlank()) {
            field = ctx.columns().stream()
                    .filter(c -> !c.isHidden() && c.getPickerConfig() == null)
                    .map(ColumnConfig::getKey)
                    .findFirst()
                    .orElseThrow(() -> new BusinessException(400, "目标表单无可解析的显示字段"));
        }
        return resolveDisplayTexts(formKey, ids, field);
    }

    /**
     * 批量解析被引用记录的显示文本（id → displayField 值）。
     */
    public Map<String, String> resolveDisplayTexts(String sourceFormKey, List<String> ids, String displayField) {
        if (sourceFormKey == null || !FORM_KEY_PATTERN.matcher(sourceFormKey).matches()) {
            throw new BusinessException(400, "非法目标表单 key: " + sourceFormKey);
        }
        if (ids == null || ids.isEmpty()) {
            return Map.of();
        }
        if (displayField == null || !displayField.matches("^[a-zA-Z][a-zA-Z0-9_]{0,63}$")) {
            throw new BusinessException(400, "非法显示字段: " + displayField);
        }
        String table = "wf_biz_" + sourceFormKey;
        String placeholders = String.join(",", java.util.Collections.nCopies(ids.size(), "?"));
        String sql = "SELECT id, " + displayField + " FROM " + table
                + " WHERE tenant_id = ? AND id IN (" + placeholders + ")";
        List<Object> params = new ArrayList<>();
        params.add(tenantProvider.getTenantId());
        params.addAll(ids);

        Map<String, String> result = new LinkedHashMap<>();
        for (Map<String, Object> row : jdbcTemplate.queryForList(sql, params.toArray())) {
            Object v = row.get(displayField);
            result.put(String.valueOf(row.get("id")), v == null ? "" : String.valueOf(v));
        }
        return result;
    }

    /**
     * 统计各业务表单被 dataPicker 引用的情况（引用感知）。
     */
    public Map<String, Map<String, Object>> countReferencedBy() {
        Map<String, Map<String, Object>> result = new LinkedHashMap<>();
        int page = 0;
        final int size = 100;
        while (true) {
            Page<FormDefinition> defs = formDefService.list(null, null, "BUSINESS",
                    PageRequest.of(Math.max(page, 1) - 1, size));
            for (FormDefinition def : defs.getContent()) {
                collectPickerRefs(def, result);
            }
            if (defs.getContent().isEmpty() || defs.isLast()) {
                break;
            }
            page++;
        }
        return result;
    }

    // ==================== 通用 CRUD 委托点 ====================

    /**
     * 通用新增实现（不含装饰钩子链；覆盖 handler 委托此方法执行通用插入）。
     */
    @Transactional
    public BizDataVO createGeneric(String formKey, Map<String, Object> data) {
        String tenantId = tenantProvider.getTenantId();
        BizDataContext ctx = loadContext(formKey);

        validateRequired(ctx.columns(), data);

        // data-picker 引用校验与冗余文本生成（不改原 data，返回附加字段）
        Map<String, Object> merged = serializeJsonColumns(data);
        merged.putAll(resolvePickerValues(ctx, merged));

        BizDataQueryBuilder.SqlAndParams insert = BizDataQueryBuilder.buildInsert(
                ctx.tableName(), ctx.columnKeys(), merged, tenantId);
        jdbcTemplate.update(insert.sql(), insert.params().toArray());

        // 子表行写入（随主表创建批量插入）
        String bizId = insertedId(insert);
        for (Map.Entry<String, BizDataContext.SubTableDef> e : ctx.subTables().entrySet()) {
            Object raw = data.get(e.getKey());
            if (raw instanceof List<?> rows) {
                writeSubRows(e.getValue(), bizId, rows);
            }
        }

        // 新行 id 由 buildInsert 内部生成，查询返回
        return findById(ctx.tableName(), tenantId, ctx, bizId);
    }

    /**
     * 通用分页查询实现。
     */
    public BizDataPageVO queryGeneric(String formKey, BizDataQueryRequest req) {
        String tenantId = tenantProvider.getTenantId();
        BizDataContext ctx = loadContext(formKey);

        Map<String, Object> filters = parseFilter(req.getFilter());
        // 列类型映射（key → columnType）：JSON 数组列筛选走 JSON 函数（JSON_CONTAINS/JSON_OVERLAPS）
        Map<String, String> columnTypeOf = ctx.columns().stream()
                .collect(Collectors.toMap(ColumnConfig::getKey,
                        c -> c.getColumnType() == null ? "" : c.getColumnType().toUpperCase(), (a, b) -> a));
        int page = Math.max(req.getPage(), 1);
        // size <= 0 表示不分页取全部（buildSelect 跳过 LIMIT/OFFSET）；正数沿用原钳制上限
        int size = req.getSize() <= 0 ? req.getSize() : Math.min(Math.max(req.getSize(), 1), 100);

        try {
            BizDataQueryBuilder.SqlAndParams count = BizDataQueryBuilder.buildCount(
                    ctx.tableName(), ctx.columnKeys(), columnTypeOf, tenantId, filters, req.getKeyword(), req.getKeywordColumn());

            BizDataQueryBuilder.SqlAndParams select = BizDataQueryBuilder.buildSelect(
                    ctx.tableName(), ctx.columnKeys(), columnTypeOf, tenantId, filters,
                    req.getKeyword(), req.getKeywordColumn(), req.getSort(), req.getOrder(), page - 1, size);

            return sqlQueryEngine.execPage(page, size, count, select, row -> toVO(ctx, row));
        } catch (IllegalArgumentException e) {
            throw new BusinessException(400, e.getMessage());
        }
    }

    /**
     * config 模式分页查询实现（声明式 JOIN，含虚拟列）。
     */
    public BizDataPageVO queryJoinConfig(String formKey, BizDataQueryRequest req,
                                         List<JoinSqlGenerator.JoinConfig> joins) {
        String tenantId = tenantProvider.getTenantId();
        BizDataContext ctx = loadContext(formKey);

        List<JoinSqlGenerator.QueryColumn> columns = buildJoinColumns(ctx, joins);
        Map<String, Object> filters = parseFilter(req.getFilter());
        int page = Math.max(req.getPage(), 1);
        // size <= 0 表示不分页取全部（buildSelect 跳过 LIMIT/OFFSET）；正数沿用原钳制上限
        int size = req.getSize() <= 0 ? req.getSize() : Math.min(Math.max(req.getSize(), 1), 100);

        try {
            BizDataQueryBuilder.SqlAndParams count = JoinSqlGenerator.buildCount(
                    ctx.tableName(), tenantId, joins, columns, filters, req.getKeyword(), req.getKeywordColumn());

            BizDataQueryBuilder.SqlAndParams select = JoinSqlGenerator.buildSelect(
                    ctx.tableName(), tenantId, joins, columns, filters,
                    req.getKeyword(), req.getKeywordColumn(), req.getSort(), req.getOrder(), page - 1, size);

            return sqlQueryEngine.execPage(page, size, count, select, row -> toJoinVO(ctx, joins, row));
        } catch (IllegalArgumentException e) {
            throw new BusinessException(400, e.getMessage());
        }
    }

    /**
     * sql 模式分页查询实现（管理员 SQL 模板包裹，运行时参数白名单透传）。
     * <p>仅校验 formKey 合法性；不校验主表单物理表（管理员 SQL 独立定义，可跨表/聚合）。
     */
    public BizDataPageVO querySqlTemplate(String formKey, BizDataQueryRequest req, FormQueryConfig cfg) {
        // SQL 类型无 formKey 时跳过校验（管理员 SQL 独立定义，不依赖表单）
        if (formKey != null && !FORM_KEY_PATTERN.matcher(formKey).matches()) {
            throw new BusinessException(400, "非法表单 key: " + formKey);
        }
        String tenantId = tenantProvider.getTenantId();
        List<JoinSqlGenerator.QueryColumn> columns = toQueryColumns(cfg.columns());
        Map<String, Object> filters = parseFilter(req.getFilter());
        Map<String, Object> runtimeParams = parseRuntimeParams(req.getParams());
        int page = Math.max(req.getPage(), 1);
        // size <= 0 表示不分页取全部；正数沿用原钳制上限
        int size = req.getSize() <= 0 ? req.getSize() : Math.min(Math.max(req.getSize(), 1), 100);

        try {
            SqlQueryEngine.WrappedQuery wq = SqlTemplateEngine.wrap(
                    cfg.query(), tenantId, columns, filters, req.getKeyword(), req.getKeywordColumn(),
                    req.getSort(), req.getOrder(), page, size, cfg.declaredParams(), runtimeParams);
            return sqlQueryEngine.execPage(page, size, wq.count(), wq.select(), this::toSqlVO);
        } catch (IllegalArgumentException e) {
            throw new BusinessException(400, e.getMessage());
        }
    }

    /** 构建查询列映射：主表列（ref="m."+key，默认全可排可筛）+ 虚拟列（ref=alias+"."+joinField，能力取 join 声明） */
    private List<JoinSqlGenerator.QueryColumn> buildJoinColumns(BizDataContext ctx,
                                                                List<JoinSqlGenerator.JoinConfig> joins) {
        Map<String, String> typeOf = new HashMap<>();
        for (ColumnConfig c : ctx.columns()) {
            typeOf.put(c.getKey(), c.getColumnType() == null ? "" : c.getColumnType().toUpperCase());
        }
        List<JoinSqlGenerator.QueryColumn> columns = new ArrayList<>();
        for (String key : ctx.columnKeys()) {
            columns.add(new JoinSqlGenerator.QueryColumn(key, "m." + key, typeOf.getOrDefault(key, ""), true, true));
        }
        for (JoinSqlGenerator.JoinConfig j : joins) {
            columns.add(new JoinSqlGenerator.QueryColumn(j.virtualKey(), j.alias() + "." + j.joinField(),
                    resolveJoinColumnType(j), j.sortable(), j.filterable()));
        }
        return columns;
    }

    /** 虚拟列类型：目标表单 joinField 的列类型，找不到 fallback "VARCHAR"（查询与 metadata 两处一致） */
    private String resolveJoinColumnType(JoinSqlGenerator.JoinConfig j) {
        try {
            List<ColumnConfig> targetCols = formDefService.getBusinessColumnsByKey(j.targetFormKey());
            if (targetCols != null) {
                for (ColumnConfig c : targetCols) {
                    if (j.joinField().equals(c.getKey())) {
                        return c.getColumnType() == null ? "VARCHAR" : c.getColumnType().toUpperCase();
                    }
                }
            }
        } catch (BusinessException ignored) {
            // 目标表单不可解析时 fallback 类型
        }
        return "VARCHAR";
    }

    /** sql 模式列映射：管理员声明列 → QueryColumn（ref=key，外层子查询输出列名） */
    private List<JoinSqlGenerator.QueryColumn> toQueryColumns(List<ColumnConfig> cols) {
        List<JoinSqlGenerator.QueryColumn> out = new ArrayList<>();
        for (ColumnConfig c : cols) {
            out.add(new JoinSqlGenerator.QueryColumn(c.getKey(), c.getKey(),
                    c.getColumnType() == null ? "" : c.getColumnType().toUpperCase(),
                    Boolean.TRUE.equals(c.getSortable()), Boolean.TRUE.equals(c.getFilterable())));
        }
        return out;
    }

    /** 解析运行时参数（sql 模式透传）；null/空白 → 空 Map；非法 JSON → 400 */
    @SuppressWarnings("unchecked")
    private Map<String, Object> parseRuntimeParams(String paramsJson) {
        if (paramsJson == null || paramsJson.isBlank()) {
            return Map.of();
        }
        try {
            Map<String, Object> map = objectMapper.readValue(paramsJson, Map.class);
            return map == null ? Map.of() : map;
        } catch (JsonProcessingException e) {
            throw new BusinessException(400, "运行时参数 params 格式非法，应为 JSON 对象: " + e.getOriginalMessage());
        }
    }

    /**
     * 通用更新实现（乐观锁；不含装饰钩子链）。
     */
    @Transactional
    public BizDataVO updateGeneric(String formKey, String id, Map<String, Object> data, Integer version) {
        String tenantId = tenantProvider.getTenantId();
        BizDataContext ctx = loadContext(formKey);

        validateRequired(ctx.columns(), data);
        int currentVersion = version == null ? 1 : version;

        Map<String, Object> merged = serializeJsonColumns(data);
        merged.putAll(resolvePickerValues(ctx, merged));

        BizDataQueryBuilder.SqlAndParams update = BizDataQueryBuilder.buildUpdate(
                ctx.tableName(), ctx.columnKeys(), merged, tenantId, id, currentVersion);
        int affected = jdbcTemplate.update(update.sql(), update.params().toArray());

        if (affected == 0) {
            // 区分"记录不存在"（404）与"版本冲突"（409）
            List<Map<String, Object>> exists = jdbcTemplate.queryForList(
                    "SELECT id, version FROM " + ctx.tableName() + " WHERE id = ? AND tenant_id = ?", id, tenantId);
            if (exists.isEmpty()) {
                throw new BusinessException(404, "业务数据不存在: " + id);
            }
            throw new BusinessException(409, "数据已被他人修改，请刷新后重试");
        }

        // 子表行增量 diff（仅当请求携带子表字段时）
        for (Map.Entry<String, BizDataContext.SubTableDef> e : ctx.subTables().entrySet()) {
            Object raw = data.get(e.getKey());
            if (raw instanceof List<?> rows) {
                diffSubRows(e.getValue(), id, rows);
            }
        }

        return findById(ctx.tableName(), tenantId, ctx, id);
    }

    /**
     * 通用删除实现（租户范围限定；不含装饰钩子链）。
     */
    @Transactional
    public void deleteGeneric(String formKey, String id) {
        String tenantId = tenantProvider.getTenantId();
        BizDataContext ctx = loadContext(formKey);

        // 级联删除子表行（同事务）
        for (BizDataContext.SubTableDef def : ctx.subTables().values()) {
            jdbcTemplate.update("DELETE FROM " + def.tableName() + " WHERE tenant_id = ? AND biz_id = ?",
                    tenantId, id);
        }

        BizDataQueryBuilder.SqlAndParams delete = BizDataQueryBuilder.buildDelete(ctx.tableName(), tenantId, id);
        int affected = jdbcTemplate.update(delete.sql(), delete.params().toArray());
        if (affected == 0) {
            throw new BusinessException(404, "业务数据不存在: " + id);
        }
    }

    // ==================== 独立子表行 CRUD（subMode=dedicated 走此接口） ====================

    /**
     * 校验子表字段存在，返回子表定义。
     */
    private BizDataContext.SubTableDef requireSubTable(BizDataContext ctx, String field) {
        BizDataContext.SubTableDef def = ctx.subTables().get(field);
        if (def == null) {
            throw new BusinessException(404, "子表字段不存在: " + field);
        }
        return def;
    }

    /**
     * 校验主表行存在（404）。
     */
    private void requireMainRow(BizDataContext ctx, String id) {
        findById(ctx.tableName(), tenantProvider.getTenantId(), ctx, id);
    }

    /**
     * 分页查询独立子表行（sort_no 升序）。
     */
    public List<Map<String, Object>> listSubRows(String formKey, String id, String field) {
        BizDataContext ctx = loadContext(formKey);
        BizDataContext.SubTableDef def = requireSubTable(ctx, field);
        requireMainRow(ctx, id);
        return readSubRows(def, id);
    }

    /**
     * 新增独立子表行（追加到末尾，sort_no 续接）。
     */
    public Map<String, Object> addSubRow(String formKey, String id, String field, Map<String, Object> data) {
        BizDataContext ctx = loadContext(formKey);
        BizDataContext.SubTableDef def = requireSubTable(ctx, field);
        requireMainRow(ctx, id);
        List<Map<String, Object>> rows = readSubRows(def, id);
        if (rows.size() >= MAX_SUB_ROWS) {
            throw new BusinessException(400, "子表行数超限（最多 " + MAX_SUB_ROWS + " 行）: " + def.tableName());
        }
        return insertOneSubRow(def, id, data, rows.size());
    }

    /**
     * 更新独立子表行（乐观锁：须携带当前 version）。
     */
    public Map<String, Object> updateSubRow(String formKey, String id, String field, String rowId,
                                            Map<String, Object> data, Integer version) {
        BizDataContext ctx = loadContext(formKey);
        BizDataContext.SubTableDef def = requireSubTable(ctx, field);
        requireMainRow(ctx, id);

        // 仅允许更新子业务列（白名单 subKeys 过滤，防注入/防篡改内部列）
        Map<String, Object> safe = new LinkedHashMap<>();
        for (String k : def.subKeys()) {
            if (data.containsKey(k)) {
                safe.put(k, data.get(k));
            }
        }
        if (safe.isEmpty()) {
            throw new BusinessException(400, "更新内容不能为空: " + field);
        }

        StringBuilder set = new StringBuilder();
        List<Object> params = new ArrayList<>();
        for (Map.Entry<String, Object> e : safe.entrySet()) {
            set.append(e.getKey()).append(" = ?, ");
            params.add(e.getValue());
        }
        set.append("version = version + 1, updated_at = NOW()");
        params.add(tenantProvider.getTenantId());
        params.add(id);
        params.add(rowId);
        params.add(version == null ? 1 : version);

        int affected = jdbcTemplate.update("UPDATE " + def.tableName() + " SET " + set
                + " WHERE tenant_id = ? AND biz_id = ? AND id = ? AND version = ?", params.toArray());
        if (affected == 0) {
            throw new BusinessException(409, "子表行已被他人修改或不存在，请刷新后重试");
        }
        return readSubRows(def, id).stream()
                .filter(r -> rowId.equals(String.valueOf(r.get("id"))))
                .findFirst()
                .orElseThrow(() -> new BusinessException(404, "子表行不存在: " + rowId));
    }

    /**
     * 删除独立子表行。
     */
    public void deleteSubRow(String formKey, String id, String field, String rowId) {
        BizDataContext ctx = loadContext(formKey);
        BizDataContext.SubTableDef def = requireSubTable(ctx, field);
        requireMainRow(ctx, id);
        jdbcTemplate.update("DELETE FROM " + def.tableName()
                        + " WHERE tenant_id = ? AND biz_id = ? AND id = ?",
                tenantProvider.getTenantId(), id, rowId);
    }

    // ==================== 内部工具 ====================

    /**
     * 解析 filter JSON 字符串为筛选 Map。空/空白返回空 Map，非法 JSON 抛 400。
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> parseFilter(String filterJson) {
        if (filterJson == null || filterJson.isBlank()) {
            return Map.of();
        }
        try {
            Map<String, Object> map = objectMapper.readValue(filterJson, Map.class);
            return map == null ? Map.of() : map;
        } catch (JsonProcessingException e) {
            throw new BusinessException(400, "筛选参数 filter 格式非法，应为 JSON 对象: " + e.getOriginalMessage());
        }
    }

    private String insertedId(BizDataQueryBuilder.SqlAndParams insert) {
        // buildInsert 的第一个参数即生成的 UUID
        return String.valueOf(insert.params().get(0));
    }

    /**
     * 判断列是否为 data-picker 引用列（需生成 &lt;key&gt;_text 冗余文本）。
     */
    @SuppressWarnings("unchecked")
    private boolean isDataPickerColumn(BizDataContext ctx, ColumnConfig col) {
        String pickerConfig = col.getPickerConfig();
        try {
            Map<String, Object> picker = objectMapper.readValue(pickerConfig, Map.class);
            String pickerType = picker.get("pickerType") == null ? null : String.valueOf(picker.get("pickerType"));
            if ("lookupPicker".equals(pickerType)) {
                return false;
            }
            if ("dataPicker".equals(pickerType)) {
                return true;
            }
            // 无 pickerType 旧配置：LookupPicker 单选值=显示文本（"张三"），且无 <key>_text 冗余列 → 排除
            boolean hasTextColumn = ctx.columns().stream()
                    .anyMatch(c -> (col.getKey() + "_text").equals(c.getKey()));
            return hasTextColumn;
        } catch (JsonProcessingException e) {
            return false;
        }
    }

    @SuppressWarnings("unchecked")
    private String resolvePickerText(BizDataContext ctx, ColumnConfig col, Object raw) {
        try {
            Map<String, Object> picker = objectMapper.readValue(col.getPickerConfig(), Map.class);
            String sourceFormKey = picker.get("sourceFormKey") == null ? null : String.valueOf(picker.get("sourceFormKey"));
            String displayField = picker.get("displayField") == null ? null : String.valueOf(picker.get("displayField"));
            Object maxCountObj = picker.get("maxCount");

            if (raw == null || String.valueOf(raw).isBlank()) {
                return "";
            }
            // 值以 JSON 数组字符串存储（如 ["u1","u2"]；单选为 ["u1"]）
            String rawStr = String.valueOf(raw);
            List<String> ids;
            try {
                ids = objectMapper.readValue(rawStr,
                        objectMapper.getTypeFactory().constructCollectionType(List.class, String.class));
            } catch (JsonProcessingException e) {
                throw new BusinessException(400, "data-picker 引用值格式非法（需 JSON 数组）: " + col.getKey());
            }
            ids.removeIf(String::isBlank);
            if (ids.isEmpty()) {
                return "";
            }
            // maxCount 校验：配置了（非 null 非空）且超限 → 400
            if (maxCountObj != null) {
                int maxCount;
                try {
                    maxCount = Integer.parseInt(String.valueOf(maxCountObj));
                } catch (NumberFormatException e) {
                    throw new BusinessException(400, "data-picker maxCount 配置非法: " + col.getKey());
                }
                if (maxCount > 0 && ids.size() > maxCount) {
                    throw new BusinessException(400,
                            "data-picker 引用数量超出限制（最多 " + maxCount + "）: " + col.getKey());
                }
            }

            Map<String, String> texts = resolveDisplayTexts(sourceFormKey, ids, displayField);
            List<String> ordered = new ArrayList<>();
            for (String id : ids) {
                String t = texts.get(id);
                if (t == null) {
                    throw new BusinessException(400, "引用的数据不存在: " + col.getKey() + "=" + id);
                }
                ordered.add(t);
            }
            // 冗余文本同样以 JSON 数组存储（与 id 数组顺序一致）
            return objectMapper.writeValueAsString(ordered);
        } catch (JsonProcessingException e) {
            throw new BusinessException(400, "data-picker 配置或引用值非法: " + col.getKey());
        }
    }

    /** 解析单个表单 column_config 中的 dataPicker 引用列，聚合到 result */
    @SuppressWarnings("unchecked")
    private void collectPickerRefs(FormDefinition def, Map<String, Map<String, Object>> result) {
        String columnConfig = def.getColumnConfig();
        if (columnConfig == null || columnConfig.isBlank()) {
            return;
        }
        try {
            List<Map<String, Object>> cols = objectMapper.readValue(columnConfig, List.class);
            for (Map<String, Object> col : cols) {
                Object pickerConfig = col.get("pickerConfig");
                if (!(pickerConfig instanceof String s) || s.isBlank()) {
                    continue;
                }
                Map<String, Object> picker = objectMapper.readValue(s, Map.class);
                Object target = picker.get("sourceFormKey");
                if (target == null || String.valueOf(target).isBlank()) {
                    continue;
                }
                String targetKey = String.valueOf(target);
                Map<String, Object> entry = result.computeIfAbsent(targetKey, k -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("count", 0);
                    m.put("referencedBy", new ArrayList<String>());
                    return m;
                });
                entry.put("count", ((Number) entry.get("count")).intValue() + 1);
                ((List<String>) entry.get("referencedBy")).add(def.getKey());
            }
        } catch (JsonProcessingException e) {
            // 非法 column_config 跳过（发布链路已校验，此处容错）
        }
    }

    private BizDataVO toVO(BizDataContext ctx, Map<String, Object> row) {
        Map<String, Object> data = new LinkedHashMap<>();
        for (ColumnConfig c : ctx.columns()) {
            Object v = row.get(c.getKey());
            if (v != null) {
                data.put(c.getKey(), "JSON".equals(c.getColumnType()) ? deserializeJsonValue(v) : v);
            }
        }
        // embedded 模式：附加子表行（按 sort_no 升序），保留 id 供前端 diff
        for (Map.Entry<String, BizDataContext.SubTableDef> e : ctx.subTables().entrySet()) {
            BizDataContext.SubTableDef def = e.getValue();
            if ("embedded".equals(def.subMode())) {
                data.put(e.getKey(), readSubRows(def, String.valueOf(row.get("id"))));
            }
        }
        Integer version = asInt(row.get("version"));
        LocalDateTime createdAt = asDateTime(row.get("created_at"));
        LocalDateTime updatedAt = asDateTime(row.get("updated_at"));
        return new BizDataVO(String.valueOf(row.get("id")), data, version, createdAt, updatedAt);
    }

    /** config 模式行映射：主表列（toVO 逻辑）+ 虚拟列（virtualKey → joinField 值） */
    private BizDataVO toJoinVO(BizDataContext ctx, List<JoinSqlGenerator.JoinConfig> joins, Map<String, Object> row) {
        BizDataVO vo = toVO(ctx, row);
        Map<String, Object> data = vo.getData();
        for (JoinSqlGenerator.JoinConfig j : joins) {
            Object v = row.get(j.virtualKey());
            if (v != null) {
                data.put(j.virtualKey(), v);
            }
        }
        return vo;
    }

    /**
     * sql 模式行映射：外层子查询输出列全量保留（可含聚合列），绕过 BizDataVO 系统列字段的仅主表列逻辑。
     * <p>键统一转小写，消除 H2 等数据库对子查询输出列名规范化为大写的影响，
     * 保证与声明列（columns）的 key 小写约定一致。生产 MySQL 保留 SQL 书写的别名大小写（通常小写），无副作用。
     */
    private BizDataVO toSqlVO(Map<String, Object> row) {
        Map<String, Object> data = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : row.entrySet()) {
            data.put(e.getKey().toLowerCase(), e.getValue());
        }
        data.remove("version");
        data.remove("created_at");
        data.remove("updated_at");
        data.remove("tenant_id");
        Integer version = asInt(row.get("version"));
        LocalDateTime createdAt = asDateTime(row.get("created_at"));
        LocalDateTime updatedAt = asDateTime(row.get("updated_at"));
        // id 保留在 data 中（管理员 SQL 输出可能有非 id 主键/聚合值），BizDataVO.id 取行内 id 兜底
        return new BizDataVO(String.valueOf(row.get("id")), data, version, createdAt, updatedAt);
    }

    /**
     * 对非字符串值（数组/List/Map）序列化为 JSON 字符串（供参数绑定存储）。
     */
    private Map<String, Object> serializeJsonColumns(Map<String, Object> data) {
        Map<String, Object> out = new LinkedHashMap<>(data);
        for (Map.Entry<String, Object> e : data.entrySet()) {
            Object v = e.getValue();
            if (v == null || v instanceof String) {
                continue; // null 跳过；字符串为旧格式容错
            }
            try {
                out.put(e.getKey(), objectMapper.writeValueAsString(v));
            } catch (JsonProcessingException ex) {
                throw new BusinessException(400, "字段 " + e.getKey() + " 无法序列化为 JSON: " + ex.getOriginalMessage());
            }
        }
        return out;
    }

    /** 对 JSON 列值反序列化；parse 失败原样返回（兼容旧逗号串数据） */
    @SuppressWarnings("unchecked")
    private Object deserializeJsonValue(Object v) {
        if (v == null || !(v instanceof String s)) {
            return v;
        }
        try {
            return objectMapper.readValue(s, Object.class);
        } catch (JsonProcessingException e) {
            return v;
        }
    }

    // ==================== 子表读写 ====================

    /**
     * 批量写入子表行（create 场景）。
     */
    private void writeSubRows(BizDataContext.SubTableDef def, String bizId, List<?> rows) {
        if (rows.size() > MAX_SUB_ROWS) {
            throw new BusinessException(400, "子表行数超限（最多 " + MAX_SUB_ROWS + " 行）: " + def.tableName());
        }
        int sortNo = 0;
        for (Object row : rows) {
            insertOneSubRow(def, bizId, toRowMap(row, def.tableName()), sortNo);
            sortNo++;
        }
    }

    /**
     * 子表行增量 diff（update 场景）。
     */
    private void diffSubRows(BizDataContext.SubTableDef def, String bizId, List<?> rows) {
        if (rows.size() > MAX_SUB_ROWS) {
            throw new BusinessException(400, "子表行数超限（最多 " + MAX_SUB_ROWS + " 行）: " + def.tableName());
        }
        List<Map<String, Object>> existing = readSubRows(def, bizId);
        Map<String, Map<String, Object>> existingById = new LinkedHashMap<>();
        for (Map<String, Object> r : existing) {
            existingById.put(String.valueOf(r.get("id")), r);
        }

        Set<String> keepIds = new HashSet<>();
        int sortNo = 0;
        for (Object row : rows) {
            Map<String, Object> m = toRowMap(row, def.tableName());
            Object rawId = m.get("id");
            String rowId = rawId == null ? null : String.valueOf(rawId);
            if (rowId != null && existingById.containsKey(rowId)) {
                Map<String, Object> cur = existingById.get(rowId);
                boolean changed = def.subKeys().stream()
                        .anyMatch(k -> !Objects.equals(cur.get(k), m.get(k)));
                if (changed || !Objects.equals(cur.get("sort_no"), sortNo)) {
                    StringBuilder set = new StringBuilder();
                    List<Object> params = new ArrayList<>();
                    for (String k : def.subKeys()) {
                        set.append(k).append(" = ?, ");
                        params.add(m.get(k));
                    }
                    set.append("sort_no = ?");
                    params.add(sortNo);
                    params.add(tenantProvider.getTenantId());
                    params.add(bizId);
                    params.add(rowId);
                    jdbcTemplate.update("UPDATE " + def.tableName() + " SET " + set
                            + " WHERE tenant_id = ? AND biz_id = ? AND id = ?", params.toArray());
                }
                keepIds.add(rowId);
            } else {
                // 新行：剥离客户端传入的 id，走内部生成
                Map<String, Object> newRow = new LinkedHashMap<>(m);
                newRow.remove("id");
                insertOneSubRow(def, bizId, newRow, sortNo);
            }
            sortNo++;
        }

        // 删除请求中不存在的现有行
        if (existingById.size() > keepIds.size()) {
            List<Object> params = new ArrayList<>();
            params.add(tenantProvider.getTenantId());
            params.add(bizId);
            StringBuilder ph = new StringBuilder();
            for (String id : existingById.keySet()) {
                if (!keepIds.contains(id)) {
                    if (ph.length() > 0) {
                        ph.append(",");
                    }
                    ph.append("?");
                    params.add(id);
                }
            }
            jdbcTemplate.update("DELETE FROM " + def.tableName()
                    + " WHERE tenant_id = ? AND biz_id = ? AND id IN (" + ph + ")", params.toArray());
        }
    }

    /**
     * 查询子表行（按 sort_no 升序，租户范围限定）。
     */
    private List<Map<String, Object>> readSubRows(BizDataContext.SubTableDef def, String bizId) {
        return jdbcTemplate.queryForList("SELECT * FROM " + def.tableName()
                        + " WHERE tenant_id = ? AND biz_id = ? ORDER BY sort_no",
                tenantProvider.getTenantId(), bizId);
    }

    /**
     * 插入单行子表数据（id/biz_id/tenant_id/sort_no/version + 子业务列）。
     */
    private Map<String, Object> insertOneSubRow(BizDataContext.SubTableDef def, String bizId,
                                                Map<String, Object> m, int sortNo) {
        String rowId = UUID.randomUUID().toString().replace("-", "");
        List<Object> params = new ArrayList<>();
        params.add(rowId);
        params.add(bizId);
        params.add(tenantProvider.getTenantId());
        params.add(sortNo);
        params.add(1); // version

        StringBuilder cols = new StringBuilder("id, biz_id, tenant_id, sort_no, version");
        StringBuilder vals = new StringBuilder("?, ?, ?, ?, ?");
        for (String k : def.subKeys()) {
            cols.append(", ").append(k);
            vals.append(", ?");
            params.add(m.get(k));
        }
        jdbcTemplate.update("INSERT INTO " + def.tableName() + " (" + cols + ") VALUES (" + vals + ")",
                params.toArray());

        Map<String, Object> inserted = new LinkedHashMap<>(m);
        inserted.put("id", rowId);
        inserted.put("sort_no", sortNo);
        return inserted;
    }

    /** 子表行必须是 JSON 对象；非法抛 400 */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> toRowMap(Object row, String tableName) {
        if (!(row instanceof Map<?, ?> m)) {
            throw new BusinessException(400, "子表行数据格式非法（需对象）: " + tableName);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<?, ?> e : m.entrySet()) {
            out.put(String.valueOf(e.getKey()), e.getValue());
        }
        return out;
    }

    private static Integer asInt(Object v) {
        if (v instanceof Number n) {
            return n.intValue();
        }
        return v == null ? null : Integer.parseInt(v.toString());
    }

    private static LocalDateTime asDateTime(Object v) {
        if (v instanceof java.sql.Timestamp ts) {
            return ts.toLocalDateTime();
        }
        if (v instanceof LocalDateTime ldt) {
            return ldt;
        }
        return v == null ? null : LocalDateTime.parse(v.toString());
    }
}