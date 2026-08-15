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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 业务数据服务。
 * 基于 column_config 对动态物理表 wf_biz_<formKey> 提供 CRUD，
 * 全部 SQL 由 BizDataQueryBuilder 参数化生成，强制 tenant_id 过滤。
 * 支持按 formKey 注册 BizDataHandler 钩子，在各环节注入定制业务逻辑。
 */
@Service
public class BizDataService {

    private static final Pattern FORM_KEY_PATTERN = Pattern.compile("^[a-zA-Z][a-zA-Z0-9_]{0,63}$");

    private final JdbcTemplate jdbcTemplate;
    private final DynamicTableManager tableManager;
    private final FormDefinitionService formDefService;
    private final TenantProvider tenantProvider;
    private final ObjectMapper objectMapper;
    /** formKey → 钩子列表（按 Spring 注入顺序） */
    private final Map<String, List<BizDataHandler>> handlerIndex;

    /**
     * @param handlers Spring 自动注入所有 BizDataHandler bean（无则空列表）
     */
    public BizDataService(JdbcTemplate jdbcTemplate,
                          DynamicTableManager tableManager,
                          FormDefinitionService formDefService,
                          TenantProvider tenantProvider,
                          ObjectMapper objectMapper,
                          List<BizDataHandler> handlers) {
        this.jdbcTemplate = jdbcTemplate;
        this.tableManager = tableManager;
        this.formDefService = formDefService;
        this.tenantProvider = tenantProvider;
        this.objectMapper = objectMapper;
        this.handlerIndex = buildHandlerIndex(handlers);
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

    /** 获取 formKey 对应的钩子列表（无则空） */
    private List<BizDataHandler> handlersOf(String formKey) {
        return handlerIndex.getOrDefault(formKey, List.of());
    }

    /**
     * 新增业务数据。
     */
    @Transactional
    public BizDataVO create(String formKey, Map<String, Object> data) {
        String tenantId = tenantProvider.getTenantId();
        BizDataContext ctx = loadContext(formKey);

        for (BizDataHandler handler : handlersOf(formKey)) {
            handler.beforeCreate(data);
        }

        validateRequired(ctx.columns, data);

        // data-picker 引用校验与冗余文本生成（基于 JSON 序列化后的数据，不改原 data，返回附加字段）
        Map<String, Object> merged = serializeJsonColumns(ctx, data);
        merged.putAll(resolvePickerValues(ctx, merged));

        BizDataQueryBuilder.SqlAndParams insert = BizDataQueryBuilder.buildInsert(
                ctx.tableName, ctx.columnKeys, merged, tenantId);
        jdbcTemplate.update(insert.sql(), insert.params().toArray());

        // 新行 id 由 buildInsert 内部生成，查询返回
        BizDataVO created = findById(ctx.tableName, tenantId, ctx, insertedId(insert));
        for (BizDataHandler handler : handlersOf(formKey)) {
            handler.afterCreate(created);
        }
        return created;
    }

    /**
     * 分页查询业务数据。
     */
    public BizDataPageVO query(String formKey, BizDataQueryRequest req) {
        String tenantId = tenantProvider.getTenantId();
        BizDataContext ctx = loadContext(formKey);

        Map<String, Object> filters = parseFilter(req.getFilter());
        int page = Math.max(req.getPage(), 0);
        int size = Math.min(Math.max(req.getSize(), 1), 100);

        try {
            BizDataQueryBuilder.SqlAndParams count = BizDataQueryBuilder.buildCount(
                    ctx.tableName, ctx.columnKeys, tenantId, filters, req.getKeyword(), req.getKeywordColumn());
            Long total = jdbcTemplate.queryForObject(count.sql(), Long.class, count.params().toArray());

            BizDataQueryBuilder.SqlAndParams select = BizDataQueryBuilder.buildSelect(
                    ctx.tableName, ctx.columnKeys, tenantId, filters,
                    req.getKeyword(), req.getKeywordColumn(), req.getSort(), req.getOrder(), page, size);
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(select.sql(), select.params().toArray());

            List<BizDataVO> records = rows.stream()
                    .map(row -> toVO(ctx, row))
                    .toList();
            return new BizDataPageVO(records, total == null ? 0 : total, page, size);
        } catch (IllegalArgumentException e) {
            throw new BusinessException(400, e.getMessage());
        }
    }

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
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new BusinessException(400, "筛选参数 filter 格式非法，应为 JSON 对象: " + e.getOriginalMessage());
        }
    }

    /**
     * 查询单条业务数据。
     */
    public BizDataVO getById(String formKey, String id) {
        String tenantId = tenantProvider.getTenantId();
        BizDataContext ctx = loadContext(formKey);
        return findById(ctx.tableName, tenantId, ctx, id);
    }

    /**
     * 更新业务数据（乐观锁）。
     */
    @Transactional
    public BizDataVO update(String formKey, String id, Map<String, Object> data, Integer version) {
        String tenantId = tenantProvider.getTenantId();
        BizDataContext ctx = loadContext(formKey);

        BizDataVO existing = findById(ctx.tableName, tenantId, ctx, id);
        for (BizDataHandler handler : handlersOf(formKey)) {
            handler.beforeUpdate(data, existing);
        }

        validateRequired(ctx.columns, data);
        int currentVersion = version == null ? 1 : version;

        Map<String, Object> merged = serializeJsonColumns(ctx, data);
        merged.putAll(resolvePickerValues(ctx, merged));

        BizDataQueryBuilder.SqlAndParams update = BizDataQueryBuilder.buildUpdate(
                ctx.tableName, ctx.columnKeys, merged, tenantId, id, currentVersion);
        int affected = jdbcTemplate.update(update.sql(), update.params().toArray());

        if (affected == 0) {
            // 区分"记录不存在"（404）与"版本冲突"（409）
            List<Map<String, Object>> exists = jdbcTemplate.queryForList(
                    "SELECT id, version FROM " + ctx.tableName + " WHERE id = ? AND tenant_id = ?", id, tenantId);
            if (exists.isEmpty()) {
                throw new BusinessException(404, "业务数据不存在: " + id);
            }
            throw new BusinessException(409, "数据已被他人修改，请刷新后重试");
        }

        return findById(ctx.tableName, tenantId, ctx, id);
    }

    /**
     * 删除业务数据（租户范围限定）。
     */
    @Transactional
    public void delete(String formKey, String id) {
        String tenantId = tenantProvider.getTenantId();
        BizDataContext ctx = loadContext(formKey);

        BizDataVO existing = findById(ctx.tableName, tenantId, ctx, id);
        for (BizDataHandler handler : handlersOf(formKey)) {
            handler.beforeDelete(existing);
        }

        BizDataQueryBuilder.SqlAndParams delete = BizDataQueryBuilder.buildDelete(ctx.tableName, tenantId, id);
        int affected = jdbcTemplate.update(delete.sql(), delete.params().toArray());
        if (affected == 0) {
            throw new BusinessException(404, "业务数据不存在: " + id);
        }
    }

    // ==================== 内部工具 ====================

    private record BizDataContext(String tableName, String formKey, List<ColumnConfig> columns, List<String> columnKeys) {}

    private BizDataContext loadContext(String formKey) {
        if (formKey == null || !FORM_KEY_PATTERN.matcher(formKey).matches()) {
            throw new BusinessException(400, "非法表单 key: " + formKey);
        }
        String tableName = "wf_biz_" + formKey;
        if (!tableManager.tableExists(tableName)) {
            throw new BusinessException(404, "业务表单数据表不存在: " + formKey);
        }
        List<ColumnConfig> columns = formDefService.getBusinessColumnsByKey(formKey);
        List<String> keys = columns.stream().map(ColumnConfig::getKey).toList();
        return new BizDataContext(tableName, formKey, columns, keys);
    }

    private void validateRequired(List<ColumnConfig> columns, Map<String, Object> data) {
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

    private String insertedId(BizDataQueryBuilder.SqlAndParams insert) {
        // buildInsert 的第一个参数即生成的 UUID
        return String.valueOf(insert.params().get(0));
    }

    /**
     * 按表单 key 批量解析显示文本（resolve API 入口）。
     * displayField 缺省取目标表单第一个非隐藏列；表不存在 404。
     */
    public Map<String, String> resolveByFormKey(String formKey, List<String> ids, String displayField) {
        BizDataContext ctx = loadContext(formKey);
        String field = displayField;
        if (field == null || field.isBlank()) {
            // 缺省取第一个"普通列"（非 hidden、非 data-picker 引用列）
            field = ctx.columns.stream()
                    .filter(c -> !c.isHidden() && c.getPickerConfig() == null)
                    .map(ColumnConfig::getKey)
                    .findFirst()
                    .orElseThrow(() -> new BusinessException(400, "目标表单无可解析的显示字段"));
        }
        return resolveDisplayTexts(formKey, ids, field);
    }

    /**
     * 批量解析被引用记录的显示文本（id → displayField 值）。
     * displayField 通过列名白名单校验防注入；仅返回存在的记录。
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
     * 遍历 data-picker 引用列：校验 id 存在并生成 `<key>_text` 展示缓存文本。
     * 不修改原 data，返回附加字段（`<key>_text` → 文本）；引用值为空时返回空文本。
     * 语义：`<key>_text` 为展示缓存（非业务数据，尽力而为维护），显示准确性以 resolve API 为准。
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> resolvePickerValues(BizDataContext ctx, Map<String, Object> data) {
        Map<String, Object> extra = new LinkedHashMap<>();
        for (ColumnConfig col : ctx.columns) {
            String pickerConfig = col.getPickerConfig();
            if (pickerConfig == null || pickerConfig.isBlank()) {
                continue;
            }
            // 仅 data-picker 引用列生成冗余文本；LookupPicker 列跳过
            // （LookupPicker 值已含展示快照：单选为显示文本字符串）
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
     * 判断列是否为 data-picker 引用列（需生成 <key>_text 冗余文本）。
     * 判别优先级：
     * 1. 显式 pickerType：dataPicker → 是；lookupPicker → 否。
     * 2. 无 pickerType 的旧配置：
     *    a. column_config 中存在 <key>_text 冗余列 → 是 dataPicker（其固定生成 _text 隐藏列）；
     *    b. 否则视为 dataPicker（兼容最老的 dataPicker 配置）。
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
            boolean hasTextColumn = ctx.columns.stream()
                    .anyMatch(c -> (col.getKey() + "_text").equals(c.getKey()));
            return hasTextColumn;
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
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
            } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
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
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new BusinessException(400, "data-picker 配置或引用值非法: " + col.getKey());
        }
    }

    /**
     * 统计各业务表单被 dataPicker 引用的情况（引用感知）。
     * 遍历全部同租户 BUSINESS 表单的 column_config，统计 pickerConfig.sourceFormKey 出现次数。
     *
     * @return { formKey: { count: N, referencedBy: [formKeyA, ...] } }，仅含被引用（count>0）的目标表单
     */
    public Map<String, Map<String, Object>> countReferencedBy() {
        Map<String, Map<String, Object>> result = new LinkedHashMap<>();
        int page = 0;
        final int size = 100;
        while (true) {
            Page<FormDefinition> defs = formDefService.list(null, null, "BUSINESS", PageRequest.of(page, size));
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
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            // 非法 column_config 跳过（发布链路已校验，此处容错）
        }
    }

    private BizDataVO findById(String tableName, String tenantId, BizDataContext ctx, String id) {
        String sql = "SELECT * FROM " + tableName + " WHERE id = ? AND tenant_id = ?";
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, id, tenantId);
        if (rows.isEmpty()) {
            throw new BusinessException(404, "业务数据不存在: " + id);
        }
        return toVO(ctx, rows.get(0));
    }

    private BizDataVO toVO(BizDataContext ctx, Map<String, Object> row) {
        Map<String, Object> data = new LinkedHashMap<>();
        for (ColumnConfig c : ctx.columns) {
            Object v = row.get(c.getKey());
            if (v != null) {
                data.put(c.getKey(), "JSON".equals(c.getColumnType()) ? deserializeJsonValue(v) : v);
            }
        }
        Integer version = asInt(row.get("version"));
        LocalDateTime createdAt = asDateTime(row.get("created_at"));
        LocalDateTime updatedAt = asDateTime(row.get("updated_at"));
        return new BizDataVO(String.valueOf(row.get("id")), data, version, createdAt, updatedAt);
    }

    /**
     * 对 JSON 列值序列化为 JSON 字符串（供参数绑定存储）。
     * 非数组/对象（如旧格式字符串、null）原样保留。
     */
    private Map<String, Object> serializeJsonColumns(BizDataContext ctx, Map<String, Object> data) {
        Map<String, Object> out = new LinkedHashMap<>(data);
        for (ColumnConfig c : ctx.columns) {
            if (!"JSON".equals(c.getColumnType())) {
                continue;
            }
            Object v = out.get(c.getKey());
            if (v == null || v instanceof String) {
                continue; // null 跳过；字符串为旧格式容错
            }
            try {
                out.put(c.getKey(), objectMapper.writeValueAsString(v));
            } catch (JsonProcessingException e) {
                throw new BusinessException(400, "字段 " + c.getKey() + " 无法序列化为 JSON: " + e.getOriginalMessage());
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
