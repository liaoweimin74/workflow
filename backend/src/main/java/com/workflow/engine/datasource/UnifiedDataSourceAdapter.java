package com.workflow.engine.datasource;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.api.dto.DataSourceMetadata;
import com.workflow.common.domain.PageResult;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.form.FormDefinitionService;
import com.workflow.engine.form.bizdata.BizDataService;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.logic.executor.HttpLogicExecutor;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.system.domain.dto.UserQueryRequest;
import com.workflow.system.domain.vo.TreeNode;
import com.workflow.system.domain.vo.UserVO;
import com.workflow.system.service.OrganizationService;
import com.workflow.system.service.UserService;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 统一数据源适配器：合并 FormDataSourceAdapter / SystemDataSourceAdapter / ApiDataSourceAdapter。
 * - FORM/SYSTEM：internal://，通过 InternalDataSourceRouter allowlist 路由，租户感知。
 * - API：external://，通过 HttpLogicExecutor 调用外部 REST。
 */
@Component
public class UnifiedDataSourceAdapter implements DataSourceAdapter {

    private static final int DEFAULT_TIMEOUT_MS = 10000;
    private static final int DEFAULT_RETRY = 0;

    private static final List<ColumnConfig> DEPT_COLUMNS = List.of(
            column("id", "部门 ID", "VARCHAR", 64),
            column("parentId", "上级部门 ID", "VARCHAR", 64),
            column("label", "部门名称", "VARCHAR", 128),
            column("code", "部门编码", "VARCHAR", 64));

    private static final List<ColumnConfig> USER_COLUMNS = List.of(
            column("id", "用户 ID", "VARCHAR", 64),
            column("username", "用户名", "VARCHAR", 64),
            column("nickname", "昵称", "VARCHAR", 64),
            column("orgId", "部门 ID", "VARCHAR", 64),
            column("orgName", "部门名称", "VARCHAR", 128),
            column("status", "状态", "TINYINT", 1));

    private final BizDataService bizDataService;
    private final FormDefinitionService formDefService;
    private final OrganizationService organizationService;
    private final UserService userService;
    private final HttpLogicExecutor httpExecutor;
    private final ObjectMapper objectMapper;
    private final InternalDataSourceRouter router;
    private final WorkflowFormDataQueryService workflowQueryService;

    public UnifiedDataSourceAdapter(BizDataService bizDataService,
                                    FormDefinitionService formDefService,
                                    OrganizationService organizationService,
                                    UserService userService,
                                    HttpLogicExecutor httpExecutor,
                                    ObjectMapper objectMapper,
                                    InternalDataSourceRouter router,
                                    WorkflowFormDataQueryService workflowQueryService) {
        this.bizDataService = bizDataService;
        this.formDefService = formDefService;
        this.organizationService = organizationService;
        this.userService = userService;
        this.httpExecutor = httpExecutor;
        this.objectMapper = objectMapper;
        this.router = router;
        this.workflowQueryService = workflowQueryService;
    }

    @Override
    public boolean supports(String type) {
        return "FORM".equals(type) || "SYSTEM".equals(type) || "API".equals(type) || "WORKFLOW".equals(type);
    }

    @Override
    public DataSourceMetadata metadata(DataSourceDefinition ds) {
        return switch (ds.getType()) {
            case "FORM" -> {
                List<ColumnConfig> cols = formDefService.getBusinessColumnsByKey(ds.getFormKey());
                SortableResolver.resolve(cols);
                yield new DataSourceMetadata(cols, true);
            }
            case "WORKFLOW" -> {
                List<ColumnConfig> cols = workflowQueryService.columnsFor(ds.getFormKey());
                SortableResolver.resolve(cols);
                yield new DataSourceMetadata(cols, false);
            }
            case "SYSTEM" -> {
                List<ColumnConfig> cols = "user-tree".equals(ds.getSourceKey())
                        ? copyWithSortableFalse(USER_COLUMNS)
                        : copyWithSortableFalse(DEPT_COLUMNS);
                yield new DataSourceMetadata(cols, false);
            }
            case "API" -> {
                DataSourceMetadata m = apiMetadata(ds);
                yield new DataSourceMetadata(copyWithSortableFalse(m.getColumns()), m.isWritable());
            }
            default -> throw unsupported(ds, "metadata");
        };
    }

    /** 复制列并强制标记 sortable=false（SYSTEM/API 数据源不可排序；避免就地污染共享常量列）。 */
    private List<ColumnConfig> copyWithSortableFalse(List<ColumnConfig> src) {
        List<ColumnConfig> out = new ArrayList<>();
        if (src != null) {
            for (ColumnConfig c : src) {
                ColumnConfig copy = new ColumnConfig();
                copy.setKey(c.getKey());
                copy.setLabel(c.getLabel());
                copy.setColumnType(c.getColumnType());
                copy.setSortable(false);
                out.add(copy);
            }
        }
        return out;
    }

