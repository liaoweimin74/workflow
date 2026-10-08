package com.workflow.ai.chat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * AI 助手对话 Controller。
 *
 * <p>{@code POST /api/v1/ai/chat} 返回 {@code text/event-stream} 文本，事件序列：
 * meta → (tool_call → tool_result)* → message → done（或 error）。
 *
 * <p>采用同步响应体而非 {@code SseEmitter}：当前 agent 为非流式产出（事件在结束时一次性产生），
 * 同步返回可避免 Servlet 异步在容器上的响应终止缺陷（chunked 未正确收尾导致客户端读取失败）。
 */
@RestController
@RequestMapping("/api/v1/ai")
public class AiChatController {

    private static final Logger log = LoggerFactory.getLogger(AiChatController.class);

    private final AiAgentService agentService;
    private final AiProperties properties;
    private final ObjectMapper objectMapper;

    public AiChatController(AiAgentService agentService, AiProperties properties, ObjectMapper objectMapper) {
        this.agentService = agentService;
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    /**
     * 对话（SSE 文本）。
     */
    @PostMapping(value = "/chat", produces = "text/event-stream;charset=UTF-8")
    public String chat(@RequestBody(required = false) ChatRequest request) {
        if (request == null || request.message() == null || request.message().isBlank()) {
            throw new IllegalArgumentException("消息不能为空");
        }

        String message = request.message();
        List<ChatMessage> history = toHistory(request.history());
        List<PageRef> pages = request.context() == null || request.context().menus() == null
                ? List.of() : request.context().menus();

        if (!properties.isConfigured()) {
            return sse("error", Map.of("code", AiException.Code.CONFIG_MISSING.name(), "msg", "AI 服务未配置"));
        }

        StringBuilder body = new StringBuilder();
        body.append(sse("meta", Map.of("model", properties.getModel())));
        try {
            agentService.chat(history, message, pages, new AiAgentService.Events() {
                @Override
                public void toolCall(String name, JsonNode args) {
                    body.append(sse("tool_call", Map.of("name", name, "args", args)));
                }

                @Override
                public void toolResult(String name, JsonNode result) {
                    body.append(sse("tool_result", Map.of("name", name, "result", result)));
                }

                @Override
                public void message(String text, List<PageRef> navigations) {
                    body.append(sse("message", Map.of(
                            "text", text,
                            "navigations", navigations == null ? List.of() : navigations)));
                }
            });
            body.append(sse("done", Map.of()));
        } catch (AiException e) {
            body.append(sse("error", Map.of("code", e.getCode().name(), "msg", safe(e.getMessage()))));
        } catch (Exception e) {
            log.warn("AI 助手对话失败", e);
            body.append(sse("error", Map.of("code", AiException.Code.STREAM_ERROR.name(), "msg", safe(e.getMessage()))));
        }
        return body.toString();
    }

    /** 构造一条 SSE 事件帧。 */
    private String sse(String event, Object data) {
        String json;
        try {
            json = objectMapper.writeValueAsString(data);
        } catch (Exception e) {
            json = "{}";
        }
        return "event:" + event + "\n" + "data:" + json + "\n\n";
    }

    private static String safe(String s) {
        return s == null ? "" : s;
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
