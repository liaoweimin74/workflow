package com.workflow.ai.chat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.ai.agent.AiAgentService;
import com.workflow.ai.aiconfig.AiConfigService;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * AI 助手对话 Controller。
 *
 * <p>{@code POST /api/v1/ai/chat} 返回 {@code text/event-stream} 文本，事件序列：
 * meta → (tool_call → tool_result)* → message → done（或 error）。
 * 遇前端执行工具（page_action/dom_action）时改为：meta → (tool_call → tool_result)* →
 * client_tool →（流结束，会话暂停），前端执行后调 {@code POST /api/v1/ai/chat/continue}
 * 续跑（同样的事件序列，可多次 client_tool）。
 *
 * <p>采用同步响应体而非 {@code SseEmitter}：当前 agent 为非流式产出（事件在结束时一次性产生），
 * 同步返回可避免 Servlet 异步在容器上的响应终止缺陷（chunked 未正确收尾导致客户端读取失败）。
 */
@RestController
@RequestMapping("/api/v1/ai")
public class AiChatController {

    private static final Logger log = LoggerFactory.getLogger(AiChatController.class);

    private final AiAgentService agentService;
    private final AiConfigService configService;
    private final ObjectMapper objectMapper;

    public AiChatController(AiAgentService agentService, AiConfigService configService,
                            ObjectMapper objectMapper) {
        this.agentService = agentService;
        this.configService = configService;
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
        // 请求体反序列化走 Jackson 3（Map/List 载体），服务端用 Jackson 2 节点 → 此处转换
        List<Map<String, Object>> comps = request.context() == null ? null : request.context().components();
        JsonNode components = comps == null ? null : objectMapper.valueToTree(comps);

        return runChat(writer -> agentService.chat(history, message, pages, components, writer),
                objectMapper);
    }

    /**
     * 客户端工具执行结果回传 + 续跑（SSE 文本，事件序列与 /chat 相同，可再次含 client_tool）。
     */
    @PostMapping(value = "/chat/continue", produces = "text/event-stream;charset=UTF-8")
    public String chatContinue(@RequestBody(required = false) ContinueRequest request) {
        if (request == null || isBlank(request.sessionId()) || isBlank(request.callId())) {
            throw new IllegalArgumentException("缺少 sessionId 或 callId");
        }
        final String resultJson = toJsonOrNull(request.result());
        return runChat(writer -> agentService.resume(request.sessionId(), request.callId(), resultJson, writer),
                objectMapper);
    }

    /** 结果 JSON 安全序列化（null/异常 → "{}"；Map 载体直接序列化）。 */
    private String toJsonOrNull(Object value) {
        if (value == null) {
            return "{}";
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            return "{}";
        }
    }

    /** 公共执行骨架：meta → agent 事件 → done/error（统一 SSE 组装与异常处理）。 */
    private String runChat(java.util.function.Consumer<AiAgentService.Events> runner, ObjectMapper mapper) {
        StringBuilder body = new StringBuilder();
        String model = configService.resolve().model();
        body.append(sse("meta", Map.of("model", model == null ? "" : model)));
        try {
            runner.accept(new AiAgentService.Events() {
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

                @Override
                public void clientTool(String sessionId, String callId, String name, JsonNode args) {
                    Map<String, Object> data = new HashMap<>();
                    data.put("sessionId", sessionId);
                    data.put("callId", callId);
                    data.put("name", name);
                    data.put("args", args);
                    body.append(sse("client_tool", data));
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

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
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
     * @param context 客户端上下文（路由/表单 id/可用菜单/可操作组件，供服务端感知）
     */
    public record ChatRequest(String message, List<ChatTurn> history, ChatContext context) {

        /** 历史消息项。 */
        public record ChatTurn(String role, String content) {
        }

        /**
         * 客户端上下文。
         *
         * @param route      当前路由标识
         * @param formId     当前表单 id（可空）
         * @param menus      用户可访问菜单页面（供 open_page 白名单）
         * @param components 当前页面可操作组件清单（aiPageBridge.describePage 上报，供 page_action；
         *                   请求体反序列化走 Jackson 3，动态结构用 Map/List 载体）
         */
        public record ChatContext(String route, String formId, List<PageRef> menus,
                                  List<Map<String, Object>> components) {
        }
    }

    /**
     * 续跑请求。
     *
     * @param sessionId 暂停时下发的会话 id
     * @param callId    已执行的工具调用 id
     * @param result    前端执行结果（任意 JSON：{ok, message, data?}；Map 载体）
     */
    public record ContinueRequest(String sessionId, String callId, Map<String, Object> result) {
    }
}
