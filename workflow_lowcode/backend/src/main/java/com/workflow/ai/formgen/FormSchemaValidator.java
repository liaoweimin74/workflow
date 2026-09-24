package com.workflow.ai.formgen;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.workflow.ai.exception.AiException;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 表单 schema 输出校验与清洗。
 *
 * <p>对模型输出做防御性校验：组件类型白名单、字段命名规范、重复去重、标题回填；
 * 所有修正项汇总到 warnings。
 */
@Component
public class FormSchemaValidator {

    private static final Pattern COL_PATTERN = Pattern.compile("^[a-zA-Z][a-zA-Z0-9_]{0,63}$");

    /**
     * AI 词汇表 = 设计器标准组件（与 FormSchemaPromptBuilder 一致）。
     *
     * <p>⚠️ 历史教训：旧词汇表用了不存在的设计器类型（date/inputTextarea/editor 等），
     * 生成物在设计器里渲染为「不支持」占位却能发布建表。现词汇表与前端
     * vendor/config/rule 的真实 type 逐一对齐，另设别名归一兼容旧输出。
     */
    private static final Set<String> ALLOWED_TYPES = Set.of(
            "input", "inputNumber", "select", "checkbox", "radio",
            "datePicker", "timePicker", "switch", "rate", "slider", "cascader",
            "fcEditor");

    private final ObjectMapper objectMapper;

