package com.workflow.engine.form.bizdata;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.FormDefinitionService;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.form.column.DynamicTableManager;
import com.workflow.engine.tenant.TenantProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 业务数据服务。
 * 基于 column_config 对动态物理表 wf_biz_<formKey> 提供 CRUD，
 * 全部 SQL 由 BizDataQueryBuilder 参数化生成，强制 tenant_id 过滤。
 */
@Service
public class BizDataService {

    private static final Pattern FORM_KEY_PATTERN = Pattern.compile("^[a-zA-Z][a-zA-Z0-9_]{0,63}$");

    private final JdbcTemplate jdbcTemplate;
    private final DynamicTableManager tableManager;
    private final FormDefinitionService formDefService;
    private final TenantProvider tenantProvider;
    private final ObjectMapper objectMapper;

    public BizDataService(JdbcTemplate jdbcTemplate,
                          DynamicTableManager tableManager,
                          FormDefinitionService formDefService,
                          TenantProvider tenantProvider,
                          ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.tableManager = tableManager;
        this.formDefService = formDefService;
        this.tenantProvider = tenantProvider;
        this.objectMapper = objectMapper;
    }

    /**
     * 新增业务数据。
     */
    public BizDataVO create(String formKey, Map<String, Object> data) {
        String tenantId = tenantProvider.getTenantId();
        BizDataContext ctx = loadContext(formKey);

        validateRequired(ctx.columns, data);

        BizDataQueryBuilder.SqlAndParams insert = BizDataQueryBuilder.buildInsert(
                ctx.tableName, ctx.columnKeys, data, tenantId);
        jdbcTemplate.update(insert.sql(), insert.params().toArray());

        // 新行 id 由 buildInsert 内部生成，查询返回
        return findById(ctx.tableName, tenantId, ctx, insertedId(insert));
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
    public BizDataVO update(String formKey, String id, Map<String, Object> data, Integer version) {
        String tenantId = tenantProvider.getTenantId();
        BizDataContext ctx = loadContext(formKey);

        validateRequired(ctx.columns, data);
        int currentVersion = version == null ? 1 : version;

        BizDataQueryBuilder.SqlAndParams update = BizDataQueryBuilder.buildUpdate(
                ctx.tableName, ctx.columnKeys, data, tenantId, id, currentVersion);
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
    public void delete(String formKey, String id) {
        String tenantId = tenantProvider.getTenantId();
        BizDataContext ctx = loadContext(formKey);

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
                data.put(c.getKey(), v);
            }
        }
        Integer version = asInt(row.get("version"));
        LocalDateTime createdAt = asDateTime(row.get("created_at"));
        LocalDateTime updatedAt = asDateTime(row.get("updated_at"));
        return new BizDataVO(String.valueOf(row.get("id")), data, version, createdAt, updatedAt);
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
