package com.workflow.ai.model;

/**
 * 模型请求的工具调用。
 *
 * @param id        调用 ID（回填 tool 消息时使用）
 * @param name      工具名
 * @param arguments 参数 JSON 文本
 */
public record ToolCall(String id, String name, String arguments) {
}
