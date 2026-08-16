package com.workflow.engine.page;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.page.entity.PageDefinition;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 视图编译器。
 * 将 VIEW 页面的声明式配置 {searchFields, columns, actions, detail, events}
 * 编译为可渲染产物 {rule, option}：
 * - searchFields → 查询条件组件 rule（matchType eq → input；like → input；range → datePicker/双输入）
 * - columns → table 组件 rule（el-table 列配置）
 * - actions → 操作按钮配置（create/edit/delete/view 开关）
 * - detail → 详情弹窗配置
 * - events → 声明式动作链（运行时由 PageRenderer 注册事件处理器）
 */
@Component
public class ViewCompiler {

    private final ObjectMapper objectMapper;

    public ViewCompiler(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * 编译视图配置为 {rule, option} JSON。
     *
     * @param page        待编译的 VIEW 页面（schema 为声明式配置）
     * @param bindColumns 绑定表单的列映射（用于校验引用列合法性）
     * @return 编译产物 JSON 字符串
     * @throws BusinessException 未知 matchType / 引用列不存在等
     */
    public String compile(PageDefinition page, List<ColumnConfig> bindColumns) {
        try {
            JsonNode root = objectMapper.readTree(page.getSchema() == null || page.getSchema().isBlank()
                    ? "{}" : page.getSchema());
            Set<String> validKeys = new HashSet<>();
            if (bindColumns != null) {
                for (ColumnConfig c : bindColumns) {
                    validKeys.add(c.getKey());
                }
            }

            ObjectNode result = objectMapper.createObjectNode();
            ArrayNode rule = result.putArray("rule");
            ObjectNode option = result.putObject("option");

            compileSearchFields(root, rule, validKeys);
            compileColumns(root, rule, validKeys);
            compileActions(root, rule);
            compileDetail(root, rule);
            compileEvents(root, rule);

            return objectMapper.writeValueAsString(result);
        } catch (JsonProcessingException e) {
            throw new BusinessException(400, "视图配置解析失败");
        }
    }

    /**
     * searchFields → 查询条件组件规则。
     * matchType：eq/like → 文本输入；range → 日期范围（DATE/DATETIME）或双数字输入（数字列）。
     */
    private void compileSearchFields(JsonNode root, ArrayNode rule, Set<String> validKeys) {
        JsonNode searchFields = root.path("searchFields");
        if (!searchFields.isArray()) {
            return;
        }
        for (JsonNode field : searchFields) {
            String key = field.path("key").asText();
            String label = field.path("label").asText(key);
            String matchType = field.path("matchType").asText("eq");
            if (!validKeys.isEmpty() && !validKeys.contains(key)) {
                throw new BusinessException(400, "查询字段引用列不存在: " + key);
            }
            ObjectNode item = objectMapper.createObjectNode();
            item.put("type", "input");
            item.put("field", key);
            item.put("title", label);
            item.put("value", "");

            ObjectNode props = item.putObject("props");
            props.put("placeholder", label);
            props.put("style", "width: 180px");

            if ("range".equals(matchType)) {
                item.put("type", "datePicker");
                item.putArray("value");
                props.put("type", "datetimerange");
                props.put("valueFormat", "yyyy-MM-dd HH:mm:ss");
                props.put("startPlaceholder", "开始" + label);
                props.put("endPlaceholder", "结束" + label);
            } else if (!"eq".equals(matchType) && !"like".equals(matchType)) {
                throw new BusinessException(400, "未知查询匹配类型: " + matchType);
            }
            // 存储原始 matchType 供运行时构建查询条件
            item.put("matchType", matchType);
            rule.add(item);
        }
    }

    /**
     * columns → table 组件规则（el-table + 列配置）。
     */
    private void compileColumns(JsonNode root, ArrayNode rule, Set<String> validKeys) {
        JsonNode columns = root.path("columns");
        if (!columns.isArray() || columns.isEmpty()) {
            return;
        }
        ObjectNode table = objectMapper.createObjectNode();
        table.put("type", "table");
        table.put("field", "__page_table");
        table.put("title", "数据列表");
        ObjectNode tableProps = table.putObject("props");
        tableProps.putArray("columns");
        ArrayNode colNodes = (ArrayNode) tableProps.get("columns");
        for (JsonNode column : columns) {
            String key = column.path("key").asText();
            if (!validKeys.isEmpty() && !validKeys.contains(key)) {
                throw new BusinessException(400, "展示列引用列不存在: " + key);
            }
            ObjectNode col = colNodes.addObject();
            col.put("prop", key);
            col.put("label", column.path("label").asText(key));
            col.put("minWidth", 130);
            if (column.has("width")) {
                col.put("width", column.path("width").asInt(130));
            }
            if (column.has("align")) {
                col.put("align", column.path("align").asText("left"));
            }
            if (column.path("sortable").asBoolean(false)) {
                col.put("sortable", true);
            }
        }
        rule.add(table);
    }

    /**
     * actions → 操作按钮配置（create/edit/delete/view 开关）。
     */
    private void compileActions(JsonNode root, ArrayNode rule) {
        JsonNode actions = root.path("actions");
        if (!actions.isObject()) {
            return;
        }
        ObjectNode actionsNode = rule.addObject();
        actionsNode.put("type", "__page_actions");
        actionsNode.put("field", "__page_actions");
        actionsNode.put("title", "操作");
        ObjectNode props = actionsNode.putObject("props");
        for (String action : List.of("create", "edit", "delete", "view")) {
            if (actions.path(action).asBoolean(false)) {
                props.put(action, true);
            }
        }
        if (actions.has("permissions") && actions.path("permissions").isTextual()) {
            props.put("permissions", actions.path("permissions").asText());
        }
    }

    /**
     * detail → 详情弹窗配置。
     */
    private void compileDetail(JsonNode root, ArrayNode rule) {
        JsonNode detail = root.path("detail");
        if (!detail.isObject() || !detail.path("enabled").asBoolean(false)) {
            return;
        }
        ObjectNode detailNode = rule.addObject();
        detailNode.put("type", "__page_detail");
        detailNode.put("field", "__page_detail");
        detailNode.put("title", "详情");
        ObjectNode props = detailNode.putObject("props");
        props.put("enabled", true);
        if (detail.has("width")) {
            props.put("width", detail.path("width").asText("800px"));
        }
        if (detail.path("type").asText("form").equals("form")) {
            props.put("type", "form");
        }
    }

    /**
     * events → 声明式动作链（原样嵌入编译产物，运行时替换模板变量后执行）。
     */
    private void compileEvents(JsonNode root, ArrayNode rule) {
        JsonNode events = root.path("events");
        if (!events.isArray() || events.isEmpty()) {
            return;
        }
        ObjectNode eventsNode = rule.addObject();
        eventsNode.put("type", "__page_events");
        eventsNode.put("field", "__page_events");
        eventsNode.put("title", "事件");
        eventsNode.set("events", events.deepCopy());
    }
}