package com.workflow.ai.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AiProperties 绑定与条件装配测试。
 */
class AiPropertiesTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withBean(ObjectMapper.class, ObjectMapper::new)
            .withUserConfiguration(AiAutoConfiguration.class);

    @Test
    void defaults_whenNoProperties() {
        runner.run(ctx -> {
            AiProperties p = ctx.getBean(AiProperties.class);
            assertThat(p.isEnabled()).isFalse();
            assertThat(p.getBaseUrl()).isEqualTo("https://api.deepseek.com/v1");
            assertThat(p.getModel()).isEqualTo("deepseek-chat");
            assertThat(p.getMaxTokens()).isEqualTo(4096);
            assertThat(p.isConfigured()).isFalse();
        });
    }

    @Test
    void chatModelNotCreated_whenDisabled() {
        runner.run(ctx -> assertThat(ctx).doesNotHaveBean("chatModel"));
    }

    @Test
    void chatModelCreated_whenEnabled() {
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
                    assertThat(p.isConfigured()).isTrue();
                });
    }
}
