package com.workflow.engine.logicflow.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.form.entity.FormData;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDataRepository;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.logicflow.entity.FormLogicBinding;
import com.workflow.engine.logicflow.repository.FormLogicBindingRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 设计期表单字段发现服务：把「逻辑流绑定的表单」解析为 formData 字段树，
 * 供逻辑流设计器变量选择器树形展开（用户点选字段，免手敲路径）。
 *
 * <p>三路来源（按优先级，全部汇成 {@link FormFieldVO} 树）：
 * <ol>
 *   <li>BUSINESS 业务表单：{@code columnConfig} 直读（结构化列清单 key/label/columnType）；</li>
 *   <li>WORKFLOW 审批表单：{@code schema}（form-create rule 树）递归提取 field/title——
 *       布局容器（row/col 等无 field 节点）下钻 children 且子字段保持平铺
 *       （form-create 嵌套容器语义为并列字段，不加前缀）；{@code props.columns}
 *       （LookupPicker/SearchTable 等列定义）生成父字段下 children（点路径取列）；</li>
 *   <li>实例采样兜底：schema 为空（如流程侧动态构建的审批表单）时取该表单
 *       最近 10 条非快照 FormData.dataJson 合并字段（只取结构不取值，类型按值推断）。</li>
 * </ol>
 *
 * <p>版本选择：PUBLISHED 最新版优先，无已发布版本回退全版本最新（与运行期
 * 审批链路「取最新」语义对齐）。解析容错：单表单 JSON 损坏仅影响自身组，
 * 不阻断其余组返回。
 */
@Service
public class FormFieldSchemaService {

    private static final Logger log = LoggerFactory.getLogger(FormFieldSchemaService.class);

    /** 表单字段节点：path 为相对 formData 根的完整点路径（如 person_name / items.price）。 */
    public record FormFieldVO(String path, String label, String type, List<FormFieldVO> children) {
    }

    /**
     * 单个绑定表单的字段组：triggerTypes 为该表单绑定的触发点集合
     * （前端据此决定是否展示 formDataExisting「更新前旧行」条目）。
     */
    public record FormFieldGroupVO(String formKey, String formName, String formType,
                                   String source, List<String> triggerTypes,
                                   List<FormFieldVO> fields) {
    }

    /** 采样行数上限（合并字段，只取结构）。 */
    static final int SAMPLE_ROWS = 10;

    private final FormLogicBindingRepository bindings;
    private final FormDefinitionRepository formDefs;
    private final FormDataRepository formDataRepo;
    private final ObjectMapper objectMapper;

    public FormFieldSchemaService(FormLogicBindingRepository bindings,
                                  FormDefinitionRepository formDefs,
                                  FormDataRepository formDataRepo,
                                  ObjectMapper objectMapper) {
        this.bindings = bindings;
        this.formDefs = formDefs;
        this.formDataRepo = formDataRepo;
        this.objectMapper = objectMapper;
    }

    /**
     * 列出逻辑流（flowKey）全部启用绑定表单的字段组；无绑定/流 key 为空返回空列表。
     * 同一 formType+formKey 多触发点绑定为同一组（triggerTypes 聚合）。
     */
    public List<FormFieldGroupVO> listFieldsForFlow(String tenantId, String flowKey) {
        if (tenantId == null || tenantId.isBlank() || flowKey == null || flowKey.isBlank()) {
            return List.of();
        }
        List<FormLogicBinding> rows =
                bindings.findByTenantIdAndFlowKeyAndEnabledTrueOrderByCreatedAtAsc(tenantId, flowKey);

        // formType+formKey 去重聚合（保持绑定创建顺序）
        Map<String, Agg> byForm = new LinkedHashMap<>();
        for (FormLogicBinding b : rows) {
            if (b == null || b.getFormKey() == null || b.getFormKey().isBlank()) continue;
            byForm.computeIfAbsent(b.getFormType() + "::" + b.getFormKey(),
                            k -> new Agg(b.getFormType(), b.getFormKey()))
                    .triggers.add(b.getTriggerType());
        }

        List<FormFieldGroupVO> out = new ArrayList<>();
        for (Agg agg : byForm.values()) {
            FormDefinition def = formDefs
                    .findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(tenantId, agg.formKey, "PUBLISHED")
                    .orElseGet(() -> formDefs
                            .findFirstByTenantIdAndKeyOrderByVersionDesc(tenantId, agg.formKey)
                            .orElse(null));
            if (def == null) {
                log.debug("form-fields: form {} bound to flow {} has no definition", agg.formKey, flowKey);
                continue;
            }
            try {
                ExtractResult r = extract(def);
                out.add(new FormFieldGroupVO(def.getKey(), def.getName(), def.getType(),
                        r.source(), List.copyOf(agg.triggers), r.fields()));
            } catch (Exception e) {
                log.warn("form-fields: extract failed for form {} ({}): {}",
                        agg.formKey, def.getId(), e.getMessage());
            }
        }
        return out;
    }

