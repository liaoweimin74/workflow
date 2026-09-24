package com.workflow.ai.formgen;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.workflow.ai.tool.AiTool;
import com.workflow.engine.form.FormDefinitionService;
import com.workflow.engine.form.column.FormSchemaColumnExtractor;
import com.workflow.engine.form.entity.FormDefinition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 工具：根据自然语言描述<b>真实创建</b>表单（落库为草稿）。
 *
 * <p>与 {@link GenerateFormSchemaTool} 的区别：后者只生成结构 JSON（不落库，供
 * 设计器内预览/回填）；本工具走完整创建链 —— formgen 生成 schema → 写入
 * {@code wf_form_def}（DRAFT，含 BUSINESS 类型的 column_config）→ 返回表单
 * id/key 与设计器入口。发布仍需用户在设计器中确认后手动触发（DDL 在 publish）。
 */
@Component
public class CreateFormTool implements AiTool {

    public static final String NAME = "create_form";

    private static final Logger log = LoggerFactory.getLogger(CreateFormTool.class);

    private final AiFormGenerationService service;
    private final FormDefinitionService formDefinitionService;
    private final FormSchemaColumnExtractor columnExtractor;
    private final ObjectMapper objectMapper;

    public CreateFormTool(AiFormGenerationService service,
                          FormDefinitionService formDefinitionService,
                          FormSchemaColumnExtractor columnExtractor,
                          ObjectMapper objectMapper) {
        this.service = service;
        this.formDefinitionService = formDefinitionService;
        this.columnExtractor = columnExtractor;
        this.objectMapper = objectMapper;
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public String description() {
        return "真实创建一个表单（保存为草稿，可在设计器中调整并发布）。"
                + "当用户想要新建、创建一个表单时调用。参数：name=表单名称；"
                + "description=字段需求描述；formType=表单类型（BUSINESS=业务表单，纯数据填报、不关联审批流程；"
                + "WORKFLOW=工作流表单，用于挂接审批流程）。";
    }

    @Override
    public JsonNode parametersSchema() {
        ObjectNode schema = objectMapper.createObjectNode();
        schema.put("type", "object");
        ObjectNode properties = schema.putObject("properties");

        ObjectNode name = properties.putObject("name");
        name.put("type", "string");
        name.put("description", "表单名称，例如：员工请假单");

        ObjectNode description = properties.putObject("description");
        description.put("type", "string");
        description.put("description", "表单的自然语言描述，例如：包含姓名、部门、请假类型、起止日期、请假原因");

        ObjectNode formType = properties.putObject("formType");
        formType.put("type", "string");
        formType.put("description",
                "表单类型：BUSINESS=业务表单（纯数据填报，不关联审批流程）；WORKFLOW=工作流表单（可配置审批流程）。"
                        + "用户说“业务表单”时必须用 BUSINESS。");

        ArrayNode required = schema.putArray("required");
        required.add("name");
        required.add("description");
        required.add("formType");
        return schema;
    }

    @Override
    public String execute(JsonNode arguments, com.workflow.ai.tool.AiToolContext context) {
        String name = text(arguments, "name");
        String description = text(arguments, "description");
        String formType = normalizeFormType(arguments == null ? null : arguments.path("formType").asText(null));
        if (name.isBlank()) {
            return error("缺少 name 参数（表单名称）");
        }
        if (description.isBlank()) {
            return error("缺少 description 参数（字段需求描述）");
        }

        try {
            // 1. formgen 管线生成 schema（prompt 工程 + 类型白名单 + 字段归一化）
            AiFormGenerateResult generated = service.generateSync(description);

            // 2. 生成唯一 key（FORM_KEY_PATTERN：^[a-zA-Z][a-zA-Z0-9_]{0,63}$）
            String key = "ai_" + Long.toString(System.currentTimeMillis(), 36)
                    + (int) (Math.random() * 90 + 10);

            // 3. 落库：DRAFT 草稿
            FormDefinition created = formDefinitionService.create(name, key, formType, null);

            // 4. 回填 schema；BUSINESS 额外生成 column_config（发布建表依赖它；
            //    WORKFLOW 表单列在设计器保存/发布时从 schema 提取，保持 null）
            String columnConfig = "BUSINESS".equals(formType)
                    ? objectMapper.writeValueAsString(columnExtractor.extractFromSchema(generated.schema()))
                    : null;
            formDefinitionService.update(created.getId(), null, null, generated.schema(), columnConfig);

            log.info("[create_form] 已创建表单草稿: name={} key={} type={} fields={}",
                    name, key, formType, generated.fields().size());

            return success(created.getId(), key, name, formType, generated);
        } catch (Exception e) {
            log.warn("[create_form] 创建表单失败: {}", e.getMessage(), e);
            return error("创建表单失败: " + e.getMessage());
        }
    }

    private String success(String formId, String key, String name, String formType, AiFormGenerateResult generated) {
        ObjectNode out = objectMapper.createObjectNode();
        out.put("ok", true);
        out.put("formId", formId);
        out.put("formKey", key);
        out.put("name", name);
        out.put("type", formType);
        out.put("status", "DRAFT");
        out.put("fieldCount", generated.fields().size());
        ArrayNode fields = out.putArray("fields");
        for (AiFormGenerateResult.FieldInfo f : generated.fields()) {
            ObjectNode item = fields.addObject();
            item.put("label", f.title());
            item.put("key", f.field());
            item.put("type", f.componentType());
        }
        ArrayNode warnings = out.putArray("warnings");
        for (String w : generated.warnings()) {
            warnings.add(w);
        }
        out.put("designerUrl", "/form/designer?id=" + formId);
        out.put("hint", "BUSINESS".equals(formType)
                ? "业务表单已创建为草稿（未发布），不关联审批流程；用户可在设计器中调整并发布，发布后可在业务表单数据页面录入数据。"
                : "工作流表单已创建为草稿（未发布），可在设计器中调整并发布，发布后可为其配置审批流程。");
        return out.toString();
    }

    private String error(String message) {
        ObjectNode out = objectMapper.createObjectNode();
        out.put("error", message);
        return out.toString();
    }

    /** 表单类型归一化：兼容中文/英文表述；缺省 BUSINESS（平台主场景）。 */
    private static String normalizeFormType(String raw) {
        String v = raw == null ? "" : raw.trim().toUpperCase();
        if (v.contains("WORKFLOW") || v.contains("工作流") || v.contains("流程") || v.contains("审批")) {
            return "WORKFLOW";
        }
        return "BUSINESS";
    }

    private static String text(JsonNode node, String field) {
        if (node == null) {
            return "";
        }
        return node.path(field).asText("").trim();
    }
}
