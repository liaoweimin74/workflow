package com.workflow.engine.datasource;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.api.dto.DataSourceMetadata;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.logic.executor.HttpLogicExecutor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * API 数据源适配器：把外部 REST 接口统一为数据源 SPI。
 * 复用 HttpLogicExecutor（RestClient + 超时/重试 + 参数映射 + 变量解析）执行外部调用。
 * params（LookupFetchConfig 扩展）：
 * <pre>
 * {
 *   "list":    { "action": "/v1/external/list", "method": "POST", "parse": "records", "totalParse": "total" },
 *   "get":     { "action": "/v1/external/{id}", "method": "GET" },
 *   "create":  { "action": "/v1/external",      "method": "POST" },
 *   "update":  { "action": "/v1/external/{id}", "method": "PUT" },
 *   "delete":  { "action": "/v1/external/{id}", "method": "DELETE" },
 *   "columns": [ { "key": "name", "label": "名称", "columnType": "VARCHAR" } ],
 *   "searchParam": "kw", "keywordColumn": "name", "pageBase": 0,
 *   "data": { "dept": "IT" }, "headers": { "X-Api-Key": "abc" }
 * }
 * </pre>
 * 兼容旧格式：顶层 action/method/parse/totalParse 自动归入 list（method 默认 GET）。
 * 未配置的写操作（create/update/delete）→ 继承 default 抛"该数据源不支持XX"。
 */
@Component
public class ApiDataSourceAdapter implements DataSourceAdapter {

    /** 默认外部调用超时（毫秒） */
    private static final int DEFAULT_TIMEOUT_MS = 10000;
    private static final int DEFAULT_RETRY = 0;

    private final HttpLogicExecutor httpExecutor;
    private final ObjectMapper objectMapper;

    public ApiDataSourceAdapter(HttpLogicExecutor httpExecutor, ObjectMapper objectMapper) {
        this.httpExecutor = httpExecutor;
        this.objectMapper = objectMapper;
    }

    @Override
    public boolean supports(String type) {
        return "API".equals(type);
    }

    // ==================== 只读能力 ====================

    @Override
    public DataSourceMetadata metadata(DataSourceDefinition ds) {
        Map<String, Object> params = parseParams(ds);
        JsonNode columnsNode = jsonNode(params, "columns");
        List<ColumnConfig> columns = new ArrayList<>();
        if (columnsNode != null && columnsNode.isArray()) {
            for (JsonNode node : columnsNode) {
                columns.add(objectMapper.convertValue(node, ColumnConfig.class));
            }
        }
        return new DataSourceMetadata(columns, writable(params));
    }

    @Override
    public BizDataPageVO query(DataSourceDefinition ds, BizDataQueryRequest req) {
        Map<String, Object> params = parseParams(ds);
        Map<String, Object> op = operation(params, "list");
        if (op == null) {
            throw new BusinessException(400, "API 数据源未配置 list 操作: " + ds.getName());
        }
        String action = requireAction(op, "list");
        String method = opMethod(op);

        // 分页/搜索参数映射（vars 供模板解析）
        Map<String, Object> vars = new HashMap<>();
        if (params.get("data") instanceof Map<?, ?> data) {
            for (Map.Entry<?, ?> e : data.entrySet()) {
                vars.put(String.valueOf(e.getKey()), e.getValue());
            }
        }
        vars.put("page", req.getPage());
        vars.put("size", req.getSize());
        vars.put("keyword", req.getKeyword() == null ? "" : req.getKeyword());
        String searchParam = str(params.get("searchParam"));
        if (req.getKeyword() != null && !req.getKeyword().isBlank() && searchParam != null && !searchParam.isBlank()) {
            vars.put(searchParam, req.getKeyword());
        }

        Object raw = httpExecutor.execute(action, method, headers(params), List.of(), List.of(),
                vars, DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, DEFAULT_RETRY);
        return toPageVO(raw, op, req);
    }

    @Override
    public BizDataVO get(DataSourceDefinition ds, String id) {
        Map<String, Object> params = parseParams(ds);
        Map<String, Object> op = operation(params, "get");
        if (op == null) {
            throw new BusinessException(400, "API 数据源未配置 get 操作: " + ds.getName());
        }
        String action = requireAction(op, "get");
        Map<String, Object> vars = Map.of("id", id);
        Object raw = httpExecutor.execute(action, opMethod(op), headers(params), List.of(), List.of(),
                vars, DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, DEFAULT_RETRY);
        Map<String, Object> data = asDataMap(raw);
        return new BizDataVO(id, data, null, null, null);
    }

    // ==================== 写能力 ====================