    private record ExtractResult(String source, List<FormFieldVO> fields) {
    }

    /** 同表单多触发点绑定聚合（LinkedHashSet 保持触发点声明顺序）。 */
    private static final class Agg {
        final String formType;
        final String formKey;
        final Set<String> triggers = new LinkedHashSet<>();

        Agg(String formType, String formKey) {
            this.formType = formType;
            this.formKey = formKey;
        }
    }

    // ------------------------------------------------------------------
    // 提取：单表单 → 字段树
    // ------------------------------------------------------------------

    private ExtractResult extract(FormDefinition def) {
        if ("BUSINESS".equals(def.getType())) {
            List<FormFieldVO> fields = fromColumnConfig(def.getColumnConfig());
            if (!fields.isEmpty()) {
                return new ExtractResult("columnConfig", fields);
            }
        }
        List<FormFieldVO> fields = fromRuleTree(def.getSchema());
        if (!fields.isEmpty()) {
            return new ExtractResult("schema", fields);
        }
        fields = sampleFromData(def.getTenantId(), def.getId());
        return new ExtractResult(fields.isEmpty() ? "empty" : "sampled", fields);
    }

    /** BUSINESS columnConfig：[{key,label,columnType,...}] 直读。 */
    private List<FormFieldVO> fromColumnConfig(String columnConfig) {
        JsonNode arr = parse(columnConfig);
        if (arr == null || !arr.isArray()) return List.of();
        List<FormFieldVO> out = new ArrayList<>();
        for (JsonNode col : arr) {
            String key = text(col, "key");
            if (key == null || key.contains(".")) continue;
            out.add(new FormFieldVO(key, text(col, "label"),
                    mapColumnType(text(col, "columnType")), List.of()));
        }
        return out;
    }

    /** WORKFLOW schema：form-create rule（{"rule":[...]} 或裸数组）平铺收集字段。 */
    private List<FormFieldVO> fromRuleTree(String schema) {
        JsonNode root = parse(schema);
        if (root == null) return List.of();
        JsonNode rules = root.isArray() ? root : root.get("rule");
        if (rules == null || !rules.isArray()) return List.of();
        Map<String, FormFieldVO> seen = new LinkedHashMap<>();
        walkRules(rules, seen);
        return List.copyOf(seen.values());
    }

    /**
     * rule 树遍历：field 为对象字段名（全树平铺去重，布局容器 children 并列收集不加前缀）；
     * props.columns（[{prop,label}]）生成父字段 children（列子路径）。
     */
    private void walkRules(JsonNode node, Map<String, FormFieldVO> seen) {
        if (node == null) return;
        if (node.isArray()) {
            for (JsonNode child : node) {
                walkRules(child, seen);
            }
            return;
        }
        if (!node.isObject()) return;

        String field = text(node, "field");
        if (field != null && !field.isBlank() && !field.contains(".") && !seen.containsKey(field)) {
            List<FormFieldVO> children = new ArrayList<>();
            JsonNode cols = node.at("/props/columns");
            if (cols.isArray()) {
                Set<String> colSeen = new LinkedHashSet<>();
                for (JsonNode col : cols) {
                    String prop = text(col, "prop");
                    if (prop == null || prop.isBlank() || prop.contains(".") || !colSeen.add(prop)) continue;
                    children.add(new FormFieldVO(field + "." + prop, text(col, "label"), "string", List.of()));
                }
            }
            seen.put(field, new FormFieldVO(field, text(node, "title"),
                    mapComponentType(text(node, "type")), List.copyOf(children)));
        }
        walkRules(node.get("children"), seen);
    }

