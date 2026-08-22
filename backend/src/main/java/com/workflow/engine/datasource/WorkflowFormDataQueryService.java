package com.workflow.engine.datasource;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.form.column.FormSchemaColumnExtractor;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.system.domain.vo.UserVO;
import com.workflow.system.service.UserService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.task.api.Task;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * WORKFLOW 数据源查询服务：按 formKey 跨流程实例聚合表单数据（wf_form_data）。
 * - 每个流程实例一行：5 个系统列 + 最新 PUBLISHED schema 的业务列；
 *   旧版本多余字段忽略、缺失字段置 null。
 * - 草稿行（is_snapshot=1 或未关联流程实例）排除；发起时间取 ACT_HI_PROCINST.START_TIME_。
 * - 列名拼入 JSON_EXTRACT 前强制白名单校验（正则 + 最新 schema 键）防注入。
 */
@Service
public class WorkflowFormDataQueryService {

    private static final Pattern COL_PATTERN = Pattern.compile("^[a-zA-Z][a-zA-Z0-9_]{0,63}$");

    private static final String PAGE_SELECT =
            "SELECT f.id, f.data_json, f.process_instance_id, h.START_TIME_, h.START_USER_ID_";
    private static final String BASE_FROM =
            " FROM wf_form_data f"
                    + " LEFT JOIN ACT_HI_PROCINST h ON h.ID_ = f.process_instance_id"
                    + " WHERE f.tenant_id = :tenantId AND f.form_def_id IN (:ids)"
                    + " AND f.is_snapshot = 0 AND f.process_instance_id IS NOT NULL";

    private final EntityManager em;
    private final FormDefinitionRepository formDefRepository;
    private final FormSchemaColumnExtractor extractor;
    private final RuntimeService runtimeService;
    private final TaskService taskService;
    private final UserService userService;
    private final ObjectMapper objectMapper;
    private final TenantProvider tenantProvider;

    public WorkflowFormDataQueryService(EntityManager em,
                                        FormDefinitionRepository formDefRepository,
                                        FormSchemaColumnExtractor extractor,
                                        RuntimeService runtimeService,
                                        TaskService taskService,
                                        UserService userService,
                                        ObjectMapper objectMapper,
                                        TenantProvider tenantProvider) {
        this.em = em;
        this.formDefRepository = formDefRepository;
        this.extractor = extractor;
        this.runtimeService = runtimeService;
        this.taskService = taskService;
        this.userService = userService;
        this.objectMapper = objectMapper;
        this.tenantProvider = tenantProvider;
    }

    /** WORKFLOW 数据源固定系统列。 */
    public static List<ColumnConfig> systemColumns() {
        return List.of(
                col("instanceId", "流程实例ID"),
                col("processStatus", "流程状态"),
                col("initiatorName", "发起人"),
                col("startTime", "发起时间", "DATETIME"),
                col("currentNodeName", "当前节点"));
    }

    /** 系统列 + 该 formKey 最新 PUBLISHED schema 解析出的业务列。 */
    public List<ColumnConfig> columnsFor(String formKey) {
        String tenantId = tenantProvider.getTenantId();
        Set<String> seen = new LinkedHashSet<>();
        systemColumns().forEach(c -> seen.add(c.getKey()));
        List<ColumnConfig> cols = new ArrayList<>(systemColumns());
        for (ColumnConfig c : businessColumns(tenantId, formKey).values()) {
            if (seen.add(c.getKey())) {
                cols.add(c);
            }
        }
        return cols;
    }

    /** 跨实例分页查询：filter/keyword 仅接受最新 schema 白名单列。 */
    public BizDataPageVO query(String formKey, BizDataQueryRequest req) {
        String tenantId = tenantProvider.getTenantId();
        LinkedHashMap<String, ColumnConfig> bizCols = businessColumns(tenantId, formKey);
        Map<String, Object> filters = parseFilters(req.getFilter(), bizCols.keySet());
        String keywordColumn = resolveKeywordColumn(req, bizCols.keySet());

        List<String> ids = versionIds(tenantId, formKey);
        int size = Math.max(1, req.getSize());
        if (ids.isEmpty()) {
            return new BizDataPageVO(List.of(), 0L, Math.max(0, req.getPage()), size);
        }

        StringBuilder where = new StringBuilder(BASE_FROM);
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("tenantId", tenantId);
        params.put("ids", ids);
        int i = 0;
        for (Map.Entry<String, Object> e : filters.entrySet()) {
            where.append(" AND JSON_UNQUOTE(JSON_EXTRACT(f.data_json, '$.").append(e.getKey())
                    .append("')) = :filter").append(i);
            params.put("filter" + i, String.valueOf(e.getValue()));
            i++;
        }
        if (keywordColumn != null) {
            where.append(" AND JSON_UNQUOTE(JSON_EXTRACT(f.data_json, '$.").append(keywordColumn)
                    .append("')) LIKE CONCAT('%', :keyword, '%')");
            params.put("keyword", req.getKeyword().trim());
        }

        Query countQ = em.createNativeQuery("SELECT COUNT(*)" + where);
        bind(countQ, params);
        long total = ((Number) countQ.getSingleResult()).longValue();

        Query rowsQ = em.createNativeQuery(PAGE_SELECT + where
                + " ORDER BY COALESCE(h.START_TIME_, f.created_at) DESC LIMIT :limit OFFSET :offset");
        params.put("limit", size);
        params.put("offset", Math.max(0, req.getPage()) * size);
        bind(rowsQ, params);
        List<?> rows = rowsQ.getResultList();

        return assemble(formKey, rows, total, Math.max(0, req.getPage()), size);
    }

