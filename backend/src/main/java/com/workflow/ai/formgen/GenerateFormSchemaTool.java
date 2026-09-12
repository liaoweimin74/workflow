package com.workflow.ai.formgen;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.workflow.ai.tool.AiTool;
import org.springframework.stereotype.Component;

/**
 * 工具：根据自然语言描述生成低代码表单 schema。
 *
 * <p>底层复用 {@link AiFormGenerationService}（prompt 工程 + 校验清洗）。
 */
@Component
public class GenerateFormSchemaTool implements AiTool {

    public static final String NAME = "generate_form_schema";

    private final AiFormGenerationService service;
    private final ObjectMapper objectMapper;

    public GenerateFormSchemaTool(AiFormGenerationService service, ObjectMapper objectMapper) {
        this.service = service;
        this.objectMapper = objectMapper;
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public String description() {
        return "根据自然语言描述生成低代码表单结构（form-create rule JSON）。"
                + "当用户想要新建、生成或创建一个表单时调用；参数 description 为该表单的中文需求描述。";
    }

    @Override
    public JsonNode parametersSchema() {
        ObjectNode schema = objectMapper.createObjectNode();
        schema.put("type", "object");
        ObjectNode properties = schema.putObject("properties");
        ObjectNode description = properties.putObject("description");
        description.put("type", "string");
        description.put("description", "表单的自然语言描述，例如：员工请假单，包含姓名、部门、请假类型、起止日期、请假原因");
        ArrayNode required = schema.putArray("required");
        required.add("description");
        return schema;
    }

    @Override
    public String execute(JsonNode arguments) {
        String description = arguments == null ? "" : arguments.path("description").asText("");
        AiFormGenerateResult result = service.generateSync(description);
        try {
            return objectMapper.writeValueAsString(result);
        } catch (Exception e) {
            return "{\"error\":\"生成结果序列化失败\"}";
        }
    }
}
