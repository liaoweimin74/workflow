package com.workflow.engine.form.bizdata;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.api.dto.JoinPreviewVO;
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
        Map<String, Object> merged = serializeJsonColumns(data, ctx.columns());
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
            // 运行时兜底校验（对齐 Node 新版）：必填/标识符格式/唯一/主表冲突 —— 存量脏配置快速 400 而非畸形 SQL
            List<String> mainColumnsWithId = new ArrayList<>(ctx.columnKeys());
            mainColumnsWithId.add("id"); // SELECT m.* 已带主键，虚拟列同名会重复列错误
            JoinSqlGenerator.validate(joins, mainColumnsWithId);

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
            return sqlQueryEngine.execPage(page, size, wq.count(), wq.select(),
                    row -> toSqlVO(cfg.columns(), row));
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
        for (JoinSqlGenerator.JoinGroup g : JoinSqlGenerator.group(joins)) {
            for (JoinSqlGenerator.JoinConfig m : g.members()) {
                List<ColumnConfig> targetCols = resolveJoinTargets(m);
                columns.add(new JoinSqlGenerator.QueryColumn(m.virtualKey(), g.alias() + "." + m.joinField(),
                        joinColumnType(targetCols, m.joinField()), m.sortable(), m.filterable()));
                // 目标表单含 <joinField>_text 冗余文本列（dataPicker 引用列）→ 带出 <virtualKey>_text，供前端引用渲染显示文本
                if (findJoinTarget(targetCols, m.joinField() + "_text") != null) {
                    columns.add(new JoinSqlGenerator.QueryColumn(m.virtualKey() + "_text",
                            g.alias() + "." + m.joinField() + "_text",
                            joinColumnType(targetCols, m.joinField() + "_text"), false, false));
                }
            }
        }
        return columns;
    }

    /**
     * config 模式 SQL 预览：生成主表 + JOIN 虚拟列完整 SELECT（无筛选/无关键词/默认排序/不分页）。
     * 校验 formKey 合法且主表存在（loadContext）；目标表存在性由保存校验负责，预览不重复校验。
     * <p>
     * 目标可为业务表单或内建数据源（{@link JoinTargetCatalog} 白名单解析物理表）。
     * ⚠️ 目标 key 安全校验：非内建白名单 key 必须匹配 FORM key 模式，否则
     * {@code wf_biz_<key>} 拼接会产生畸形/可注入表名 —— 生成器不做这层，这里拦。
     * alias 兜底：前端不录入 alias（由保存侧/运行时分配），预览按序临时分配（j1/j2/...），
     * 避免 null 引用拼进 SQL（对齐 NodeJS previewJoinSql）。
     */
    public JoinPreviewVO previewJoinSql(String formKey, List<JoinSqlGenerator.JoinConfig> joins) {
        BizDataContext ctx = loadContext(formKey);
        if (joins != null) {
            for (JoinSqlGenerator.JoinConfig join : joins) {
                String targetKey = join.targetFormKey() == null ? "" : join.targetFormKey();
                if (!JoinTargetCatalog.isJoinTargetSystemKey(targetKey)
                        && !FORM_KEY_PATTERN.matcher(targetKey).matches()) {
                    throw new BusinessException(400, "非法关联目标: " + targetKey);
                }
            }
        }
        List<JoinSqlGenerator.JoinConfig> aliasedJoins = withAutoAliases(joins);
        String tenantId = tenantProvider.getTenantId();
        List<JoinSqlGenerator.QueryColumn> columns = buildJoinColumns(ctx, aliasedJoins);
        BizDataQueryBuilder.SqlAndParams select = JoinSqlGenerator.buildSelect(
                ctx.tableName(), tenantId, aliasedJoins, columns, Map.of(),
                null, null, null, null, 0, 0);
        return new JoinPreviewVO(select.sql(), select.params());
    }

    /** alias 兜底分配：空/非法/重复 alias 按 j1/j2/... 找空位（复用 {@link FormQueryConfig#ensureAlias}）。 */
    private static List<JoinSqlGenerator.JoinConfig> withAutoAliases(List<JoinSqlGenerator.JoinConfig> joins) {
        if (joins == null || joins.isEmpty()) {
            return List.of();
        }
        List<JoinSqlGenerator.JoinConfig> out = new ArrayList<>(joins.size());
        Set<String> used = new HashSet<>();
        int idx = 0;
        for (JoinSqlGenerator.JoinConfig j : joins) {
            idx++;
            out.add(new JoinSqlGenerator.JoinConfig(
                    FormQueryConfig.ensureAlias(j.alias(), used, idx),
                    j.targetFormKey(), j.localField(), j.foreignField(),
                    j.joinField(), j.virtualKey(), j.label(),
                    j.sortable(), j.filterable()));
        }
        return out;
    }

    /**
     * 目标列列表：内建数据源 → {@link JoinTargetCatalog} 物理列；业务表单 → form_def 列；
     * 解析失败/不存在 → 空列表（调用方统一按"查不到"处理）。
     */
    private List<ColumnConfig> resolveJoinTargets(JoinSqlGenerator.JoinConfig j) {
        List<JoinTargetCatalog.JoinTargetSystemColumn> systemColumns =
                JoinTargetCatalog.systemColumns(j.targetFormKey());
        if (systemColumns != null) {
            List<ColumnConfig> out = new ArrayList<>(systemColumns.size());
            for (JoinTargetCatalog.JoinTargetSystemColumn c : systemColumns) {
                ColumnConfig cc = new ColumnConfig();
                cc.setKey(c.key());
                cc.setLabel(c.label());
                cc.setColumnType(c.columnType());
                out.add(cc);
            }
            return out;
        }
        try {
            List<ColumnConfig> target = formDefService.getBusinessColumnsByKey(j.targetFormKey());
            return target == null ? List.of() : target;
        } catch (BusinessException ignored) {
            // 目标表单不可解析时回退
            return List.of();
        }
    }

    /** 目标列查找：按 key 匹配；查不到返回 null。 */
    private static ColumnConfig findJoinTarget(List<ColumnConfig> cols, String key) {
        if (cols == null) {
            return null;
        }
        for (ColumnConfig c : cols) {
            if (key.equals(c.getKey())) {
                return c;
            }
        }
        return null;
    }

    /** 目标列 columnType：查不到 fallback "VARCHAR"（查询与 metadata 两处一致）。 */
    private static String joinColumnType(List<ColumnConfig> cols, String key) {
        ColumnConfig c = findJoinTarget(cols, key);
        return c != null && c.getColumnType() != null && !c.getColumnType().isBlank()
                ? c.getColumnType().toUpperCase()
                : "VARCHAR";
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

        Map<String, Object> merged = serializeJsonColumns(data, ctx.columns());
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

    /** config 模式行映射：主表列（toVO 逻辑）+ 虚拟列（virtualKey → joinField 值，含 dataPicker 冗余 _text） */
    private BizDataVO toJoinVO(BizDataContext ctx, List<JoinSqlGenerator.JoinConfig> joins, Map<String, Object> row) {
        BizDataVO vo = toVO(ctx, row);
        Map<String, Object> data = vo.getData();
        for (JoinSqlGenerator.JoinConfig j : joins) {
            Object v = row.get(j.virtualKey());
            if (v != null) {
                data.put(j.virtualKey(), v);
            }
            Object vt = row.get(j.virtualKey() + "_text");
            if (vt != null) {
                data.put(j.virtualKey() + "_text", vt);
            }
        }
        return vo;
    }

    /**
     * sql 模式行映射：外层子查询输出列全量保留（可含聚合列），绕过 BizDataVO 系统列字段的仅主表列逻辑。
     * <p>输出列名与声明列（columns）的 key 做大小写不敏感对齐：匹配某声明列 key（忽略大小写）时输出声明列精确 key，
     * 保证返回 key 与字段元数据一致（字段 key 可为驼峰，如探测 JDBC 列标签 hireDate，前端按配置 key 取值）；
     * 未匹配列统一转小写，消除 H2 等数据库对子查询输出列名规范化为大写的影响（与声明列小写 key 约定兼容）。
     */
    private BizDataVO toSqlVO(List<ColumnConfig> declared, Map<String, Object> row) {
        Map<String, String> keyNormalizer = new HashMap<>();
        if (declared != null) {
            for (ColumnConfig c : declared) {
                if (c.getKey() != null && !c.getKey().isBlank()) {
                    // putIfAbsent：声明列存在仅大小写不同的重名时，保留先出现的精确 key
                    keyNormalizer.putIfAbsent(c.getKey().toLowerCase(), c.getKey());
                }
            }
        }
        Map<String, Object> data = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : row.entrySet()) {
            String lower = e.getKey().toLowerCase();
            data.put(keyNormalizer.getOrDefault(lower, lower), e.getValue());
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
     *
     * ⚠️ JSON 列（`columnType == 'JSON'`，物理表 `longtext CHECK (json_valid(...))`）的字符串值需归一：
     * 单选 select / 树选等组件的 value 是裸字符串（如 'annual'），直接入库即撞 CHECK
     * （报 `CONSTRAINT <表>.<列> failed`）。规则与 Node 侧逐条对齐：
     *   - 空白字符串 → null（required 列已被 validateRequired 拦截，能到这里必是可空列）；
     *   - 非法 JSON 的非空字符串 → Jackson writeValueAsString 包成 JSON 字符串文档；
     *   - 合法 JSON（含数字/布尔/null 字面量文本）→ 原样（readValue 成功即 json_valid 必过）。
     * 读取侧 deserializeJsonValue 对 "\"annual\"" parse 回 annual，回显不变。
     */
    private Map<String, Object> serializeJsonColumns(Map<String, Object> data, List<ColumnConfig> columns) {
        Set<String> jsonKeys = new HashSet<>();
        for (ColumnConfig c : columns) {
            if (c.getColumnType() != null && "JSON".equalsIgnoreCase(c.getColumnType())) {
                jsonKeys.add(c.getKey());
            }
        }
        Map<String, Object> out = new LinkedHashMap<>(data);
        for (Map.Entry<String, Object> e : data.entrySet()) {
            Object v = e.getValue();
            if (v == null) {
                continue;
            }
            if (v instanceof String s) {
                if (!jsonKeys.contains(e.getKey())) {
                    continue; // 非 JSON 列：字符串为旧格式容错
                }
                if (s.isBlank()) {
                    out.put(e.getKey(), null);
                    continue;
                }
                if (!isValidJsonText(s)) {
                    out.put(e.getKey(), writeJsonOr400(e.getKey(), s));
                }
                continue;
            }
            out.put(e.getKey(), writeJsonOr400(e.getKey(), v));
        }
        return out;
    }

    /** Jackson 序列化，失败按既有语义抛 400（提取共用避免两处重复 try/catch）。 */
    private String writeJsonOr400(String key, Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(400, "字段 " + key + " 无法序列化为 JSON: " + ex.getOriginalMessage());
        }
    }

    /** 字符串是否为合法 JSON 文本（对齐 MariaDB json_valid 接受域；与 Node isValidJsonText 同语义）。 */
    private boolean isValidJsonText(String s) {
        try {
            objectMapper.readValue(s, Object.class);
            return true;
        } catch (JsonProcessingException e) {
            return false;
        }
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