    @Override
    public BizDataPageVO query(DataSourceDefinition ds, BizDataQueryRequest req) {
        return switch (ds.getType()) {
            case "FORM" -> {
                router.resolve(ds, "list");
                yield bizDataService.query(ds.getFormKey(), req);
            }
            case "WORKFLOW" -> workflowQueryService.query(ds.getFormKey(), req);
            case "SYSTEM" -> {
                router.resolve(ds, "list");
                yield systemQuery(ds, req);
            }
            case "API" -> apiQuery(ds, req);
            default -> throw unsupported(ds, "query");
        };
    }

    @Override
    public BizDataVO get(DataSourceDefinition ds, String id) {
        return switch (ds.getType()) {
            case "FORM" -> {
                router.resolve(ds, "get");
                yield bizDataService.getById(ds.getFormKey(), id);
            }
            case "WORKFLOW" -> workflowQueryService.getById(ds.getFormKey(), id);
            case "SYSTEM" -> systemGet(ds, id);
            case "API" -> apiGet(ds, id);
            default -> throw unsupported(ds, "get");
        };
    }

    @Override
    public String create(DataSourceDefinition ds, Map<String, Object> data) {
        return switch (ds.getType()) {
            case "FORM" -> {
                router.resolve(ds, "create");
                yield bizDataService.create(ds.getFormKey(), data).getId();
            }
            case "WORKFLOW" -> throw new BusinessException(400, "工作流表单数据源为只读，不支持该操作");
            case "API" -> apiCreate(ds, data);
            default -> throw unsupported(ds, "create");
        };
    }

    @Override
    public void update(DataSourceDefinition ds, String id, Map<String, Object> data, Integer version) {
        switch (ds.getType()) {
            case "FORM" -> {
                router.resolve(ds, "update");
                bizDataService.update(ds.getFormKey(), id, data, version);
            }
            case "WORKFLOW" -> throw new BusinessException(400, "工作流表单数据源为只读，不支持该操作");
            case "API" -> apiUpdate(ds, id, data);
            default -> throw unsupported(ds, "update");
        }
    }

    @Override
    public void delete(DataSourceDefinition ds, String id) {
        switch (ds.getType()) {
            case "FORM" -> {
                router.resolve(ds, "delete");
                bizDataService.delete(ds.getFormKey(), id);
            }
            case "SYSTEM" -> {
                router.resolve(ds, "delete");
                // SYSTEM is read-only at adapter level; router allows for audit
                throw unsupported(ds, "delete");
            }
            case "WORKFLOW" -> throw new BusinessException(400, "工作流表单数据源为只读，不支持该操作");
            case "API" -> apiDelete(ds, id);
            default -> throw unsupported(ds, "delete");
        }
    }

    // ===== FORM helpers =====
    // (none extra — delegates directly to BizDataService)

    // ===== SYSTEM helpers =====

    private BizDataPageVO systemQuery(DataSourceDefinition ds, BizDataQueryRequest req) {
        if ("user-tree".equals(ds.getSourceKey())) {
            return queryUsers(req);
        }
        return queryDeptTree();
    }

    private BizDataVO systemGet(DataSourceDefinition ds, String id) {
        List<BizDataVO> all = systemQuery(ds, new BizDataQueryRequest()).getRecords();
        for (BizDataVO row : all) {
            if (row.getId().equals(id)) return row;
        }
        throw new BusinessException(404, "系统数据不存在: " + id);
    }

    private BizDataPageVO queryDeptTree() {
        List<BizDataVO> rows = new ArrayList<>();
        for (TreeNode node : organizationService.tree()) {
            collectNode(node, rows);
        }
        return new BizDataPageVO(rows, rows.size(), 0, rows.size());
    }

