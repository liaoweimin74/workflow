package com.workflow.ai.formgen;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.ai.aiconfig.AiConfigService;
import com.workflow.ai.aiconfig.EffectiveLlmConfig;
import com.workflow.ai.exception.AiException;
import com.workflow.ai.model.ChatMessage;
import com.workflow.ai.model.ChatModel;
import com.workflow.ai.model.ChatOptions;
import com.workflow.ai.model.ChatResult;
import com.workflow.ai.support.AiUsageRecorder;
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
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * AiFormGenerationService 测试（FakeChatModel 固定 schema）。
 */
@ExtendWith(MockitoExtension.class)
class AiFormGenerationServiceTest {

    @Mock
    private ObjectProvider<ChatModel> chatModelProvider;

    @Mock
    private AiUsageRecorder recorder;

    @Mock
    private AiConfigService configService;

    private AiFormGenerationService service;

    private static EffectiveLlmConfig effective(String model) {
        return new EffectiveLlmConfig(true, "https://example.test/v1", "test-key", model,
                0.7, 4096, 5000, 120000, Map.of(), "数据库配置");
    }

    @BeforeEach
    void setUp() {
        // 生效配置的模型名（DB 优先）决定用量记录，服务侧不再读静态 properties
        lenient().when(configService.resolve()).thenReturn(effective("test-model"));
        service = new AiFormGenerationService(chatModelProvider, configService,
                new FormSchemaPromptBuilder(), new FormSchemaValidator(new ObjectMapper()), recorder);
    }

    private ChatModel chunkedModel(String payload) {
        return new ChatModel() {
            @Override
            public String complete(List<ChatMessage> messages, ChatOptions options) {
                return payload;
            }

            @Override
            public ChatResult completeWithTools(List<ChatMessage> messages, ChatOptions options) {
                return new ChatResult(payload, List.of());
            }

            @Override
            public void completeStream(List<ChatMessage> messages, ChatOptions options,
                                       Consumer<String> onDelta, Consumer<String> onDone, Consumer<AiException> onError) {
                int mid = payload.length() / 2;
                onDelta.accept(payload.substring(0, mid));
                onDelta.accept(payload.substring(mid));
                onDone.accept(null);
            }
        };
    }

    @Test
    void generateSync_returnsValidatedResult() {
        when(chatModelProvider.getIfAvailable()).thenReturn(chunkedModel(
                "{\"rule\":[{\"type\":\"input\",\"field\":\"name\",\"title\":\"姓名\"}]}"));

        AiFormGenerateResult result = service.generateSync("姓名");

        assertThat(result.fields()).hasSize(1);
        assertThat(result.fields().get(0).field()).isEqualTo("name");
        verify(recorder).recordSuccess(eq("form-gen"), eq("test-model"), anyLong(), anyLong(), anyLong());
    }

    @Test
    void generateStream_emitsDeltas() {
        when(chatModelProvider.getIfAvailable()).thenReturn(chunkedModel(
                "{\"rule\":[{\"type\":\"input\",\"field\":\"a\",\"title\":\"A\"}]}"));

        List<String> deltas = new ArrayList<>();
        AiFormGenerationService.StreamGenerateResult sr = service.generateStream("A", deltas::add);

        assertThat(deltas).hasSize(2);
        assertThat(sr.result().fields()).hasSize(1);
        assertThat(sr.rawText()).contains("rule");
    }

    @Test
    void missingChatModelBean_throwsConfigMissing() {
        when(chatModelProvider.getIfAvailable()).thenReturn(null);

        assertThatThrownBy(() -> service.generateSync("x"))
                .isInstanceOf(AiException.class)
                .extracting(e -> ((AiException) e).getCode())
                .isEqualTo(AiException.Code.CONFIG_MISSING);
    }

    @Test
    void streamFailure_propagatesAndRecordsFailure() {
        ChatModel failing = new ChatModel() {
            @Override
            public String complete(List<ChatMessage> messages, ChatOptions options) {
                throw new AiException(AiException.Code.TIMEOUT, "timeout");
            }

            @Override
            public ChatResult completeWithTools(List<ChatMessage> messages, ChatOptions options) {
                throw new AiException(AiException.Code.TIMEOUT, "timeout");
            }

            @Override
            public void completeStream(List<ChatMessage> messages, ChatOptions options,
                                       Consumer<String> onDelta, Consumer<String> onDone, Consumer<AiException> onError) {
                onError.accept(new AiException(AiException.Code.TIMEOUT, "timeout"));
            }
        };
        when(chatModelProvider.getIfAvailable()).thenReturn(failing);

        assertThatThrownBy(() -> service.generateSync("x"))
                .isInstanceOf(AiException.class)
                .extracting(e -> ((AiException) e).getCode())
                .isEqualTo(AiException.Code.TIMEOUT);
        verify(recorder).recordFailure(eq("form-gen"), eq("test-model"), anyString(), anyLong());
    }
}