    /** 实例采样：最近 N 条非快照 dataJson 合并字段（只取结构，值推断类型）。 */
    private List<FormFieldVO> sampleFromData(String tenantId, String formDefId) {
        if (formDefId == null || formDefId.isBlank()) return List.of();
        List<FormData> rows;
        try {
            rows = formDataRepo.findTop10ByTenantIdAndFormDefIdAndIsSnapshotOrderByUpdatedAtDesc(
                    tenantId, formDefId, false);
        } catch (Exception e) {
            log.debug("form-fields: sample query failed for {}: {}", formDefId, e.getMessage());
            return List.of();
        }
        Map<String, FormFieldVO> merged = new LinkedHashMap<>();
        for (FormData row : rows) {
            JsonNode data = parse(row == null ? null : row.getDataJson());
            if (data == null || !data.isObject()) continue;
            var it = data.fields();
            while (it.hasNext()) {
                var e = it.next();
                if (!merged.containsKey(e.getKey())) {
                    merged.put(e.getKey(), inferField(e.getKey(), e.getValue(), 0));
                }
            }
        }
        return List.copyOf(merged.values());
    }

    /** 值类型推断：object/array 下钻一层取子字段（path 拼完整点路径）。 */
    private FormFieldVO inferField(String path, JsonNode value, int depth) {
        if (value == null || value.isNull()) {
            return new FormFieldVO(path, null, "string", List.of());
        }
        if (value.isObject()) {
            List<FormFieldVO> children = new ArrayList<>();
            if (depth < 2) {
                var it = value.fields();
                while (it.hasNext()) {
                    var e = it.next();
                    children.add(inferField(path + "." + e.getKey(), e.getValue(), depth + 1));
                }
            }
            return new FormFieldVO(path, null, "object", List.copyOf(children));
        }
        if (value.isArray()) {
            List<FormFieldVO> children = new ArrayList<>();
            if (depth < 2 && !value.isEmpty()) {
                JsonNode first = value.get(0);
                if (first.isObject()) {
                    var it = first.fields();
                    while (it.hasNext()) {
                        var e = it.next();
                        children.add(inferField(path + "." + e.getKey(), e.getValue(), depth + 1));
                    }
                }
            }
            return new FormFieldVO(path, null, "array", List.copyOf(children));
        }
        if (value.isNumber()) return new FormFieldVO(path, null, "number", List.of());
        if (value.isBoolean()) return new FormFieldVO(path, null, "boolean", List.of());
        return new FormFieldVO(path, null, "string", List.of());
    }

    // ------------------------------------------------------------------
    // 类型映射与工具
    // ------------------------------------------------------------------

    /** 数据列类型 → 变量类型（宽松前缀匹配）。 */
    private String mapColumnType(String columnType) {
        String t = (columnType == null ? "" : columnType.trim().toUpperCase());
        if (t.isEmpty()) return "string";
        if (t.startsWith("INT") || t.startsWith("BIGINT") || t.startsWith("SMALLINT")
                || t.startsWith("TINYINT") || t.startsWith("DEC") || t.startsWith("NUM")
                || t.startsWith("DOUBLE") || t.startsWith("FLOAT")) return "number";
        if (t.startsWith("BOOL") || "BIT".equals(t)) return "boolean";
        if (t.equals("JSON")) return "json";
        return "string";
    }

    /** form-create 组件 type → 变量类型。 */
    private String mapComponentType(String type) {
        String t = (type == null ? "" : type.trim().toLowerCase());
        if (t.isEmpty()) return "string";
        if (t.contains("number") || t.equals("slider") || t.equals("rate")) return "number";
        if (t.equals("switch")) return "boolean";
        if (t.contains("checkbox") || t.contains("cascader") || t.contains("upload")
                || t.contains("range")) return "array";
        return "string";
    }

    private JsonNode parse(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            return objectMapper.readTree(json);
        } catch (Exception e) {
            return null;
        }
    }

    private String text(JsonNode node, String field) {
        if (node == null) return null;
        JsonNode v = node.get(field);
        return v == null || v.isNull() ? null : v.asText();
    }
}
