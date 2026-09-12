package com.workflow.ai.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.ai.config.AiProperties;
import com.workflow.ai.exception.AiException;
import com.workflow.ai.model.ChatMessage;
import com.workflow.ai.model.ChatModel;
import com.workflow.ai.model.ChatOptions;
import com.workflow.ai.model.ChatResult;
import com.workflow.ai.model.ToolCall;
import com.workflow.ai.support.AiUsageRecorder;
import com.workflow.ai.tool.AiToolRegistry;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * AI 助手编排：多轮对话 + 工具调用循环。
 */
@Service
public class AiAgentService {

    /** 单次请求最大工具调用步数。 */
    private static final int MAX_STEPS = 5;

    static final String MODULE = "assistant";

    private static final String SYSTEM_PROMPT = """
            你是「工作流管理平台」的智能助手，通过对话帮助用户完成平台内的任务。
            你的可用能力以“工具”形式提供：
            - generate_form_schema：当用户想要新建、生成或创建一个表单时调用，传入表单的自然语言描述。
            规则：
            - 用户要求生成表单时，必须调用 generate_form_schema 工具，不要凭空编造表单结构。
            - 工具执行后，用简洁的中文说明结果（大致有哪些字段），并告知结果已生成、可直接应用到当前表单设计器。
            - 与平台操作无关的问题，礼貌说明你只能协助平台内的操作。
            - 始终使用中文，回复简洁。
            """;

    private final ObjectProvider<ChatModel> chatModelProvider;
    private final AiProperties properties;
    private final AiToolRegistry toolRegistry;
    private final AiUsageRecorder recorder;
    private final ObjectMapper objectMapper;

    public AiAgentService(ObjectProvider<ChatModel> chatModelProvider,
                          AiProperties properties,
                          AiToolRegistry toolRegistry,
                          AiUsageRecorder recorder,
                          ObjectMapper objectMapper) {
        this.chatModelProvider = chatModelProvider;
        this.properties = properties;
        this.toolRegistry = toolRegistry;
        this.recorder = recorder;
        this.objectMapper = objectMapper;
    }

    /**
     * 执行一轮对话（含工具调用）。
     *
     * @param history     历史消息（不含本轮 user 消息）
     * @param userMessage 本轮用户输入
     * @param events      事件回调（工具调用/结果/最终回复）
     */
    public void chat(List<ChatMessage> history, String userMessage, Events events) {
        ChatModel model = requireModel();

        List<ChatMessage> messages = new ArrayList<>();
        messages.add(ChatMessage.system(SYSTEM_PROMPT));
        if (history != null) {
            messages.addAll(history);
        }
        messages.add(ChatMessage.user(userMessage));

        ChatOptions options = ChatOptions.withTools(toolRegistry.specs());
        long start = System.currentTimeMillis();

        for (int step = 0; step < MAX_STEPS; step++) {
            ChatResult result = model.completeWithTools(messages, options);
            if (!result.hasToolCalls()) {
                String text = result.content() == null || result.content().isBlank()
                        ? "（没有更多内容）" : result.content();
                events.message(text);
                recorder.recordSuccess(MODULE, properties.getModel(), 0, 0, System.currentTimeMillis() - start);
                return;
            }
            messages.add(ChatMessage.assistantToolCalls(result.toolCalls()));
            for (ToolCall toolCall : result.toolCalls()) {
                JsonNode args = parse(toolCall.arguments());
                events.toolCall(toolCall.name(), args);
                String toolResultJson = toolRegistry.execute(toolCall.name(), args);
                events.toolResult(toolCall.name(), parse(toolResultJson));
                messages.add(ChatMessage.tool(toolCall.id(), toolResultJson));
            }
        }

        events.message("抱歉，处理步骤过多，请把需求拆分为更小的请求后再试。");
        recorder.recordFailure(MODULE, properties.getModel(), "max steps exceeded",
                System.currentTimeMillis() - start);
    }

    private ChatModel requireModel() {
        if (!properties.isConfigured()) {
            throw new AiException(AiException.Code.CONFIG_MISSING, "AI 服务未配置");
        }
        ChatModel model = chatModelProvider.getIfAvailable();
        if (model == null) {
            throw new AiException(AiException.Code.CONFIG_MISSING, "AI 服务未配置");
        }
        return model;
    }

    private JsonNode parse(String text) {
        if (text == null || text.isBlank()) {
            return objectMapper.createObjectNode();
        }
        try {
            return objectMapper.readTree(text);
        } catch (Exception e) {
            return objectMapper.getNodeFactory().textNode(text);
        }
    }

    /** 事件回调。 */
    public interface Events {

        void toolCall(String name, JsonNode args);

        void toolResult(String name, JsonNode result);

        void message(String text);
    }
}
