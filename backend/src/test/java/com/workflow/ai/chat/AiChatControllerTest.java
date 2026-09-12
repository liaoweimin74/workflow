package com.workflow.ai.chat;

import com.workflow.ai.agent.AiAgentService;
import com.workflow.ai.config.AiProperties;
import com.workflow.framework.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * AiChatController 测试（standalone MockMvc，SSE）。
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
        mvc = MockMvcBuilders.standaloneSetup(new AiChatController(agentService, properties))
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
    void notConfigured_sendsErrorEvent() throws Exception {
        when(properties.isConfigured()).thenReturn(false);

        MvcResult result = mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(body("你好")))
                .andExpect(request().asyncStarted())
                .andReturn();

        String content = mvc.perform(asyncDispatch(result)).andReturn().getResponse()
                .getContentAsString(StandardCharsets.UTF_8);
        assertThat(content).contains("event:error").contains("AI 服务未配置");
    }

    @Test
    void success_sendsMetaMessageDone() throws Exception {
        when(properties.isConfigured()).thenReturn(true);
        when(properties.getModel()).thenReturn("test-model");
        doAnswer(inv -> {
            AiAgentService.Events events = inv.getArgument(3);
            events.message("已为你生成表单", java.util.List.of());
            return null;
        }).when(agentService).chat(any(), anyString(), any(), any());

        MvcResult result = mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(body("生成请假单")))
                .andExpect(request().asyncStarted())
                .andReturn();

        String content = mvc.perform(asyncDispatch(result)).andReturn().getResponse()
                .getContentAsString(StandardCharsets.UTF_8);
        assertThat(content).contains("event:meta").contains("event:message").contains("event:done")
                .contains("已为你生成表单");
    }
}
