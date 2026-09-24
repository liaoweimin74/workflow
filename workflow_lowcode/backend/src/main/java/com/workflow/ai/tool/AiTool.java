package com.workflow.ai.tool;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * AI 可调用工具。
 */
public interface AiTool {

    /** 工具名（function name）。 */
    String name();

    /** 工具用途描述（供模型判断何时调用）。 */
    String description();

    /** 参数 JSON Schema。 */
    JsonNode parametersSchema();

    /**
     * 执行工具。
     *
     * @param arguments 参数（可能为 null 或缺字段）
     * @param context   执行上下文（页面白名单等，可能为空）
     * @return 结果 JSON 文本
     */
    String execute(JsonNode arguments, AiToolContext context);
}