    private void collectNode(TreeNode node, List<BizDataVO> out) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", String.valueOf(node.id()));
        data.put("parentId", node.parentId() == null ? "" : String.valueOf(node.parentId()));
        data.put("label", node.label() == null ? "" : node.label());
        data.put("code", node.code() == null ? "" : node.code());
        out.add(new BizDataVO(String.valueOf(node.id()), data, null, null, null));
        if (node.children() != null) {
            for (TreeNode child : node.children()) {
                collectNode(child, out);
            }
        }
    }

    private BizDataPageVO queryUsers(BizDataQueryRequest req) {
        int userServicePage = Math.max(req.getPage(), 1);
        UserQueryRequest query = new UserQueryRequest(
                req.getKeyword(), null, null, null, null, null, userServicePage, req.getSize());
        PageResult<UserVO> page = userService.list(query);
        List<BizDataVO> rows = new ArrayList<>();
        for (UserVO u : page.getRows() == null ? List.<UserVO>of() : page.getRows()) {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("id", String.valueOf(u.id()));
            data.put("username", u.username());
            data.put("nickname", u.nickname() == null ? "" : u.nickname());
            data.put("orgId", u.orgId() == null ? "" : String.valueOf(u.orgId()));
            data.put("orgName", u.orgName() == null ? "" : u.orgName());
            data.put("status", u.status());
            rows.add(new BizDataVO(String.valueOf(u.id()), data, null, null, null));
        }
        return new BizDataPageVO(rows, page.getTotal(), userServicePage, req.getSize());
    }

    // ===== API helpers =====

    private DataSourceMetadata apiMetadata(DataSourceDefinition ds) {
        Map<String, Object> params = parseParams(ds);
        List<ColumnConfig> columns = new ArrayList<>();
        JsonNode colsNode = jsonNode(params, "columns");
        if (colsNode != null && colsNode.isArray()) {
            for (JsonNode node : colsNode) {
                columns.add(objectMapper.convertValue(node, ColumnConfig.class));
            }
        }
        return new DataSourceMetadata(columns, writable(params));
    }

    private BizDataPageVO apiQuery(DataSourceDefinition ds, BizDataQueryRequest req) {
        Map<String, Object> params = parseParams(ds);
        Map<String, Object> op = operation(params, "list");
        if (op == null) {
            throw new BusinessException(400, "API 数据源未配置 list 操作: " + ds.getName());
        }
        String action = requireAction(op, "list");
        String method = opMethod(op);
        Map<String, Object> vars = new HashMap<>();
        if (params.get("data") instanceof Map<?, ?> data) {
            for (Map.Entry<?, ?> e : data.entrySet()) {
                vars.put(String.valueOf(e.getKey()), e.getValue());
            }
        }
        vars.put("page", req.getPage());
        vars.put("size", req.getSize());
        String kw = req.getKeyword();
        vars.put("keyword", kw == null ? "" : kw);
        String searchParam = str(params.get("searchParam"));
        if (kw != null && !kw.isBlank() && searchParam != null && !searchParam.isBlank()) {
            vars.put(searchParam, kw);
        }
        Object raw = httpExecutor.execute(action, method, headers(params), List.of(), List.of(),
                vars, DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, DEFAULT_RETRY);
        return toPageVO(raw, op, req);
    }

    private BizDataVO apiGet(DataSourceDefinition ds, String id) {
        Map<String, Object> params = parseParams(ds);
        Map<String, Object> op = operation(params, "get");
        if (op == null) {
            throw new BusinessException(400, "API 数据源未配置 get 操作: " + ds.getName());
        }
        String action = requireAction(op, "get");
        Map<String, Object> vars = Map.of("id", id);
        Object raw = httpExecutor.execute(action, opMethod(op), headers(params), List.of(), List.of(),
                vars, DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, DEFAULT_RETRY);
        return new BizDataVO(id, asDataMap(raw), null, null, null);
    }

    private String apiCreate(DataSourceDefinition ds, Map<String, Object> data) {
        Map<String, Object> params = parseParams(ds);
        Map<String, Object> op = operation(params, "create");
        if (op == null) {
            throw new BusinessException(400, "API 数据源未配置 create 操作: " + ds.getName());
        }
        String action = requireAction(op, "create");
        Map<String, Object> vars = new HashMap<>(data);
        Object raw = httpExecutor.execute(action, opMethod(op), headers(params), List.of(), List.of(),
                vars, DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, DEFAULT_RETRY);
        Object id = asDataMap(raw).get("id");
        return id == null ? "" : String.valueOf(id);
    }

    private void apiUpdate(DataSourceDefinition ds, String id, Map<String, Object> data) {
        Map<String, Object> params = parseParams(ds);
        Map<String, Object> op = operation(params, "update");
        if (op == null) {
            throw new BusinessException(400, "API 数据源未配置 update 操作: " + ds.getName());
        }
        String action = requireAction(op, "update");
        Map<String, Object> vars = new HashMap<>();
        vars.put("id", id);
        vars.putAll(data);
        httpExecutor.execute(action, opMethod(op), headers(params), List.of(), List.of(),
                vars, DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, DEFAULT_RETRY);
    }

    private void apiDelete(DataSourceDefinition ds, String id) {
        Map<String, Object> params = parseParams(ds);
        Map<String, Object> op = operation(params, "delete");
        if (op == null) {
            throw new BusinessException(400, "API 数据源未配置 delete 操作: " + ds.getName());
        }
        String action = requireAction(op, "delete");
        httpExecutor.execute(action, opMethod(op), headers(params), List.of(), List.of(),
                Map.of("id", id), DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, DEFAULT_RETRY);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseParams(DataSourceDefinition ds) {
        String json = ds.getParams();
        if (json == null || json.isBlank()) {
            throw new BusinessException(400, "API 数据源缺少 params: " + ds.getName());
        }
        try {
            JsonNode node = objectMapper.readTree(json);
            if (!node.isObject()) {
                throw new BusinessException(400, "API 数据源 params 必须是 JSON 对象: " + ds.getName());
            }
            return objectMapper.convertValue(node, Map.class);
        } catch (JsonProcessingException e) {
            throw new BusinessException(400, "API 数据源 params 不是合法 JSON: " + ds.getName());
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> operation(Map<String, Object> params, String name) {
        Object op = params.get(name);
        if (op instanceof Map<?, ?> m) return (Map<String, Object>) m;
        if ("list".equals(name) && params.get("action") != null) {
            Map<String, Object> legacy = new LinkedHashMap<>();
            legacy.put("action", params.get("action"));
            legacy.put("method", params.get("method"));
            legacy.put("parse", params.get("parse"));
            legacy.put("totalParse", params.get("totalParse"));
            return legacy;
        }
        return null;
    }

    private String requireAction(Map<String, Object> op, String name) {
        String action = str(op.get("action"));
        if (action == null || action.isBlank()) {
            throw new BusinessException(400, "API 数据源 " + name + " 操作缺少 action");
        }
        return action;
    }

    private String opMethod(Map<String, Object> op) {
        String method = str(op.get("method"));
        return method == null || method.isBlank() ? "GET" : method.toUpperCase();
    }

    @SuppressWarnings("unchecked")
    private Map<String, String> headers(Map<String, Object> params) {
        Map<String, String> headers = new LinkedHashMap<>();
        Object h = params.get("headers");
        if (h instanceof Map<?, ?> hm) {
            for (Map.Entry<?, ?> e : hm.entrySet()) {
                headers.put(String.valueOf(e.getKey()), String.valueOf(e.getValue()));
            }
        }
        return headers;
    }

    private boolean writable(Map<String, Object> params) {
        return operation(params, "create") != null
                || operation(params, "update") != null
                || operation(params, "delete") != null;
    }

    private JsonNode jsonNode(Map<String, Object> params, String key) {
        Object v = params.get(key);
        if (v == null) return null;
        if (v instanceof JsonNode jn) return jn;
        try { return objectMapper.valueToTree(v); } catch (IllegalArgumentException e) { return null; }
    }

    private JsonNode toJsonNode(Object raw) {
        if (raw instanceof String s) {
            try { return objectMapper.readTree(s); }
            catch (JsonProcessingException e) { throw new BusinessException(400, "外部 API 响应不是合法 JSON"); }
        }
        return objectMapper.valueToTree(raw);
    }

    private JsonNode walkPath(JsonNode root, String path) {
        JsonNode cur = root;
        for (String part : path.split("\\.")) {
            if (cur == null || cur.isMissingNode() || !cur.isObject()) return null;
            cur = cur.get(part);
        }
        return cur;
    }

    private BizDataPageVO toPageVO(Object raw, Map<String, Object> op, BizDataQueryRequest req) {
        int normalizedPage = Math.max(req.getPage(), 1);
        JsonNode root = toJsonNode(raw);
        JsonNode recordsNode = root;
        String parse = str(op.get("parse"));
        if (parse != null && !parse.isBlank()) {
            recordsNode = walkPath(root, parse);
        }
        if (recordsNode == null || !recordsNode.isArray()) {
            return new BizDataPageVO(List.of(), 0, normalizedPage, req.getSize());
        }
        List<BizDataVO> records = new ArrayList<>();
        for (JsonNode item : recordsNode) {
            Map<String, Object> data = objectMapper.convertValue(item, Map.class);
            Object id = item.has("id") ? item.get("id").asText() : null;
            records.add(new BizDataVO(id == null ? "" : String.valueOf(id), data, null, null, null));
        }
        long total = records.size();
        String totalParse = str(op.get("totalParse"));
        if (totalParse != null && !totalParse.isBlank()) {
            JsonNode totalNode = walkPath(root, totalParse);
            if (totalNode != null && totalNode.isNumber()) total = totalNode.asLong();
        }
        return new BizDataPageVO(records, total, normalizedPage, req.getSize());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> asDataMap(Object raw) {
        if (raw == null) return Map.of();
        if (raw instanceof Map<?, ?> m) return (Map<String, Object>) m;
        return objectMapper.convertValue(toJsonNode(raw), Map.class);
    }

    private String str(Object v) { return v == null ? null : String.valueOf(v); }

    // ===== shared helpers =====

    private BusinessException unsupported(DataSourceDefinition ds, String op) {
        return new BusinessException(400, "该数据源不支持" + op + ": " + ds.getName());
    }

    private static ColumnConfig column(String key, String label, String type, int length) {
        ColumnConfig c = new ColumnConfig();
        c.setKey(key); c.setLabel(label); c.setColumnType(type); c.setLength(length);
        return c;
    }
}