    @Override
    public String create(DataSourceDefinition ds, Map<String, Object> data) {
        Map<String, Object> params = parseParams(ds);
        Map<String, Object> op = operation(params, "create");
        if (op == null) {
            throw new BusinessException(400, "API 数据源未配置 create 操作: " + ds.getName());
        }
        String action = requireAction(op, "create");
        Map<String, Object> vars = new HashMap<>();
        vars.putAll(data);
        Object raw = httpExecutor.execute(action, opMethod(op), headers(params), List.of(), List.of(),
                vars, DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, DEFAULT_RETRY);
        Map<String, Object> result = asDataMap(raw);
        Object id = result.get("id");
        return id == null ? "" : String.valueOf(id);
    }

    @Override
    public void update(DataSourceDefinition ds, String id, Map<String, Object> data, Integer version) {
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

    @Override
    public void delete(DataSourceDefinition ds, String id) {
        Map<String, Object> params = parseParams(ds);
        Map<String, Object> op = operation(params, "delete");
        if (op == null) {
            throw new BusinessException(400, "API 数据源未配置 delete 操作: " + ds.getName());
        }
        String action = requireAction(op, "delete");
        httpExecutor.execute(action, opMethod(op), headers(params), List.of(), List.of(),
                Map.of("id", id), DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, DEFAULT_RETRY);
    }

    // ==================== 内部工具 ====================

    private boolean writable(Map<String, Object> params) {
        return operation(params, "create") != null || operation(params, "update") != null || operation(params, "delete") != null;
    }

    /** 取某操作的配置对象；缺失返回 null（写操作走 default，只读操作抛明确错误） */
    @SuppressWarnings("unchecked")
    private Map<String, Object> operation(Map<String, Object> params, String name) {
        Object op = params.get(name);
        if (op instanceof Map<?, ?> m) {
            return (Map<String, Object>) m;
        }
        // 兼容旧格式：顶层 action 归入 list
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

    /** 解析 params JSON；非法 → 400 */
    @SuppressWarnings("unchecked")
    private Map<String, Object> parseParams(DataSourceDefinition ds) {
        String paramsJson = ds.getParams();
        if (paramsJson == null || paramsJson.isBlank()) {
            throw new BusinessException(400, "API 数据源缺少 params: " + ds.getName());
        }
        try {
            JsonNode node = objectMapper.readTree(paramsJson);
            if (!node.isObject()) {
                throw new BusinessException(400, "API 数据源 params 必须是 JSON 对象: " + ds.getName());
            }
            return objectMapper.convertValue(node, Map.class);
        } catch (JsonProcessingException e) {
            throw new BusinessException(400, "API 数据源 params 不是合法 JSON: " + ds.getName());
        }
    }

    /** 抽取响应中的 JsonNode；按 parse 路径（如 "records" 或 "data.rows"）定位 */
    private JsonNode jsonNode(Map<String, Object> params, String key) {
        Object v = params.get(key);
        if (v == null) return null;
        if (v instanceof JsonNode jn) return jn;
        try {
            return objectMapper.valueToTree(v);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /** 把 HTTP 响应（JSON 字符串或已解析对象）转 BizDataPageVO */
    private BizDataPageVO toPageVO(Object raw, Map<String, Object> op, BizDataQueryRequest req) {
        JsonNode root = toJsonNode(raw);
        JsonNode recordsNode = root;
        String parse = str(op.get("parse"));
        if (parse != null && !parse.isBlank()) {
            recordsNode = walkPath(root, parse);
        }
        if (recordsNode == null || !recordsNode.isArray()) {
            return new BizDataPageVO(List.of(), 0, req.getPage(), req.getSize());
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
            if (totalNode != null && totalNode.isNumber()) {
                total = totalNode.asLong();
            }
        }
        return new BizDataPageVO(records, total, req.getPage(), req.getSize());
    }

    /** 把 HTTP 响应对象转 JsonNode（String → parse，Map/List → valueToTree） */
    private JsonNode toJsonNode(Object raw) {
        if (raw instanceof String s) {
            try {
                return objectMapper.readTree(s);
            } catch (JsonProcessingException e) {
                throw new BusinessException(400, "外部 API 响应不是合法 JSON");
            }
        }
        return objectMapper.valueToTree(raw);
    }

    /** 按点分路径（"data.rows"）取节点；null 表示未找到 */
    private JsonNode walkPath(JsonNode root, String path) {
        JsonNode cur = root;
        for (String part : path.split("\\.")) {
            if (cur == null || cur.isMissingNode() || !cur.isObject()) return null;
            cur = cur.get(part);
        }
        return cur;
    }

    /** 把响应对象转业务数据 Map（null 兜底） */
    @SuppressWarnings("unchecked")
    private Map<String, Object> asDataMap(Object raw) {
        if (raw == null) return Map.of();
        if (raw instanceof Map<?, ?> m) return (Map<String, Object>) m;
        JsonNode node = toJsonNode(raw);
        return objectMapper.convertValue(node, Map.class);
    }

    private String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }
}
