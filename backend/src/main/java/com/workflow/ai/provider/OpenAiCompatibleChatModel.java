package com.workflow.ai.provider;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.ai.config.AiProperties;
import com.workflow.ai.exception.AiException;
import com.workflow.ai.model.ChatMessage;
import com.workflow.ai.model.ChatModel;
import com.workflow.ai.model.ChatOptions;
import com.workflow.ai.model.ChatResult;
import com.workflow.ai.model.ToolCall;
import com.workflow.ai.model.ToolSpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/**
 * 基于 OpenAI 兼容协议（{@code /chat/completions}）的对话模型实现。
 *
 * <p>通过 {@link AiProperties#getBaseUrl()} 切换任意兼容端点
 * （DeepSeek、通义千问、Qwen、Ollama 等）。支持工具调用（function calling）。
 */
public class OpenAiCompatibleChatModel implements ChatModel {

    private static final Logger log = LoggerFactory.getLogger(OpenAiCompatibleChatModel.class);

    private static final String CHAT_PATH = "/chat/completions";
    private static final long RETRY_BACKOFF_MS = 500L;

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final AiProperties properties;

    public OpenAiCompatibleChatModel(RestClient restClient, ObjectMapper objectMapper, AiProperties properties) {
        this.restClient = restClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    @Override
    public String complete(List<ChatMessage> messages, ChatOptions options) {
        JsonNode root = postChat(buildBody(messages, options, false));
        JsonNode choices = requireChoices(root);
        JsonNode content = choices.path(0).path("message").path("content");
        return content.isMissingNode() || content.isNull() ? "" : content.asText("");
    }

    @Override
    public ChatResult completeWithTools(List<ChatMessage> messages, ChatOptions options) {
        JsonNode root = postChat(buildBody(messages, options, false));
        JsonNode choices = requireChoices(root);
        JsonNode message = choices.path(0).path("message");

        JsonNode contentNode = message.path("content");
        String content = contentNode.isMissingNode() || contentNode.isNull() ? "" : contentNode.asText("");

        List<ToolCall> toolCalls = new ArrayList<>();
        JsonNode tcs = message.path("tool_calls");
        if (tcs.isArray()) {
            for (JsonNode tc : tcs) {
                toolCalls.add(new ToolCall(
                        tc.path("id").asText(""),
                        tc.path("function").path("name").asText(""),
                        tc.path("function").path("arguments").asText("{}")));
            }
        }
        return new ChatResult(content, toolCalls);
    }

    @Override
    public void completeStream(List<ChatMessage> messages, ChatOptions options,
                               Consumer<String> onDelta, Consumer<String> onDone, Consumer<AiException> onError) {
        Map<String, Object> body = buildBody(messages, options, true);
        try {
            restClient.post()
                    .uri(CHAT_PATH)
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.TEXT_EVENT_STREAM)
                    .body(body)
                    .exchange((request, response) -> {
                        if (response.getStatusCode().isError()) {
                            throw new AiException(AiException.Code.HTTP_ERROR,
                                    "AI 服务返回错误: HTTP " + response.getStatusCode().value(),
                                    response.getStatusCode().value());
                        }
                        try (BufferedReader reader = new BufferedReader(
                                new InputStreamReader(response.getBody(), StandardCharsets.UTF_8))) {
                            String line;
                            while ((line = reader.readLine()) != null) {
                                if (!line.startsWith("data:")) {
                                    continue;
                                }
                                String data = line.substring("data:".length()).trim();
                                if (data.isEmpty()) {
                                    continue;
                                }
                                if ("[DONE]".equals(data)) {
                                    onDone.accept(null);
                                    return null;
                                }
                                consumeDelta(data, onDelta);
                            }
                        }
                        onDone.accept(null);
                        return null;
                    });
        } catch (AiException e) {
            onError.accept(e);
        } catch (Exception e) {
            if (e.getCause() instanceof SocketTimeoutException || e instanceof SocketTimeoutException) {
                onError.accept(new AiException(AiException.Code.TIMEOUT, "AI 流式调用超时", e));
            } else {
                onError.accept(new AiException(AiException.Code.STREAM_ERROR,
                        "AI 流式调用失败: " + e.getMessage(), e));
            }
        }
    }

