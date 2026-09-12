package com.workflow.ai.chat;

import com.fasterxml.jackson.databind.JsonNode;
import com.workflow.ai.agent.AiAgentService;
import com.workflow.ai.config.AiProperties;
import com.workflow.ai.exception.AiException;
import com.workflow.ai.model.ChatMessage;
import com.workflow.ai.model.PageRef;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * AI 助手对话 Controller。
 *
 * <p>{@code POST /api/v1/ai/chat} 以 SSE 返回事件：
 * meta → (tool_call → tool_result)* → message → done（或 error）。
 */
@RestController
@RequestMapping("/api/v1/ai")
public class AiChatController {

    private static final Logger log = LoggerFactory.getLogger(AiChatController.class);

    private static final long SSE_TIMEOUT_MS = 300_000L;

    private final AiAgentService agentService;
    private final AiProperties properties;

    public AiChatController(AiAgentService agentService, AiProperties properties) {
        this.agentService = agentService;
        this.properties = properties;
    }

    /**
     * 对话（流式事件）。
     */
    @PostMapping("/chat")
    public SseEmitter chat(@RequestBody(required = false) ChatRequest request) {
        if (request == null || request.message() == null || request.message().isBlank()) {
            throw new IllegalArgumentException("消息不能为空");
        }
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        emitter.onTimeout(emitter::complete);

        String message = request.message();
        List<ChatMessage> history = toHistory(request.history());
        List<PageRef> pages = request.context() == null || request.context().menus() == null
                ? List.of() : request.context().menus();

        CompletableFuture.runAsync(() -> {
            if (!properties.isConfigured()) {
                sendError(emitter, AiException.Code.CONFIG_MISSING.name(), "AI 服务未配置");
                return;
            }
            try {
                send(emitter, "meta", Map.of("model", properties.getModel()));
                agentService.chat(history, message, pages, new AiAgentService.Events() {
                    @Override
                    public void toolCall(String name, JsonNode args) {
                        send(emitter, "tool_call", Map.of("name", name, "args", args));
                    }

                    @Override
                    public void toolResult(String name, JsonNode result) {
                        send(emitter, "tool_result", Map.of("name", name, "result", result));
                    }

                    @Override
                    public void message(String text) {
                        send(emitter, "message", Map.of("text", text));
                    }
                });
                send(emitter, "done", Map.of());
                emitter.complete();
            } catch (AiException e) {
                sendError(emitter, e.getCode().name(), e.getMessage());
            } catch (Exception e) {
                log.warn("AI 助手对话失败", e);
                sendError(emitter, AiException.Code.STREAM_ERROR.name(), e.getMessage());
            }
        });

        return emitter;
    }

    private void send(SseEmitter emitter, String event, Object data) {
        try {
            emitter.send(SseEmitter.event().name(event).data(data));
        } catch (IOException e) {
            throw new IllegalStateException("SSE 发送失败", e);
        }
    }

    private void sendError(SseEmitter emitter, String code, String msg) {
        try {
            emitter.send(SseEmitter.event().name("error")
                    .data(Map.of("code", code, "msg", msg == null ? "" : msg)));
            emitter.complete();
        } catch (IOException e) {
            emitter.completeWithError(e);
        }
    }

    private List<ChatMessage> toHistory(List<ChatRequest.ChatTurn> turns) {
        List<ChatMessage> out = new ArrayList<>();
        if (turns == null) {
            return out;
        }
        for (ChatRequest.ChatTurn turn : turns) {
            if (turn == null || turn.content() == null) {
                continue;
            }
            if ("user".equals(turn.role())) {
                out.add(ChatMessage.user(turn.content()));
            } else if ("assistant".equals(turn.role())) {
                out.add(ChatMessage.assistant(turn.content()));
            }
        }
        return out;
    }

    /**
     * 对话请求。
     *
     * @param message 本轮用户输入
     * @param history 历史消息（user/assistant）
     * @param context 客户端上下文（路由/表单 id/可用菜单，供服务端感知）
     */
    public record ChatRequest(String message, List<ChatTurn> history, ChatContext context) {

        /** 历史消息项。 */
        public record ChatTurn(String role, String content) {
        }

        /**
         * 客户端上下文。
         *
         * @param route 当前路由标识
         * @param formId 当前表单 id（可空）
         * @param menus 用户可访问菜单页面（供 open_page 白名单）
         */
        public record ChatContext(String route, String formId, List<PageRef> menus) {
        }
    }
}