    /** 单条详情；不存在抛 404。 */
    public BizDataVO getById(String formKey, String id) {
        String tenantId = tenantProvider.getTenantId();
        List<String> ids = versionIds(tenantId, formKey);
        if (ids.isEmpty()) {
            throw new BusinessException(404, "数据不存在: " + id);
        }
        Query q = em.createNativeQuery(PAGE_SELECT + BASE_FROM
                + " AND f.id = :id ORDER BY COALESCE(h.START_TIME_, f.created_at) DESC LIMIT 1");
        q.setParameter("tenantId", tenantId);
        q.setParameter("ids", ids);
        q.setParameter("id", id);
        List<?> rows = q.getResultList();
        if (rows.isEmpty()) {
            throw new BusinessException(404, "数据不存在: " + id);
        }
        return assemble(formKey, rows, rows.size(), 0, 1).getRecords().get(0);
    }

    // ===== 行组装 =====

    /** 系统列在前，业务列仅取最新 schema 键（多余忽略、缺失置 null）。 */
    private BizDataPageVO assemble(String formKey, List<?> rows, long total, int page, int size) {
        String tenantId = tenantProvider.getTenantId();
        Set<String> bizKeys = businessColumns(tenantId, formKey).keySet();

        List<String> pids = new ArrayList<>();
        for (Object r : rows) {
            Object pid = ((Object[]) r)[2];
            if (pid != null && !String.valueOf(pid).isBlank()) {
                pids.add(String.valueOf(pid));
            }
        }
        Map<String, String> statuses = resolveStatuses(tenantId, pids);
        Map<String, String> nodes = resolveCurrentNodes(pids);
        Map<Long, String> userNames = resolveUserNames(rows);

        List<BizDataVO> records = new ArrayList<>();
        for (Object r : rows) {
            Object[] c = (Object[]) r;
            String rowId = String.valueOf(c[0]);
            Map<String, Object> raw = parseDataJson(c[1] == null ? null : String.valueOf(c[1]));
            String pid = c[2] == null ? "" : String.valueOf(c[2]);
            LocalDateTime startTime = c[3] instanceof Timestamp ts ? ts.toLocalDateTime() : null;
            Long userId = parseUserId(c[4]);

            LinkedHashMap<String, Object> data = new LinkedHashMap<>();
            data.put("instanceId", pid.isBlank() ? null : pid);
            data.put("processStatus", statuses.get(pid));
            data.put("initiatorName", userId == null ? null : userNames.get(userId));
            data.put("startTime", startTime);
            data.put("currentNodeName", nodes.get(pid));
            for (String key : bizKeys) {
                data.put(key, raw.get(key));
            }
            records.add(new BizDataVO(rowId, data, null, null, null));
        }
        return new BizDataPageVO(records, total, page, size);
    }

    /** 运行中/挂起走 runtime，其余视为已结束。 */
    private Map<String, String> resolveStatuses(String tenantId, List<String> pids) {
        Map<String, String> map = new HashMap<>();
        if (pids.isEmpty()) {
            return map;
        }
        List<ProcessInstance> running = runtimeService.createProcessInstanceQuery()
                .processInstanceTenantId(tenantId)
                .processInstanceIds(new LinkedHashSet<>(pids))
                .list();
        for (ProcessInstance pi : running) {
            map.put(pi.getId(), pi.isSuspended() ? "suspended" : "running");
        }
        for (String pid : pids) {
            map.putIfAbsent(pid, "completed");
        }
        return map;
    }

    /** 当前活动节点名，参照 WorkflowTaskService 既有模式逐实例查询，多节点用"、"连接。 */
    private Map<String, String> resolveCurrentNodes(List<String> pids) {
        Map<String, String> map = new HashMap<>();
        if (pids.isEmpty()) {
            return map;
        }
        for (String pid : pids.stream().distinct().toList()) {
            List<Task> tasks = taskService.createTaskQuery()
                    .processInstanceId(pid)
                    .active()
                    .list();
            if (tasks != null && !tasks.isEmpty()) {
                String names = tasks.stream()
                        .map(Task::getName)
                        .filter(n -> n != null && !n.isBlank())
                        .distinct()
                        .collect(Collectors.joining("、"));
                if (!names.isBlank()) {
                    map.put(pid, names);
                }
            }
        }
        return map;
    }

