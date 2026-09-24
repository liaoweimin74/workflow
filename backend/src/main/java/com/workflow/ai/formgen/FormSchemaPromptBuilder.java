package com.workflow.ai.formgen;

import com.workflow.ai.model.ChatMessage;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 表单生成 prompt 构建器。
 *
 * <p>system prompt 固定约束模型输出为 form-create rule JSON；
 * 用户描述仅作为 user message 传入，不拼接进 system prompt。
 */
@Component
public class FormSchemaPromptBuilder {

    static final String ALLOWED_TYPES_TEXT =
            "input, inputNumber, select, checkbox, radio, datePicker, timePicker, switch, rate, slider";

    static final String FIELD_PATTERN_TEXT = "^[a-zA-Z][a-zA-Z0-9_]{0,63}$";

    private static final String SYSTEM_PROMPT = """
            You are a form schema generator for a low-code form designer.

            Given a natural-language description (usually Chinese) of a business form, output STRICT JSON only —
            no markdown fences, no explanation, no extra text. The JSON must have exactly this shape:
            {"rule": [ <field>, <field>, ... ]}

            Each field object:
            {
              "type": "<component type>",
              "field": "<snake_case english identifier>",
              "title": "<Chinese label>",
              "value": null,
              "validate": [{"required": true, "message": "请填写<label>"}]
            }
            Include "validate" only for required fields. Include "options" for choice components.

            Allowed component types (use ONLY these, they must exist in the frontend designer):
            - input            single-line text; for multi-line text use input with "props": {"type": "textarea"}
            - inputNumber      number
            - select           dropdown single choice (requires "options": [{"label":"..","value":".."}])
            - radio            radio single choice (requires "options")
            - checkbox         multiple choice (requires "options")
            - datePicker       date (default); datetime -> "props": {"type": "datetime"}; date range -> "props": {"type": "daterange"}
            - timePicker       time
            - switch           boolean switch
            - rate             rating
            - slider           number slider

            Never invent component types. Do NOT use date, datetime, time, dateRange, inputTextarea, editor, divider or groupContainer — they do not exist in the designer.

            Rules:
            - "field" MUST match %s and MUST be snake_case English.
            - "title" MUST be Chinese.
            - Enum-like fields (gender, type, status, ...) MUST use select/radio/checkbox with "options".
            - Numeric fields -> inputNumber; long text -> input with props {"type":"textarea"}; dates -> datePicker.
            - Output JSON only.

            Example:
            Description: 员工请假单：姓名、请假类型、开始日期、结束日期、请假原因
            Output:
            {"rule":[{"type":"input","field":"applicant_name","title":"姓名","value":null,"validate":[{"required":true,"message":"请填写姓名"}]},{"type":"select","field":"leave_type","title":"请假类型","value":null,"options":[{"label":"事假","value":"事假"},{"label":"病假","value":"病假"},{"label":"年假","value":"年假"}],"validate":[{"required":true,"message":"请选择请假类型"}]},{"type":"datePicker","field":"start_date","title":"开始日期","value":null},{"type":"datePicker","field":"end_date","title":"结束日期","value":null},{"type":"input","field":"reason","title":"请假原因","value":null,"props":{"type":"textarea"}}]}
            """.formatted(FIELD_PATTERN_TEXT);

    /**
     * 构建固定 system prompt。
     */
    public String buildSystemPrompt() {
        return SYSTEM_PROMPT;
    }

    /**
     * 构建消息序列：system（固定）+ user（描述原文）。
     */
    public List<ChatMessage> buildMessages(String description) {
        return List.of(ChatMessage.system(SYSTEM_PROMPT), ChatMessage.user(description));
    }
}
