package com.workflow.api.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.ColumnMeta;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.bizdata.SqlMetadataProbe;
import com.workflow.engine.logic.executor.HttpLogicExecutor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** 数据源字段元数据探测端点（SQL 执行 / API 样例推断） */
@RestController
@RequestMapping("/api/v1/data-sources")
public class MetadataProbeController {

    private static final int TIMEOUT_MS = 10000;

    private final SqlMetadataProbe sqlProbe;
    private final HttpLogicExecutor httpExecutor;
    private final ObjectMapper objectMapper;

    public MetadataProbeController(SqlMetadataProbe sqlProbe, HttpLogicExecutor httpExecutor, ObjectMapper objectMapper) {
        this.sqlProbe = sqlProbe;
        this.httpExecutor = httpExecutor;
        this.objectMapper = objectMapper;
    }

    /** 执行完整 SQL，返回列元数据（LIMIT 1 包裹，不返回数据） */
    @PostMapping("/explore-sql")
    public R<List<ColumnMeta>> exploreSql(@RequestBody Map<String, String> body) {
        String sql = body == null ? null : body.get("sql");
        return R.ok(sqlProbe.probe(sql));
    }

    /** 调用 API list 操作拉样例，从返回 JSON 推断列 */
    @PostMapping("/explore-api")
    public R<List<ColumnMeta>> exploreApi(@RequestBody Map<String, Object> body) {
        if (body == null || body.get("action") == null) {
            throw new BusinessException(400, "缺少 action（list 操作地址）");
        }
        String action = String.valueOf(body.get("action"));
        String method = body.get("method") == null ? "GET" : String.valueOf(body.get("method"));
        Map<String, Object> vars = new java.util.HashMap<>();
        if (body.get("data") instanceof Map<?, ?> data) {
            for (Map.Entry<?, ?> e : data.entrySet()) {
                vars.put(String.valueOf(e.getKey()), e.getValue());
            }
        }
        vars.put("page", 1);
        vars.put("size", 1);
        Object raw = httpExecutor.execute(action, method, Map.of(), List.of(), List.of(),
                vars, TIMEOUT_MS, TIMEOUT_MS, 0);
        return R.ok(inferColumns(raw));
    }

    /** 从 HTTP 响应 JSON 推断列：定位第一个数组节点，取首元素对象字段推断类型 */
    private List<ColumnMeta> inferColumns(Object raw) {
        try {
            JsonNode root = raw instanceof String s ? objectMapper.readTree(s) : objectMapper.valueToTree(raw);
            JsonNode arr = findFirstArray(root);
            if (arr == null || arr.isEmpty()) {
                throw new BusinessException(400, "接口返回中未找到数组数据，无法推断字段");
            }
            JsonNode sample = arr.get(0);
            List<ColumnMeta> out = new ArrayList<>();
            if (sample.isObject()) {
                sample.fields().forEachRemaining(e -> out.add(new ColumnMeta(
                        e.getKey(), e.getKey(), inferType(e.getValue()), null, null, true)));
            }
            return out;
        } catch (BusinessException be) {
            throw be;
        } catch (Exception e) {
            throw new BusinessException(400, "接口返回解析失败: " + e.getMessage());
        }
    }

    private static JsonNode findFirstArray(JsonNode node) {
        if (node == null) {
            return null;
        }
        if (node.isArray()) {
            return node;
        }
        if (node.isObject()) {
            for (JsonNode child : node) {
                JsonNode hit = findFirstArray(child);
                if (hit != null) {
                    return hit;
                }
            }
        }
        return null;
    }

    private static String inferType(JsonNode v) {
        if (v == null || v.isNull()) {
            return "VARCHAR";
        }
        if (v.isTextual()) {
            return "VARCHAR";
        }
        if (v.isIntegralNumber()) {
            return "INT";
        }
        if (v.isFloatingPointNumber()) {
            return "DECIMAL";
        }
        if (v.isBoolean()) {
            return "TINYINT";
        }
        if (v.isArray() || v.isObject()) {
            return "JSON";
        }
        return "VARCHAR";
    }
}
