package com.workflow.ai.model;

import com.workflow.ai.exception.AiException;

import java.util.List;
import java.util.function.Consumer;

/**
 * 对话模型抽象。
 *
 * <p>对上层屏蔽具体供应商，支持非流式、流式与工具调用。
 */
public interface ChatModel {

    /**
     * 非流式调用，返回完整 assistant 文本。
     */
    String complete(List<ChatMessage> messages, ChatOptions options);

    /**
     * 非流式调用（含工具调用），返回文本或工具调用请求。
     */
    ChatResult completeWithTools(List<ChatMessage> messages, ChatOptions options);

    /**
     * 流式调用，逐块回调文本增量。
     */
    void completeStream(List<ChatMessage> messages, ChatOptions options,
                        Consumer<String> onDelta, Consumer<String> onDone, Consumer<AiException> onError);
}
