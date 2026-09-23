package com.workflow.ai.model;

import java.util.List;

/**
 * 一次模型调用的结果。
 *
 * @param content   文本内容（可能为空）
 * @param toolCalls 工具调用列表（可能为空）
 */
public record ChatResult(String content, List<ToolCall> toolCalls) {

    public boolean hasToolCalls() {
        return toolCalls != null && !toolCalls.isEmpty();
    }
}
