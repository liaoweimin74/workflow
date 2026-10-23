package com.workflow.ai.chat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.ai.agent.AiAgentService;
import com.workflow.ai.aiconfig.AiConfigService;
import com.workflow.ai.aiconfig.EffectiveLlmConfig;
import com.workflow.ai.exception.AiException;
import com.workflow.framework.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * AiChatController 测试（同步 SSE 文本响应）。
 */
class AiChatControllerTest {

    private static final String URL = "/api/v1/ai/chat";

    private AiAgentService agentService;
    private AiConfigService configService;
    private MockMvc mvc;

    private static EffectiveLlmConfig effective(String model) {
        return new EffectiveLlmConfig(true, "https://example.test/v1", "test-key", model,
                0.7, 4096, 5000, 120000, Map.of(), "数据库配置");
    }

    @BeforeEach
    void setUp() {
        agentService = mock(AiAgentService.class);
        configService = mock(AiConfigService.class);
        // 可用性判定不在 Controller：它只按「生效配置」回填 meta，异常由 agent/模型侧抛出
        when(configService.resolve()).thenReturn(effective("db-model"));
        mvc = MockMvcBuilders.standaloneSetup(new AiChatController(agentService, configService, new ObjectMapper()))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    private String body(String message) {
        return "{\"message\":\"" + message + "\",\"history\":[],\"context\":{}}";
    }

    @Test
    void emptyMessage_returns400() throws Exception {
        mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(body("")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void success_returnsMetaMessageDone() throws Exception {
        doAnswer(inv -> {
            AiAgentService.Events events = inv.getArgument(4);
            events.message("已为你生成表单", List.of());
            return null;
        }).when(agentService).chat(any(), anyString(), any(), any(), any());

        mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(body("生成请假单")))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("event:meta")))
                .andExpect(content().string(containsString("event:message")))
                .andExpect(content().string(containsString("event:done")))
                .andExpect(content().string(containsString("已为你生成表单")));
    }

    /** meta 的模型名必须是生效配置里的，而不是 yml/环境变量的静态默认。 */
    @Test
    void metaReportsEffectiveModel_notStaticDefault() throws Exception {
        when(configService.resolve()).thenReturn(effective("deepseek-chat"));
        doAnswer(inv -> {
            AiAgentService.Events events = inv.getArgument(4);
            events.message("ok", List.of());
            return null;
        }).when(agentService).chat(any(), anyString(), any(), any(), any());

        String text = mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(body("你好")))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);

        assertThat(text).contains("event:meta").contains("\"model\":\"deepseek-chat\"");
    }

    /** 模型不可用（停用/未填密钥）时按 CONFIG_MISSING 报错，而不是静默或超时。 */
    @Test
    void configMissingFromModel_returnsErrorEvent() throws Exception {
        doAnswer(inv -> {
            throw new AiException(AiException.Code.CONFIG_MISSING, "大模型服务已停用，请在 系统管理 → 模型配置 中启用");
        }).when(agentService).chat(any(), anyString(), any(), any(), any());

        mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(body("你好")))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("event:error")))
                .andExpect(content().string(containsString("CONFIG_MISSING")))
                .andExpect(content().string(containsString("模型配置")));
    }

    @Test
    void emitsNavigationsInMessageEvent() throws Exception {
        doAnswer(inv -> {
            AiAgentService.Events events = inv.getArgument(4);
            events.message("去用户管理", List.of(
                    new com.workflow.ai.model.PageRef("/system/user", "用户管理")));
            return null;
        }).when(agentService).chat(any(), anyString(), any(), any(), any());

        String text = mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(body("怎么添加用户")))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);

        assertThat(text)
                .contains("\"/system/user\"")
                .contains("用户管理");
    }
}
