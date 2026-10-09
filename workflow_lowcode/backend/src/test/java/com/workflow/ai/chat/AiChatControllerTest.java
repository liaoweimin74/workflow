package com.workflow.ai.chat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.ai.agent.AiAgentService;
import com.workflow.ai.config.AiProperties;
import com.workflow.framework.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.charset.StandardCharsets;
import java.util.List;

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
    private AiProperties properties;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        agentService = mock(AiAgentService.class);
        properties = mock(AiProperties.class);
        mvc = MockMvcBuilders.standaloneSetup(new AiChatController(agentService, properties, new ObjectMapper()))
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
    void notConfigured_returnsErrorEvent() throws Exception {
        when(properties.isConfigured()).thenReturn(false);

        mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(body("你好")))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("event:error")))
                .andExpect(content().string(containsString("AI 服务未配置")));
    }

    @Test
    void success_returnsMetaMessageDone() throws Exception {
        when(properties.isConfigured()).thenReturn(true);
        when(properties.getModel()).thenReturn("test-model");
        doAnswer(inv -> {
            AiAgentService.Events events = inv.getArgument(3);
            events.message("已为你生成表单", List.of());
            return null;
        }).when(agentService).chat(any(), anyString(), any(), any());

        mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(body("生成请假单")))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("event:meta")))
                .andExpect(content().string(containsString("event:message")))
                .andExpect(content().string(containsString("event:done")))
                .andExpect(content().string(containsString("已为你生成表单")));
    }

    @Test
    void emitsNavigationsInMessageEvent() throws Exception {
        when(properties.isConfigured()).thenReturn(true);
        when(properties.getModel()).thenReturn("test-model");
        doAnswer(inv -> {
            AiAgentService.Events events = inv.getArgument(3);
            events.message("去用户管理", List.of(
                    new com.workflow.ai.model.PageRef("/system/user", "用户管理")));
            return null;
        }).when(agentService).chat(any(), anyString(), any(), any());

        String text = mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(body("怎么添加用户")))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);

        org.assertj.core.api.Assertions.assertThat(text)
                .contains("\"/system/user\"")
                .contains("用户管理");
    }
}
