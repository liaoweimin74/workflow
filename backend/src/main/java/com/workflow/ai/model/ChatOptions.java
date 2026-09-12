package com.workflow.ai.model;

/**
 * 调用选项。
 *
 * @param temperature    温度（可空，空则用配置默认）
 * @param maxTokens      最大输出 token（可空，空则用配置默认）
 * @param stream         是否流式
 * @param responseFormat 结构化输出格式（如 "json_object"；null 表示默认文本）
 */
public record ChatOptions(Double temperature, Integer maxTokens, boolean stream, String responseFormat) {

    /** 默认非流式文本选项。 */
    public static ChatOptions defaults() {
        return new ChatOptions(null, null, false, null);
    }

    /** 流式文本选项。 */
    public static ChatOptions streaming() {
        return new ChatOptions(null, null, true, null);
    }
}
