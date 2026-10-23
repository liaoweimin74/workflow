package com.workflow.ai.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.ai.aiconfig.AiConfigService;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * AiProperties 绑定与 ChatModel 装配测试。
 */
class AiPropertiesTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withBean(ObjectMapper.class, ObjectMapper::new)
            .withBean(AiConfigService.class, () -> mock(AiConfigService.class))
            .withUserConfiguration(AiAutoConfiguration.class);

    @Test
    void defaults_whenNoProperties() {
        // 默认接入平台内置模型（经内部 LLM 网关，开箱即用）：
        // enabled=true、baseUrl=内部网关、apiKey=internal-llm、model=glm-4-plus
        runner.run(ctx -> {
            AiProperties p = ctx.getBean(AiProperties.class);
            assertThat(p.isEnabled()).isTrue();
            assertThat(p.getBaseUrl()).isEqualTo("http://127.0.0.1:8080/api/internal/llm/v1");
            assertThat(p.getModel()).isEqualTo("glm-4-plus");
            assertThat(p.getMaxTokens()).isEqualTo(4096);
        });
    }

    /**
     * ChatModel bean 恒装配：静态开关只描述内置网关默认可不可用，不可用时由
     * DynamicChatModel 在调用点报错。拆掉 bean 会让「页面接入外部模型」这条路失效。
     */
    @Test
    void chatModelAlwaysCreated() {
        runner.withPropertyValues("workflow.ai.enabled=false", "workflow.ai.api-key=")
                .run(ctx -> assertThat(ctx).hasBean("chatModel"));
    }

    @Test
    void chatModelCreated_whenConfigured() {
        runner.withPropertyValues("workflow.ai.enabled=true", "workflow.ai.api-key=sk-test")
                .run(ctx -> assertThat(ctx).hasBean("chatModel"));
    }

    @Test
    void bindsProperties() {
        runner.withPropertyValues(
                        "workflow.ai.base-url=http://localhost:11434/v1",
                        "workflow.ai.model=qwen2",
                        "workflow.ai.temperature=0.3",
                        "workflow.ai.max-tokens=1024",
                        "workflow.ai.enabled=true",
                        "workflow.ai.api-key=k")
                .run(ctx -> {
                    AiProperties p = ctx.getBean(AiProperties.class);
                    assertThat(p.getBaseUrl()).isEqualTo("http://localhost:11434/v1");
                    assertThat(p.getModel()).isEqualTo("qwen2");
                    assertThat(p.getTemperature()).isEqualTo(0.3);
                    assertThat(p.getMaxTokens()).isEqualTo(1024);
                });
    }
}
