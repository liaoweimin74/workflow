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
            compileSortableFields(root, result, validKeys);
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
     * sortableFields → 产物顶层数组（视图级排序收窄；引用列存在校验）。
     * 排序能力上限由数据源 metadata 决定，此处仅校验引用列存在于绑定数据源列。
     */
    private void compileSortableFields(JsonNode root, ObjectNode result, Set<String> validKeys) {
        JsonNode fields = root.path("sortableFields");
        if (!fields.isArray() || fields.isEmpty()) {
            return;
        }
        ArrayNode out = result.putArray("sortableFields");
        for (JsonNode f : fields) {
            String key = f.asText();
            if (key.isBlank()) {
                continue;
            }
            if (!validKeys.isEmpty() && !validKeys.contains(key)) {
                throw new BusinessException(400, "排序字段引用列不存在: " + key);
            }
            out.add(key);
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
        }
        rule.add(table);
    }

    /**
     * actions → 操作按钮配置。
     * 支持按钮数组格式：{buttons:[{key,label,placement,style,events?}]}（每按钮独立配置，
     * 自定义按钮可携带事件链）；兼容旧布尔格式 {create/edit/delete/view, placement, style}。
     * placement：toolbar（操作栏）/ column（操作列）；style：icon / text / button。
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
        if (actions.path("permissions").isTextual()) {
            props.put("permissions", actions.path("permissions").asText());
        }
        if (actions.has("actionColumnWidth") && actions.path("actionColumnWidth").isInt()
                && actions.path("actionColumnWidth").asInt() > 0) {
            props.put("actionColumnWidth", actions.path("actionColumnWidth").asInt());
        }
        JsonNode buttons = actions.path("buttons");
        if (buttons.isArray()) {
            // 按钮数组格式：每按钮独立配置
            ArrayNode btnNodes = props.putArray("buttons");
            for (JsonNode btn : buttons) {
                String key = btn.path("key").asText();
                if (key.isBlank()) {
                    throw new BusinessException(400, "操作按钮 key 不能为空");
                }
                ObjectNode b = btnNodes.addObject();
                b.put("key", key);
                b.put("label", btn.path("label").asText(key));
                String placement = btn.path("placement").asText("column");
                if (!"toolbar".equals(placement) && !"column".equals(placement)) {
                    throw new BusinessException(400, "未知操作位置 placement: " + placement);
                }
                b.put("placement", placement);
                String style = btn.path("style").asText("button");
                if (!"icon".equals(style) && !"text".equals(style) && !"button".equals(style)) {
                    throw new BusinessException(400, "未知按钮形态 style: " + style);
                }
                b.put("style", style);
                if (btn.has("icon") && btn.path("icon").isTextual() && !btn.path("icon").asText().isBlank()) {
                    b.put("icon", btn.path("icon").asText());
                }
                if (btn.has("events")) {
                    b.set("events", btn.path("events").deepCopy());
                }
            }
        } else {
            // 兼容旧布尔格式
            for (String action : List.of("create", "edit", "delete", "view")) {
                if (actions.path(action).asBoolean(false)) {
                    props.put(action, true);
                }
            }
            String placement = actions.path("placement").asText("column");
            if (!"toolbar".equals(placement) && !"column".equals(placement)) {
                throw new BusinessException(400, "未知操作位置 placement: " + placement);
            }
            props.put("placement", placement);
            String style = actions.path("style").asText("button");
            if (!"icon".equals(style) && !"text".equals(style) && !"button".equals(style)) {
                throw new BusinessException(400, "未知按钮形态 style: " + style);
            }
            props.put("style", style);
        }
    }

    /**
     * detail → 详情弹窗配置（由 view 按钮启用；view 关闭/未配置则不编译）。
     * 兼容旧格式 detail.enabled（显式 true 亦启用）；按钮数组格式下检查 buttons 是否含 view。
     */
    private void compileDetail(JsonNode root, ArrayNode rule) {
        JsonNode detail = root.path("detail");
        if (!detail.isObject()) {
            return;
        }
        boolean viewEnabled = isViewEnabled(root.path("actions"));
        boolean legacyEnabled = detail.path("enabled").asBoolean(false);
        if (!viewEnabled && !legacyEnabled) {
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

    /** view 按钮是否启用：按钮数组含 key=view，或旧布尔格式 view=true */
    private boolean isViewEnabled(JsonNode actions) {
        if (!actions.isObject()) {
            return false;
        }
        JsonNode buttons = actions.path("buttons");
        if (buttons.isArray()) {
            for (JsonNode btn : buttons) {
                if ("view".equals(btn.path("key").asText())) {
                    return true;
                }
            }
            return false;
        }
        return actions.path("view").asBoolean(false);
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