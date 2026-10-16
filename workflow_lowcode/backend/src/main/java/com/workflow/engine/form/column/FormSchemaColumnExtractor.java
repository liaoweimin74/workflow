package com.workflow.engine.form.column;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 表单列定义解析器。
 * 解析前端设计器生成并随表单持久化的 columnConfig JSON（用户确认过的列映射），
 * 以及表单 schema（form-create rule 数组）中的字段定义。
 * 供 WORKFLOW 数据源 metadata 组装使用。
 */
@Component
public class FormSchemaColumnExtractor {

    private static final Pattern COL_PATTERN = Pattern.compile("^[a-zA-Z][a-zA-Z0-9_]{0,63}$");
    /**
     * 不生成列的组件类型（纯布局/展示组件）。
     * 其余带 field 的组件（含子表单类 group/subForm/tableForm、人员/部门选择 userPicker/deptPicker）
     * 均生成列定义：数据存储类（子表单容器、人员/部门数组）推断为 JSON 列，并填写 componentType。
     */
    private static final Set<String> UNSUPPORTED_COMPONENTS = Set.of(
            "divider", "groupContainer", "dataTable");

    private final ObjectMapper objectMapper;

    public FormSchemaColumnExtractor(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * 将 columnConfig JSON 解析为列定义列表。
     *
     * @param columnConfigJson 前端持久化的列映射 JSON 数组（FormDefinition.columnConfig）
     * @return 列定义列表；输入为空、非法或非数组时返回空列表
     */
    public List<ColumnConfig> extract(String columnConfigJson) {
        if (columnConfigJson == null || columnConfigJson.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(columnConfigJson, new TypeReference<List<ColumnConfig>>() {});
        } catch (JsonProcessingException e) {
            return List.of();
        }
    }

    /**
     * 从 form-create schema（{rule: [...], option: {...}} 或纯数组）解析列定义。
     * 用于 WORKFLOW 表单（其 columnConfig 为空，列定义来自 schema 的 rule 数组）。
     * 支持递归遍历嵌套结构：layout 容器（children）、子表单（props.rule）、子表（props.columns[].rule）。
     *
     * @param schemaJson 表单 schema JSON，格式为 {rule: [...]} 或纯数组
     * @return 列定义列表；输入为空、非法时返回空列表
     */
    public List<ColumnConfig> extractFromSchema(String schemaJson) {
        if (schemaJson == null || schemaJson.isBlank()) {
            return List.of();
        }
        try {
            JsonNode root = objectMapper.readTree(schemaJson);
            JsonNode rules = root.isArray() ? root : root.path("rule");
            if (!rules.isArray() || rules.isEmpty()) {
                return List.of();
            }
            List<ColumnConfig> cols = new ArrayList<>();
            collectColumnsFromRules(rules, cols);
            return cols;
        } catch (JsonProcessingException e) {
            return List.of();
        }
    }

    /** 递归遍历 rule 数组，提取字段列定义 */
    private void collectColumnsFromRules(JsonNode rules, List<ColumnConfig> cols) {
        for (JsonNode rule : rules) {
            if (!rule.isObject()) {
                continue;
            }
            String field = rule.path("field").asText(null);
            String type = rule.path("type").asText(null);

            // formContainer 绑定外部数据源，其子字段不生成 DDL，整体跳过（不提取列、不递归子节点）
            // page-table 为数据表格展示组件，数据来自外部数据源，同样不生成 DDL
            if ("formContainer".equals(type) || "page-table".equals(type) || "page-list-cards".equals(type)) {
                continue;
            }

            // 如果有 field 且是有效字段名，提取列定义
            if (field != null && !field.isBlank() && COL_PATTERN.matcher(field).matches()) {
                // 跳过不支持的组件类型（布局容器、分割线等）
                if (type == null || !UNSUPPORTED_COMPONENTS.contains(type)) {
                    // form-create 规则中中文标签存储在 title 属性（如 "title": "原因"）
                    String label = rule.path("title").asText(null);
                    if (label == null || label.isBlank()) {
                        label = rule.path("label").asText(field);
                    }
                    if (label == null || label.isBlank()) {
                        label = field;
                    }
                    ColumnConfig c = new ColumnConfig();
                    c.setKey(field);
                    c.setLabel(label);
                    c.setColumnType(inferColumnType(type));
                    if (type != null && !type.isBlank()) {
                        c.setComponentType(type);
                    }
                    // 组件配置：rule.props 整体 JSON 存储（剔除 rule/columns 子规则，避免重复存储内嵌规则树）
                    c.setComponentProps(extractComponentProps(rule));
                    // 表单设计器中字段设为隐藏（rule.hidden=true）时，列定义同步标记 hidden
                    if (rule.path("hidden").asBoolean(false)) {
                        c.setHidden(true);
                    }
                    cols.add(c);
                }
            }

            // 递归遍历嵌套结构：
            // 1. 布局容器（row/col 等）：children
            JsonNode children = rule.path("children");
            if (children.isArray()) {
                collectColumnsFromRules(children, cols);
            }

            // 2. 子表单组件（group/subForm 等）：props.rule
            JsonNode propsRule = rule.path("props").path("rule");
            if (propsRule.isArray()) {
                collectColumnsFromRules(propsRule, cols);
            }

            // 3. 子表组件（tableForm）：props.columns[].rule
            JsonNode propsColumns = rule.path("props").path("columns");
            if (propsColumns.isArray()) {
                for (JsonNode col : propsColumns) {
                    JsonNode colRule = col.path("rule");
                    if (colRule.isArray()) {
                        collectColumnsFromRules(colRule, cols);
                    }
                }
            }
        }
    }

    /** 根据 form-create 组件类型推断数据库列类型 */
    private static String inferColumnType(String componentType) {
        if (componentType == null || componentType.isBlank()) {
            return "VARCHAR";
        }
        return switch (componentType) {
            case "inputNumber", "rate" -> "INT";
            // 多行文本：设计器产物为 input + props.type=textarea；form-create 别名 textarea；
            // AI formgen 历史输出 inputTextarea；富文本 fcEditor（vendor editor.js）
            case "inputTextarea", "textarea", "fcEditor", "editor" -> "TEXT";
            // 日期族：设计器标准 datePicker/timePicker（AI formgen 历史输出 date/datetime/time/dateRange）
            case "datePicker", "timePicker",
                 "date", "datetime", "time", "dateRange", "dateTimeRange" -> "DATETIME";
            case "switch", "checkbox" -> "TINYINT";
            // 子表单容器（group/subForm/tableForm）与人员/部门选择（userPicker/deptPicker）：整体 JSON 存储
            case "group", "subForm", "tableForm", "userPicker", "deptPicker" -> "JSON";
            default -> "VARCHAR";
        };
    }

    /**
     * 提取组件配置（rule.props 的 JSON 文本），剔除 rule/columns 两个子规则键
     * （group/subForm 的 props.rule、tableForm 的 props.columns 为内嵌规则树，已由递归平铺提取，避免重复存储）。
     */
    private String extractComponentProps(JsonNode rule) {
        JsonNode props = rule.path("props");
        if (!props.isObject() || props.isEmpty()) {
            return null;
        }
        // copy 后剔除，避免修改原树
        ObjectNode copy = props.deepCopy();
        copy.remove("rule");
        copy.remove("columns");
        if (copy.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(copy);
        } catch (JsonProcessingException e) {
            return null;
        }
    }
}
