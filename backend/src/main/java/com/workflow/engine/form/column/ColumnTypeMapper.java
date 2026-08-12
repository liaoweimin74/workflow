package com.workflow.engine.form.column;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 组件类型 → 列类型映射器。
 * 将 form-create 组件类型映射为物理表列类型，并提供白名单校验。
 */
public final class ColumnTypeMapper {

    /** 允许的列类型白名单 */
    private static final Set<String> ALLOWED_TYPES = Set.of(
            "VARCHAR", "TEXT", "INT", "DECIMAL", "DATE", "DATETIME", "TINYINT", "JSON");

    /** 不支持映射为可查询列的组件（子表/嵌套表单/人员选择等） */
    private static final Set<String> UNSUPPORTED_COMPONENTS = Set.of(
            "subTable", "SubTable", "nestedForm", "NestedForm", "dataTable",
            "userPicker", "deptPicker", "divider", "groupContainer");

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private ColumnTypeMapper() {}

    /**
     * 将组件类型映射为列映射草案。
     *
     * @param componentType form-create rule 的 type 字段
     * @param props         form-create rule 的 props（用于子类型判定：日期类型/数字精度）
     * @return 列映射草案；不支持映射的组件返回 null
     */
    public static ColumnConfig mapComponentToColumn(String componentType, Map<String, Object> props) {
        if (componentType == null || UNSUPPORTED_COMPONENTS.contains(componentType)) {
            return null;
        }

        ColumnConfig c = new ColumnConfig();
        switch (componentType) {
            case "input" -> applyString(c, 255);
            case "textarea", "RichText", "richText" -> applyText(c);
            case "inputNumber" -> applyNumber(c, props);
            case "select", "radio", "cascader" -> applyString(c, 255);
            case "checkbox", "multiSelect", "multiSelectPro" -> applyString(c, 1024);
            case "DatePicker", "datePicker" -> applyDate(c, props);
            case "TimePicker", "timePicker" -> applyString(c, 32);
            case "switch" -> applyTinyint(c);
            case "Upload", "upload", "fileUpload" -> applyJson(c);
            default -> {
                return null;
            }
        }
        return c;
    }

    private static void applyString(ColumnConfig c, Integer length) {
        c.setColumnType("VARCHAR");
        c.setLength(length);
    }

    private static void applyText(ColumnConfig c) {
        c.setColumnType("TEXT");
    }

    private static void applyNumber(ColumnConfig c, Map<String, Object> props) {
        int precision = 0;
        if (props != null && props.get("precision") instanceof Number n) {
            precision = n.intValue();
        }
        if (precision > 0) {
            c.setColumnType("DECIMAL");
            c.setLength(18);
            c.setScale(precision);
        } else {
            c.setColumnType("INT");
        }
    }

    private static void applyDate(ColumnConfig c, Map<String, Object> props) {
        String subType = props == null ? null : String.valueOf(props.get("type"));
        if ("datetime".equals(subType) || "datetimerange".equals(subType)) {
            c.setColumnType("DATETIME");
        } else {
            c.setColumnType("DATE");
        }
    }

    private static void applyTinyint(ColumnConfig c) {
        c.setColumnType("TINYINT");
        c.setLength(1);
    }

    private static void applyJson(ColumnConfig c) {
        c.setColumnType("JSON");
    }

    /**
     * 生成 data-picker 字段的两列映射：
     * <key> VARCHAR(64) 存被引用记录 id（多选逗号分隔，带 pickerConfig）
     * <key>_text VARCHAR(1024) 存冗余显示文本（hidden=true）
     *
     * @param key   字段 key
     * @param props form-create rule 的 props（sourceFormKey/displayField/mode）
     * @return 两列映射
     */
    public static List<ColumnConfig> mapPickerToColumns(String key, Map<String, Object> props) {
        ColumnConfig idCol = new ColumnConfig();
        idCol.setKey(key);
        idCol.setColumnType("VARCHAR");
        idCol.setLength(64);

        Map<String, Object> picker = new LinkedHashMap<>();
        picker.put("sourceFormKey", props == null ? null : props.get("sourceFormKey"));
        picker.put("displayField", props == null ? null : props.get("displayField"));
        picker.put("mode", props == null ? null : props.get("mode"));
        try {
            idCol.setPickerConfig(OBJECT_MAPPER.writeValueAsString(picker));
        } catch (JsonProcessingException e) {
            idCol.setPickerConfig("{}");
        }

        ColumnConfig textCol = new ColumnConfig();
        textCol.setKey(key + "_text");
        textCol.setLabel((props != null && props.get("title") != null) ? String.valueOf(props.get("title")) + "（显示）" : null);
        textCol.setColumnType("VARCHAR");
        textCol.setLength(1024);
        textCol.setHidden(true);

        return List.of(idCol, textCol);
    }

    /**
     * 判断列类型是否在允许的白名单内。
     */
    public static boolean isAllowedColumnType(String columnType) {
        return columnType != null && ALLOWED_TYPES.contains(columnType);
    }

    /**
     * 判断新旧列类型是否为跨大类变更（不允许的 DDL 变更）。
     * 字符串类(VARCHAR/TEXT)、整数类(INT)、小数类(DECIMAL)、日期类(DATE/DATETIME)、其他 之间互相切换视为跨类。
     * 同一大类内的调整（如 VARCHAR 加长、DATE→DATETIME）允许。
     */
    public static boolean isCrossTypeChange(String oldType, String newType) {
        return !categoryOf(oldType).equals(categoryOf(newType));
    }

    private static String categoryOf(String type) {
        if (type == null) return "UNKNOWN";
        return switch (type) {
            case "VARCHAR", "TEXT", "TINYINT", "JSON" -> "STRING";
            case "INT" -> "INT";
            case "DECIMAL" -> "DECIMAL";
            case "DATE", "DATETIME" -> "DATE";
            default -> "UNKNOWN";
        };
    }
}
