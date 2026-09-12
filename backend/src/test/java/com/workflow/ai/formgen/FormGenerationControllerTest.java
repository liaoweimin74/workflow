package com.workflow.ai.formgen;

import com.workflow.ai.config.AiProperties;
import com.workflow.framework.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * FormGenerationController 测试（standalone MockMvc，SSE + 同步）。
 */
class FormGenerationControllerTest {

    private static final String STREAM_URL = "/api/v1/ai/forms/generate";
    private static final String SYNC_URL = "/api/v1/ai/forms/generate/sync";

    private AiFormGenerationService service;
    private AiProperties properties;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        service = mock(AiFormGenerationService.class);
        properties = mock(AiProperties.class);
        mvc = MockMvcBuilders.standaloneSetup(new FormGenerationController(service, properties))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    private String body(String description) {
        return "{\"description\":\"" + description + "\"}";
    }

    @Test
    void emptyDescription_returns400() throws Exception {
        mvc.perform(post(STREAM_URL).contentType(MediaType.APPLICATION_JSON).content(body("")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void stream_notConfigured_sendsErrorEvent() throws Exception {
        when(properties.isConfigured()).thenReturn(false);

        MvcResult result = mvc.perform(post(STREAM_URL).contentType(MediaType.APPLICATION_JSON).content(body("请假单")))
                .andExpect(request().asyncStarted())
                .andReturn();

        String content = mvc.perform(asyncDispatch(result)).andReturn().getResponse()
                .getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertThat(content).contains("event:error").contains("AI 服务未配置");
    }

    @Test
    void stream_success_sendsMetaChunkDone() throws Exception {
        when(properties.isConfigured()).thenReturn(true);
        when(properties.getModel()).thenReturn("test-model");
        when(service.generateStream(anyString(), any())).thenAnswer(inv -> {
            Consumer<String> onDelta = inv.getArgument(1);
            onDelta.accept("{\"rule\":[]}");
            return new AiFormGenerationService.StreamGenerateResult(
                    new AiFormGenerateResult("{\"rule\":[]}", List.of(), List.of()), "{\"rule\":[]}");
        });

        MvcResult result = mvc.perform(post(STREAM_URL).contentType(MediaType.APPLICATION_JSON).content(body("请假单")))
                .andExpect(request().asyncStarted())
                .andReturn();

        String content = mvc.perform(asyncDispatch(result)).andReturn().getResponse()
                .getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertThat(content).contains("event:meta").contains("event:chunk").contains("event:done");
    }

    @Test
    void sync_notConfigured_returns503() throws Exception {
        when(properties.isConfigured()).thenReturn(false);

        mvc.perform(post(SYNC_URL).contentType(MediaType.APPLICATION_JSON).content(body("请假单")))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.msg").value("AI 服务未配置"));
    }

    @Test
    void sync_success_returnsResult() throws Exception {
        when(properties.isConfigured()).thenReturn(true);
        when(service.generateSync(anyString())).thenReturn(
                new AiFormGenerateResult("{\"rule\":[]}", List.of(), List.of()));

        mvc.perform(post(SYNC_URL).contentType(MediaType.APPLICATION_JSON).content(body("请假单")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.schema").value("{\"rule\":[]}"));
    }
}
