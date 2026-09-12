package com.workflow.ai.model;

/**
 * 对话消息。
 *
 * @param role    角色
 * @param content 文本内容
 */
public record ChatMessage(Role role, String content) {

    /** 消息角色。 */
    public enum Role {
        system, user, assistant
    }

    public static ChatMessage system(String content) {
        return new ChatMessage(Role.system, content);
    }

    public static ChatMessage user(String content) {
        return new ChatMessage(Role.user, content);
    }

    public static ChatMessage assistant(String content) {
        return new ChatMessage(Role.assistant, content);
    }
}