    /** 发送非流式请求（含 429/5xx 重试一次）。 */
    private JsonNode postChat(Map<String, Object> body) {
        int attempts = 0;
        while (true) {
            try {
                String raw = restClient.post()
                        .uri(CHAT_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(body)
                        .retrieve()
                        .body(String.class);
                return parseJson(raw);
            } catch (RestClientResponseException e) {
                int status = e.getStatusCode().value();
                boolean retryable = status == 429 || status >= 500;
                if (retryable && attempts == 0) {
                    attempts++;
                    sleepQuietly(RETRY_BACKOFF_MS);
                    continue;
                }
                throw new AiException(AiException.Code.HTTP_ERROR,
                        "AI 服务返回错误: HTTP " + status, status);
            } catch (ResourceAccessException e) {
                if (e.getCause() instanceof SocketTimeoutException) {
                    throw new AiException(AiException.Code.TIMEOUT, "AI 服务调用超时", e);
                }
                throw new AiException(AiException.Code.CONNECT_FAILED,
                        "AI 服务连接失败: " + e.getMessage(), e);
            }
        }
    }

    private JsonNode requireChoices(JsonNode root) {
        JsonNode choices = root == null ? null : root.path("choices");
        if (choices == null || !choices.isArray() || choices.isEmpty()) {
            throw new AiException(AiException.Code.EMPTY_RESPONSE, "AI 服务返回空响应");
        }
        return choices;
    }

    /** 解析非流式响应 JSON；解析失败抛 {@link AiException}。 */
    private JsonNode parseJson(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readTree(raw);
        } catch (Exception e) {
            throw new AiException(AiException.Code.EMPTY_RESPONSE, "AI 服务返回内容无法解析", e);
        }
    }

    /** 解析单个 SSE data 负载，提取 delta 文本；异常行跳过。 */
    private void consumeDelta(String data, Consumer<String> onDelta) {
        try {
            JsonNode node = objectMapper.readTree(data);
            JsonNode delta = node.path("choices").path(0).path("delta").path("content");
            if (delta.isTextual() && !delta.asText().isEmpty()) {
                onDelta.accept(delta.asText());
            }
        } catch (Exception ignore) {
            log.debug("跳过无法解析的 SSE 数据行: {}", data);
        }
    }

    private Map<String, Object> buildBody(List<ChatMessage> messages, ChatOptions options, boolean stream) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", properties.getModel());
        body.put("messages", buildMessages(messages));

        double temperature = options != null && options.temperature() != null
                ? options.temperature() : properties.getTemperature();
        body.put("temperature", temperature);

        int maxTokens = options != null && options.maxTokens() != null
                ? options.maxTokens() : properties.getMaxTokens();
        body.put("max_tokens", maxTokens);

        if (options != null && options.responseFormat() != null && !options.responseFormat().isBlank()) {
            body.put("response_format", Map.of("type", options.responseFormat()));
        }
        if (options != null && options.tools() != null && !options.tools().isEmpty()) {
            body.put("tools", buildTools(options.tools()));
        }
        body.put("stream", stream);
        return body;
    }

    private List<Map<String, Object>> buildMessages(List<ChatMessage> messages) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (messages == null) {
            return out;
        }
        for (ChatMessage m : messages) {
            Map<String, Object> mm = new LinkedHashMap<>();
            mm.put("role", m.role().name());
            if (m.role() == ChatMessage.Role.tool) {
                mm.put("tool_call_id", m.toolCallId());
                mm.put("content", m.content() == null ? "" : m.content());
            } else if (m.role() == ChatMessage.Role.assistant && m.toolCalls() != null && !m.toolCalls().isEmpty()) {
                if (m.content() != null) {
                    mm.put("content", m.content());
                }
                List<Map<String, Object>> tcs = new ArrayList<>();
                for (ToolCall tc : m.toolCalls()) {
                    Map<String, Object> fn = new LinkedHashMap<>();
                    fn.put("name", tc.name());
                    fn.put("arguments", tc.arguments() == null ? "{}" : tc.arguments());
                    Map<String, Object> t = new LinkedHashMap<>();
                    t.put("id", tc.id());
                    t.put("type", "function");
                    t.put("function", fn);
                    tcs.add(t);
                }
                mm.put("tool_calls", tcs);
            } else {
                mm.put("content", m.content() == null ? "" : m.content());
            }
            out.add(mm);
        }
        return out;
    }

    private List<Map<String, Object>> buildTools(List<ToolSpec> specs) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (ToolSpec spec : specs) {
            Map<String, Object> fn = new LinkedHashMap<>();
            fn.put("name", spec.name());
            fn.put("description", spec.description());
            fn.put("parameters", spec.parameters() == null
                    ? Map.of("type", "object", "properties", Map.of())
                    : objectMapper.convertValue(spec.parameters(), Map.class));
            Map<String, Object> t = new LinkedHashMap<>();
            t.put("type", "function");
            t.put("function", fn);
            out.add(t);
        }
        return out;
    }

    private static void sleepQuietly(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
