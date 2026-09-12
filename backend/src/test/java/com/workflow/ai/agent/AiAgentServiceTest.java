package com.workflow.ai.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.ai.config.AiProperties;
import com.workflow.ai.exception.AiException;
import com.workflow.ai.model.ChatMessage;
import com.workflow.ai.model.ChatModel;
import com.workflow.ai.model.ChatOptions;
import com.workflow.ai.model.ChatResult;
import com.workflow.ai.model.PageRef;
import com.workflow.ai.model.ToolCall;
import com.workflow.ai.support.AiUsageRecorder;
import com.workflow.ai.tool.AiTool;
import com.workflow.ai.tool.AiToolContext;
import com.workflow.ai.tool.AiToolRegistry;
import com.workflow.ai.tool.OpenPageTool;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * AiAgentService 测试（脚本化 FakeChatModel）。
 */
@ExtendWith(MockitoExtension.class)
class AiAgentServiceTest {

    @Mock
    private ObjectProvider<ChatModel> chatModelProvider;

    @Mock
    private AiUsageRecorder recorder;

    private AiProperties properties;

    @BeforeEach
    void setUp() {
        properties = new AiProperties();
        properties.setEnabled(true);
        properties.setApiKey("k");
        properties.setModel("m");
    }

    private AiAgentService service(AiToolRegistry registry) {
        return new AiAgentService(chatModelProvider, properties, registry, recorder, new ObjectMapper());
    }

    static class StubTool implements AiTool {
        @Override public String name() { return "stub"; }
        @Override public String description() { return "d"; }
        @Override public JsonNode parametersSchema() { return new ObjectMapper().createObjectNode(); }
        @Override public String execute(JsonNode arguments, AiToolContext context) { return "{\"value\":42}"; }
    }

    private ChatModel scripted(ChatResult... results) {
        return new ChatModel() {
            private int index = 0;
            @Override public String complete(List<ChatMessage> messages, ChatOptions options) { return results[0].content(); }
            @Override public ChatResult completeWithTools(List<ChatMessage> messages, ChatOptions options) {
                return results[Math.min(index++, results.length - 1)];
            }
            @Override public void completeStream(List<ChatMessage> m, ChatOptions o, Consumer<String> a, Consumer<String> b, Consumer<AiException> c) { }
        };
    }

    private static class Recorder implements AiAgentService.Events {
        final List<String> messages = new ArrayList<>();
        final List<String> calls = new ArrayList<>();
        final List<String> results = new ArrayList<>();
        final List<JsonNode> resultPayloads = new ArrayList<>();
        @Override public void toolCall(String name, JsonNode args) { calls.add(name); }
        @Override public void toolResult(String name, JsonNode result) { results.add(name); resultPayloads.add(result); }
        @Override public void message(String text) { messages.add(text); }
    }

    @Test
    void noToolCall_emitsMessage() {
        when(chatModelProvider.getIfAvailable()).thenReturn(scripted(new ChatResult("你好", List.of())));
        Recorder rec = new Recorder();

        service(new AiToolRegistry(List.of(new StubTool()))).chat(List.of(), "hi", List.of(), rec);

        assertThat(rec.messages).containsExactly("你好");
        verify(recorder).recordSuccess(eq("assistant"), eq("m"), anyLong(), anyLong(), anyLong());
    }

    @Test
    void toolCall_thenFinalMessage() {
        when(chatModelProvider.getIfAvailable()).thenReturn(scripted(
                new ChatResult("", List.of(new ToolCall("c1", "stub", "{}"))),
                new ChatResult("已完成", List.of())));
        Recorder rec = new Recorder();

        service(new AiToolRegistry(List.of(new StubTool()))).chat(List.of(), "生成", List.of(), rec);

        assertThat(rec.calls).containsExactly("stub");
        assertThat(rec.results).containsExactly("stub");
        assertThat(rec.messages).containsExactly("已完成");
    }

    @Test
    void openPageTool_returnsWhitelistedPage() {
        when(chatModelProvider.getIfAvailable()).thenReturn(scripted(
                new ChatResult("", List.of(new ToolCall("c1", "open_page", "{\"path\":\"/form\"}"))),
                new ChatResult("点这里去表单管理", List.of())));
        Recorder rec = new Recorder();
        AiToolRegistry registry = new AiToolRegistry(List.of(new OpenPageTool(new ObjectMapper())));

        service(registry).chat(List.of(), "去表单管理", List.of(new PageRef("/form", "表单管理")), rec);

        assertThat(rec.results).containsExactly("open_page");
        assertThat(rec.resultPayloads.get(0).path("path").asText()).isEqualTo("/form");
        assertThat(rec.messages).containsExactly("点这里去表单管理");
    }

    @Test
    void notConfigured_throws() {
        properties.setEnabled(false);
        Recorder rec = new Recorder();

        assertThatThrownBy(() -> service(new AiToolRegistry(List.of())).chat(List.of(), "x", List.of(), rec))
                .isInstanceOf(AiException.class)
                .extracting(e -> ((AiException) e).getCode())
                .isEqualTo(AiException.Code.CONFIG_MISSING);
    }
}
