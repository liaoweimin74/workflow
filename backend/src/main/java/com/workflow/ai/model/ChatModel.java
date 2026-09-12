package com.workflow.ai.model;

import com.workflow.ai.exception.AiException;

import java.util.List;
import java.util.function.Consumer;

/**
 * 对话模型抽象。
 *
 * <p>对上层屏蔽具体供应商，支持非流式与流式调用。
 */
public interface ChatModel {

    /**
     * 非流式调用，返回完整 assistant 文本。
     *
     * @param messages 消息序列
     * @param options  调用选项
     * @return assistant 文本内容
     * @throws AiException 调用失败时抛出
     */
    String complete(List<ChatMessage> messages, ChatOptions options);

    /**
     * 流式调用，逐块回调文本增量。
     *
     * @param messages 消息序列
     * @param options  调用选项
     * @param onDelta  文本增量回调
     * @param onDone   正常结束回调（参数恒为 null）
     * @param onError  错误回调（不回调 onDone）
     */
    void completeStream(List<ChatMessage> messages, ChatOptions options,
                        Consumer<String> onDelta, Consumer<String> onDone, Consumer<AiException> onError);
}
