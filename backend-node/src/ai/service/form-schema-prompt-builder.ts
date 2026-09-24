/**
 * 表单生成 prompt 构建器（对齐 Java `FormSchemaPromptBuilder`）。
 *
 * system prompt 固定约束模型输出为 form-create rule JSON；
 * 用户描述仅作为 user message 传入，不拼接进 system prompt。
 */

export const FIELD_PATTERN_TEXT = '^[a-zA-Z][a-zA-Z0-9_]{0,63}$'

export const FORM_SCHEMA_SYSTEM_PROMPT = `You are a form schema generator for a low-code form designer.

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

Allowed component types (use ONLY these):
- input            single-line text
- inputTextarea    multi-line text
- inputNumber      number
- select           dropdown single choice (requires "options": [{"label":"..","value":".."}])
- radio            radio single choice (requires "options")
- checkbox         multiple choice (requires "options")
- date / datetime / time / dateRange   date and time pickers
- switch           boolean switch
- editor           rich text
- rate             rating
- divider          separator (no "field" required)
- groupContainer   layout group

Rules:
- "field" MUST match ${FIELD_PATTERN_TEXT} and MUST be snake_case English.
- "title" MUST be Chinese.
- Enum-like fields (gender, type, status, ...) MUST use select/radio/checkbox with "options".
- Numeric fields -> inputNumber; long text -> inputTextarea; dates -> date/dateRange.
- Output JSON only.

Example:
Description: 员工请假单：姓名、部门、请假类型、开始日期、结束日期、请假原因
Output:
{"rule":[{"type":"input","field":"applicant_name","title":"姓名","value":null,"validate":[{"required":true,"message":"请填写姓名"}]},{"type":"select","field":"leave_type","title":"请假类型","value":null,"options":[{"label":"事假","value":"事假"},{"label":"病假","value":"病假"},{"label":"年假","value":"年假"}],"validate":[{"required":true,"message":"请选择请假类型"}]},{"type":"date","field":"start_date","title":"开始日期","value":null},{"type":"date","field":"end_date","title":"结束日期","value":null},{"type":"inputTextarea","field":"reason","title":"请假原因","value":null}]}`

/**
 * 构建表单生成消息序列：system（固定约束）+ user（描述原文）。
 *
 * 注：z-ai-web-dev-sdk 的消息角色不含 'system'，skill 指引以
 * 'assistant' 角色承载系统提示（见 zai-llm.service.ts 的角色映射）。
 */
export function buildFormSchemaMessages(description: string): { role: 'assistant' | 'user'; content: string }[] {
  return [
    { role: 'assistant', content: FORM_SCHEMA_SYSTEM_PROMPT },
    { role: 'user', content: description },
  ]
}
