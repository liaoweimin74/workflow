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
- "field" MUST match ${FIELD_PATTERN_TEXT} and MUST be snake_case English.
- "title" MUST be Chinese.
- Enum-like fields (gender, type, status, ...) MUST use select/radio/checkbox with "options".
- Numeric fields -> inputNumber; long text -> input with props {"type":"textarea"}; dates -> datePicker.
- Output JSON only.

Example:
Description: 员工请假单：姓名、请假类型、开始日期、结束日期、请假原因
Output:
{"rule":[{"type":"input","field":"applicant_name","title":"姓名","value":null,"validate":[{"required":true,"message":"请填写姓名"}]},{"type":"select","field":"leave_type","title":"请假类型","value":null,"options":[{"label":"事假","value":"事假"},{"label":"病假","value":"病假"},{"label":"年假","value":"年假"}],"validate":[{"required":true,"message":"请选择请假类型"}]},{"type":"datePicker","field":"start_date","title":"开始日期","value":null},{"type":"datePicker","field":"end_date","title":"结束日期","value":null},{"type":"input","field":"reason","title":"请假原因","value":null,"props":{"type":"textarea"}}]}`

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

/** 表单修改模式的 system prompt：基于现有 schema 做最小变更。 */
export const FORM_SCHEMA_REVISE_SYSTEM_PROMPT = `${FORM_SCHEMA_SYSTEM_PROMPT}

You are now in REVISE mode. The user gives you the CURRENT form schema (a {"rule":[...]} JSON)
and a change request. Output the COMPLETE NEW schema after applying the changes.

Revise rules (in addition to the base rules above):
- Apply ONLY the requested changes. Keep every field that is not mentioned EXACTLY as-is
  (same type, same field identifier, same title, same options, same validate) — do not
  regenerate, rename or reorder untouched fields.
- When the user asks to "add field X", append it at the end unless they specify a position.
- When the user asks to remove a field, delete it completely.
- When the user asks to change a field (rename title / switch type / make required / change
  options), modify that field in place and keep its "field" identifier unchanged unless the
  user explicitly asks to rename the identifier.
- The output must still be the complete {"rule":[...]} JSON with ALL fields (changed + unchanged).
- Output JSON only.`

/**
 * 构建表单修改消息序列：system（修改模式约束）+ user（现有 schema + 修改指令）。
 */
export function buildFormSchemaReviseMessages(
  currentSchema: string,
  changeRequest: string,
): { role: 'assistant' | 'user'; content: string }[] {
  const userContent = [
    '当前表单 schema：',
    currentSchema,
    '',
    '修改要求：',
    changeRequest,
  ].join('\n')
  return [
    { role: 'assistant', content: FORM_SCHEMA_REVISE_SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ]
}
