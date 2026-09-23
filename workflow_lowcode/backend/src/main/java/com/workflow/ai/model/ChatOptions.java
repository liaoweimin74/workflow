package com.workflow.ai.model;

import java.util.List;

/**
 * 调用选项。
 *
 * @param temperature    温度（可空，空则用配置默认）
 * @param maxTokens      最大输出 token（可空，空则用配置默认）
 * @param stream         是否流式
 * @param responseFormat 结构化输出格式（如 "json_object"；null 表示默认文本）
 * @param tools          可用工具列表（null/空表示不使用工具调用）
 */
public record ChatOptions(Double temperature, Integer maxTokens, boolean stream, String responseFormat,
                          List<ToolSpec> tools) {

    /** 兼容四参数构造（无工具）。 */
    public ChatOptions(Double temperature, Integer maxTokens, boolean stream, String responseFormat) {
        this(temperature, maxTokens, stream, responseFormat, null);
    }

    /** 默认非流式文本选项。 */
    public static ChatOptions defaults() {
        return new ChatOptions(null, null, false, null, null);
    }

    /** 流式文本选项。 */
    public static ChatOptions streaming() {
        return new ChatOptions(null, null, true, null, null);
    }

    /** 带工具的非流式选项。 */
    public static ChatOptions withTools(List<ToolSpec> tools) {
        return new ChatOptions(null, null, false, null, tools);
    }
}