    /** 发起人姓名批量解析：START_USER_ID_ → UserService.findByIds → 昵称优先、用户名兜底。 */
    private Map<Long, String> resolveUserNames(List<?> rows) {
        Set<Long> uids = new LinkedHashSet<>();
        for (Object r : rows) {
            Long uid = parseUserId(((Object[]) r)[4]);
            if (uid != null) {
                uids.add(uid);
            }
        }
        if (uids.isEmpty()) {
            return Map.of();
        }
        Map<Long, String> map = new HashMap<>();
        for (UserVO u : userService.findByIds(new ArrayList<>(uids))) {
            map.put(u.id(), u.nickname() == null || u.nickname().isBlank() ? u.username() : u.nickname());
        }
        return map;
    }

    private Long parseUserId(Object v) {
        if (v == null) {
            return null;
        }
        try {
            return Long.parseLong(String.valueOf(v));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    // ===== 白名单与 schema =====

    /** 最新 PUBLISHED 表单定义；不存在抛 404。 */
    private FormDefinition latestPublished(String tenantId, String formKey) {
        return formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                        tenantId, formKey, "PUBLISHED")
                .orElseThrow(() -> new BusinessException(404, "表单不存在或未发布: " + formKey));
    }

    /** 最新 schema 业务列（有序 key→列，非法键名过滤）。 */
    private LinkedHashMap<String, ColumnConfig> businessColumns(String tenantId, String formKey) {
        FormDefinition latest = latestPublished(tenantId, formKey);
        LinkedHashMap<String, ColumnConfig> map = new LinkedHashMap<>();
        for (ColumnConfig c : extractor.extract(latest.getColumnConfig())) {
            if (c.getKey() == null || c.getKey().isBlank()) {
                continue;
            }
            if (!COL_PATTERN.matcher(c.getKey()).matches()) {
                continue;
            }
            map.putIfAbsent(c.getKey(), c);
        }
        return map;
    }

    /** 该 key 下全部版本定义 id（版本倒序）。 */
    private List<String> versionIds(String tenantId, String formKey) {
        return formDefRepository.findByTenantIdAndKeyOrderByVersionDesc(tenantId, formKey)
                .stream()
                .map(FormDefinition::getId)
                .toList();
    }

    /** 解析 filter JSON；key 必须命中最新 schema 白名单，否则 400。 */
    private LinkedHashMap<String, Object> parseFilters(String filterJson, Set<String> allowed) {
        LinkedHashMap<String, Object> out = new LinkedHashMap<>();
        if (filterJson == null || filterJson.isBlank()) {
            return out;
        }
        Map<String, Object> parsed;
        try {
            parsed = objectMapper.readValue(filterJson, new TypeReference<Map<String, Object>>() {});
        } catch (JsonProcessingException | IllegalArgumentException e) {
            throw new BusinessException(400, "筛选条件不是合法 JSON");
        }
        for (Map.Entry<String, Object> e : parsed.entrySet()) {
            requireWhitelisted(e.getKey(), allowed);
            out.put(e.getKey(), e.getValue());
        }
        return out;
    }

    private void requireWhitelisted(String key, Set<String> allowed) {
        if (key == null || !COL_PATTERN.matcher(key).matches() || !allowed.contains(key)) {
            throw new BusinessException(400, "筛选项不在表单字段中: " + key);
        }
    }

    /** 关键词非空时必须给出白名单内的匹配列。 */
    private String resolveKeywordColumn(BizDataQueryRequest req, Set<String> allowed) {
        if (req.getKeyword() == null || req.getKeyword().isBlank()) {
            return null;
        }
        String col = req.getKeywordColumn();
        if (col == null || !COL_PATTERN.matcher(col).matches() || !allowed.contains(col)) {
            throw new BusinessException(400, "关键词列不在表单字段中: " + req.getKeywordColumn());
        }
        return col;
    }

    // ===== 工具 =====

    private Map<String, Object> parseDataJson(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (JsonProcessingException | IllegalArgumentException e) {
            return Map.of();
        }
    }

    private void bind(Query q, Map<String, Object> params) {
        for (Map.Entry<String, Object> e : params.entrySet()) {
            q.setParameter(e.getKey(), e.getValue());
        }
    }

    private static ColumnConfig col(String key, String label) {
        return col(key, label, "VARCHAR");
    }

    private static ColumnConfig col(String key, String label, String columnType) {
        ColumnConfig c = new ColumnConfig();
        c.setKey(key);
        c.setLabel(label);
        c.setColumnType(columnType);
        return c;
    }
}
