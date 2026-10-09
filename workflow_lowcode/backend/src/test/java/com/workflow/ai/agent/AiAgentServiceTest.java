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
        final List<PageRef> navigations = new ArrayList<>();

        @Override public void toolCall(String name, JsonNode args) { calls.add(name); }
        @Override public void toolResult(String name, JsonNode result) { results.add(name); resultPayloads.add(result); }
        @Override public void message(String text, List<PageRef> navs) {
            messages.add(text);
            navigations.clear();
            navigations.addAll(navs);
        }
    }

    @Test
    void noToolCall_emitsMessage() {
        when(chatModelProvider.getIfAvailable()).thenReturn(scripted(new ChatResult("你好", List.of())));
        Recorder rec = new Recorder();

        service(new AiToolRegistry(List.of(new StubTool()))).chat(List.of(), "hi", List.of(), rec);

        assertThat(rec.messages).containsExactly("你好");
        assertThat(rec.navigations).isEmpty();
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
    void openPageTool_providesNavigation() {
        when(chatModelProvider.getIfAvailable()).thenReturn(scripted(
                new ChatResult("", List.of(new ToolCall("c1", "open_page", "{\"path\":\"/form\"}"))),
                new ChatResult("可点击下方入口前往表单管理", List.of())));
        Recorder rec = new Recorder();
        AiToolRegistry registry = new AiToolRegistry(List.of(new OpenPageTool(new ObjectMapper())));

        service(registry).chat(List.of(), "表单管理在哪", List.of(new PageRef("/form", "表单管理")), rec);

        assertThat(rec.resultPayloads.get(0).path("path").asText()).isEqualTo("/form");
        assertThat(rec.navigations).extracting(PageRef::path).containsExactly("/form");
    }

    @Test
    void fallback_matchesPageLabelInTextWhenNoToolCall() {
        when(chatModelProvider.getIfAvailable()).thenReturn(scripted(
                new ChatResult("添加用户请到 用户管理 页面操作", List.of())));
        Recorder rec = new Recorder();
        List<PageRef> pages = List.of(
                new PageRef("/system/user", "用户管理"),
                new PageRef("/system/role", "角色管理"));

        service(new AiToolRegistry(List.of())).chat(List.of(), "怎么添加用户", pages, rec);

        assertThat(rec.navigations).extracting(PageRef::path).containsExactly("/system/user");
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
