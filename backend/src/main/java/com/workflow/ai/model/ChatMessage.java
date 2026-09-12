package com.workflow.ai.model;

import java.util.List;

/**
 * 对话消息。
 *
 * @param role       角色（system/user/assistant/tool）
 * @param content    文本内容
 * @param toolCalls  assistant 消息携带的工具调用
 * @param toolCallId tool 消息对应的调用 ID
 */
public record ChatMessage(Role role, String content, List<ToolCall> toolCalls, String toolCallId) {

    /** 消息角色。 */
    public enum Role {
        system, user, assistant, tool
    }

    public static ChatMessage system(String content) {
        return new ChatMessage(Role.system, content, null, null);
    }

    public static ChatMessage user(String content) {
        return new ChatMessage(Role.user, content, null, null);
    }

    public static ChatMessage assistant(String content) {
        return new ChatMessage(Role.assistant, content, null, null);
    }

    /** assistant 携带工具调用。 */
    public static ChatMessage assistantToolCalls(List<ToolCall> toolCalls) {
        return new ChatMessage(Role.assistant, null, toolCalls, null);
    }

    /** 工具执行结果回填。 */
    public static ChatMessage tool(String toolCallId, String content) {
        return new ChatMessage(Role.tool, content, null, toolCallId);
    }
}