    public FormSchemaValidator(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * 校验并清洗模型输出。
     *
     * @param rawJson 模型输出的原始文本
     * @return 清洗后的结果
     * @throws AiException 无法解析为表单结构时抛出
     */
    public AiFormGenerateResult validate(String rawJson) {
        JsonNode root = parseRoot(rawJson);
        JsonNode rules = root.isArray() ? root : root.path("rule");
        if (!rules.isArray() || rules.isEmpty()) {
            throw new AiException(AiException.Code.EMPTY_RESPONSE, "模型输出缺少 rule 数组");
        }

        ArrayNode cleaned = objectMapper.createArrayNode();
        List<AiFormGenerateResult.FieldInfo> fields = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        Set<String> usedFields = new HashSet<>();
        int idx = 0;

        for (JsonNode rule : rules) {
            if (!rule.isObject()) {
                warnings.add("已忽略非法条目（非对象）");
                continue;
            }
            ObjectNode item = (ObjectNode) rule;
            idx++;

            // 旧词汇表别名归一（date -> datePicker、inputTextarea -> input+textarea 等），
            // 归一后仍不在白名单（如 divider/groupContainer）则丢弃该条目
            NormalizedType normalized = normalizeComponentType(item);
            String type = normalized.type;
            if (!type.equals(normalized.original)) {
                warnings.add("组件类型 \"" + normalized.original + "\" 不被设计器支持，已修正为 \"" + type + "\"");
            }
            if (type.isEmpty() || !ALLOWED_TYPES.contains(type)) {
                warnings.add("组件类型 \"" + (normalized.original.isEmpty() ? "(空)" : normalized.original)
                        + "\" 不在白名单，已丢弃该条目");
                continue;
            }
            item.put("type", type);

            String rawField = item.path("field").asText("").trim();
            String field = normalizeField(rawField);
            if (field.isEmpty()) {
                field = "field_" + idx;
            }
            if (!field.equals(rawField)) {
                warnings.add("字段名 \"" + rawField + "\" 已修正为 \"" + field + "\"");
            }
            if (usedFields.contains(field)) {
                int n = 2;
                String candidate = field + "_" + n;
                while (usedFields.contains(candidate)) {
                    n++;
                    candidate = field + "_" + n;
                }
                warnings.add("字段名重复 \"" + field + "\"，已重命名为 \"" + candidate + "\"");
                field = candidate;
            }
            usedFields.add(field);
            item.put("field", field);

            String title = item.path("title").asText("").trim();
            if (title.isEmpty()) {
                title = field;
                warnings.add("字段 \"" + field + "\" 缺少标题，已回填为字段名");
            }
            item.put("title", title);

            if (!item.has("value")) {
                item.putNull("value");
            }

            fields.add(new AiFormGenerateResult.FieldInfo(field, title, type));
            cleaned.add(item);
        }

        ObjectNode out = objectMapper.createObjectNode();
        out.set("rule", cleaned);
        String schema;
        try {
            schema = objectMapper.writeValueAsString(out);
        } catch (Exception e) {
            throw new AiException(AiException.Code.EMPTY_RESPONSE, "生成结果序列化失败", e);
        }
        return new AiFormGenerateResult(schema, fields, warnings);
    }

    /** 归一结果：原始 type、归一后 type、需补进 props.type 的值（null 表示不用补）。 */
    private static final class NormalizedType {
        final String original;
        final String type;
        final String propsType;

        NormalizedType(String original, String type, String propsType) {
            this.original = original;
            this.type = type;
            this.propsType = propsType;
        }
    }

    /**
     * 旧词汇表别名 → 设计器标准 type（对齐 NestJS {@code normalizeComponentType}）。
     *
     * <p>归一时同步补 props.type（datetime/daterange/textarea）；divider/groupContainer
     * 等布局组件不在映射内 → 归一后不在白名单 → 由调用方丢弃。
     */
    private NormalizedType normalizeComponentType(ObjectNode item) {
        String original = item.path("type").asText("").trim();
        String type = original;
        String propsType = null;
        switch (original) {
            case "date" -> type = "datePicker";
            case "datetime" -> {
                type = "datePicker";
                propsType = "datetime";
            }
            case "dateRange" -> {
                type = "datePicker";
                propsType = "daterange";
            }
            case "time" -> type = "timePicker";
            case "inputTextarea" -> {
                type = "input";
                propsType = "textarea";
            }
            case "editor" -> type = "fcEditor";
            default -> {
            }
        }
        if (propsType != null) {
            JsonNode props = item.path("props");
            ObjectNode propsNode = (props.isObject()) ? (ObjectNode) props : objectMapper.createObjectNode();
            propsNode.put("type", propsType);
            item.set("props", propsNode);
        }
        return new NormalizedType(original, type, propsType);
    }

    /** 解析根节点：容忍 markdown 代码围栏与前后包裹文本。 */
    private JsonNode parseRoot(String rawJson) {
        String text = rawJson == null ? "" : rawJson.trim();
        text = text.replace("```json", "").replace("```", "").trim();
        if (text.isEmpty()) {
            throw new AiException(AiException.Code.EMPTY_RESPONSE, "模型输出为空");
        }
        try {
            return objectMapper.readTree(text);
        } catch (Exception ignore) {
            // 尝试截取首个 { 到末个 } 的片段
        }
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start >= 0 && end > start) {
            try {
                return objectMapper.readTree(text.substring(start, end + 1));
            } catch (Exception ignore) {
                // 落到下方统一报错
            }
        }
        throw new AiException(AiException.Code.EMPTY_RESPONSE, "模型输出无法解析为表单结构");
    }

    /** 归一化字段名为 snake_case 合法标识符。 */
    static String normalizeField(String raw) {
        if (raw == null) {
            return "";
        }
        String s = raw.trim();
        s = s.replaceAll("([a-z0-9])([A-Z])", "$1_$2");
        s = s.replaceAll("[^A-Za-z0-9_]", "_");
        s = s.toLowerCase();
        s = s.replaceAll("_+", "_");
        s = s.replaceAll("^_+|_+$", "");
        if (s.isEmpty()) {
            return "";
        }
        if (!Character.isLetter(s.charAt(0))) {
            s = "f_" + s;
        }
        if (s.length() > 64) {
            s = s.substring(0, 64);
        }
        return COL_PATTERN.matcher(s).matches() ? s : "";
    }
}
