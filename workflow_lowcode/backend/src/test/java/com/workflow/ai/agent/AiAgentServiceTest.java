package com.workflow.ai.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.ai.aiconfig.AiConfigService;
import com.workflow.ai.aiconfig.EffectiveLlmConfig;
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
import java.util.Map;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
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

    @Mock
    private AiConfigService configService;

    @BeforeEach
    void setUp() {
        // 用量记录取「生效配置」的模型名（DB 优先），不再读静态 properties
        lenient().when(configService.resolve()).thenReturn(new EffectiveLlmConfig(
                true, "https://example.test/v1", "k", "m",
                0.7, 4096, 5000, 120000, Map.of(), "数据库配置"));
    }

    private AiAgentService service(AiToolRegistry registry) {
        return new AiAgentService(chatModelProvider, configService, registry, recorder,
                new AiAgentSessionStore(), new ObjectMapper());
    }

    static class StubTool implements AiTool {
        @Override public String name() { return "stub"; }
        @Override public String description() { return "d"; }
        @Override public JsonNode parametersSchema() { return new ObjectMapper().createObjectNode(); }
        @Override public String execute(JsonNode arguments, AiToolContext context) { return "{\"value\":42}"; }
    }

    /** 客户端执行工具（agent 循环应暂停下发，不调服务端 execute）。 */
    static class ClientTool implements AiTool {
        @Override public String name() { return "client_stub"; }
        @Override public String description() { return "d"; }
        @Override public JsonNode parametersSchema() { return new ObjectMapper().createObjectNode(); }
        @Override public String execute(JsonNode arguments, AiToolContext context) {
            throw new IllegalStateException("客户端执行工具不应在服务端执行");
        }
        @Override public boolean clientExecuted() { return true; }
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
        final List<String> clientToolNames = new ArrayList<>();
        final List<String> clientSessionIds = new ArrayList<>();
        final List<String> clientCallIds = new ArrayList<>();

        @Override public void toolCall(String name, JsonNode args) { calls.add(name); }
        @Override public void toolResult(String name, JsonNode result) { results.add(name); resultPayloads.add(result); }
        @Override public void message(String text, List<PageRef> navs) {
            messages.add(text);
            navigations.clear();
            navigations.addAll(navs);
        }
        @Override public void clientTool(String sessionId, String callId, String name, JsonNode args) {
            clientToolNames.add(name);
            clientSessionIds.add(sessionId);
            clientCallIds.add(callId);
        }
    }

    @Test
    void noToolCall_emitsMessage() {
        when(chatModelProvider.getIfAvailable()).thenReturn(scripted(new ChatResult("你好", List.of())));
        Recorder rec = new Recorder();

        service(new AiToolRegistry(List.of(new StubTool()))).chat(List.of(), "hi", List.of(), null, rec);

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

        service(new AiToolRegistry(List.of(new StubTool()))).chat(List.of(), "生成", List.of(), null, rec);

        assertThat(rec.calls).containsExactly("stub");
        assertThat(rec.results).containsExactly("stub");
        assertThat(rec.messages).containsExactly("已完成");
    }

    @Test
    void clientTool_pausesWithoutMessage_thenResumeFinishes() {
        when(chatModelProvider.getIfAvailable()).thenReturn(scripted(
                new ChatResult("", List.of(new ToolCall("c1", "client_stub", "{\"action\":\"refresh\"}"))),
                new ChatResult("页面已刷新", List.of())));
        Recorder rec = new Recorder();
        AiAgentService svc = service(new AiToolRegistry(List.of(new ClientTool())));

        // 第一段：下发 client_tool 后暂停（无最终回复）
        svc.chat(List.of(), "刷新页面", List.of(), null, rec);
        assertThat(rec.clientToolNames).containsExactly("client_stub");
        assertThat(rec.clientSessionIds.get(0)).isNotBlank();
        assertThat(rec.messages).isEmpty();

        // 续跑：回传执行结果 → 模型产出最终回复
        svc.resume(rec.clientSessionIds.get(0), rec.clientCallIds.get(0), "{\"ok\":true}", rec);
        assertThat(rec.messages).containsExactly("页面已刷新");
    }

    @Test
    void openPageTool_providesNavigation() {
        when(chatModelProvider.getIfAvailable()).thenReturn(scripted(
                new ChatResult("", List.of(new ToolCall("c1", "open_page", "{\"path\":\"/form\"}"))),
                new ChatResult("可点击下方入口前往表单管理", List.of())));
        Recorder rec = new Recorder();
        AiToolRegistry registry = new AiToolRegistry(List.of(new OpenPageTool(new ObjectMapper())));

        service(registry).chat(List.of(), "表单管理在哪", List.of(new PageRef("/form", "表单管理")), null, rec);

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

        service(new AiToolRegistry(List.of())).chat(List.of(), "怎么添加用户", pages, null, rec);

        assertThat(rec.navigations).extracting(PageRef::path).containsExactly("/system/user");
    }

    @Test
    void missingChatModelBean_throws() {
        when(chatModelProvider.getIfAvailable()).thenReturn(null);
        Recorder rec = new Recorder();

        assertThatThrownBy(() -> service(new AiToolRegistry(List.of())).chat(List.of(), "x", List.of(), null, rec))
                .isInstanceOf(AiException.class)
                .extracting(e -> ((AiException) e).getCode())
                .isEqualTo(AiException.Code.CONFIG_MISSING);
    }
}
