package com.workflow.ai.aiconfig;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.ai.exception.AiException;
import com.workflow.ai.model.ChatMessage;
import com.workflow.ai.model.ChatOptions;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * {@link DynamicChatModel} 的可用性判定测试：不可用时在调用点即刻报错，
 * 不发起网络请求（因此也不会等到连接超时）。
 */
class DynamicChatModelTest {

    private static EffectiveLlmConfig cfg(boolean enabled, String apiKey) {
        return new EffectiveLlmConfig(enabled, "https://example.test/v1", apiKey, "some-model",
                0.7, 4096, 5000, 120000, Map.of(), "环境与默认配置");
    }

    private DynamicChatModel model(AiConfigService configService) {
        return new DynamicChatModel(configService, new ObjectMapper());
    }

    @Test
    void disabled_throwsConfigMissingWithActionableMessage() {
        AiConfigService configService = mock(AiConfigService.class);
        when(configService.resolve()).thenReturn(cfg(false, "sk-x"));

        assertThatThrownBy(() -> model(configService)
                .complete(List.of(ChatMessage.user("hi")), ChatOptions.defaults()))
                .isInstanceOf(AiException.class)
                .hasMessageContaining("已停用")
                .hasMessageContaining("模型配置");
    }

    @Test
    void blankApiKey_throwsConfigMissing() {
        AiConfigService configService = mock(AiConfigService.class);
        when(configService.resolve()).thenReturn(cfg(true, "  "));

        assertThatThrownBy(() -> model(configService)
                .complete(List.of(ChatMessage.user("hi")), ChatOptions.defaults()))
                .isInstanceOf(AiException.class)
                .hasMessageContaining("API Key");
    }
}
