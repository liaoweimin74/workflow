package com.workflow.ai.aiconfig;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.ai.config.AiProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * {@link AiConfigService#resolve()} 测试：生效配置一律 DB 优先、回退静态快照。
 *
 * <p>关键回归点：静态 {@code workflow.ai.enabled=false}（部署时不带内置网关默认）
 * 不得拦掉页面保存的 DB 配置——否则「模型配置页测试连接通过、AI 助手却说未配置」。
 */
class AiConfigServiceResolveTest {

    private SysAiConfigRepository repo;
    private AiProperties properties;

    @BeforeEach
    void setUp() {
        repo = mock(SysAiConfigRepository.class);
        properties = new AiProperties();
    }

    private AiConfigService service() {
        return new AiConfigService(repo, properties, new ObjectMapper());
    }

    private static SysAiConfig dbRow() {
        SysAiConfig row = new SysAiConfig();
        row.setEnabled(true);
        row.setBaseUrl("https://api.deepseek.com/v1");
        row.setApiKey("sk-db");
        row.setModel("deepseek-chat");
        return row;
    }

    @Test
    void dbRowWins_evenWhenStaticSwitchOff() {
        properties.setEnabled(false);
        properties.setApiKey("");
        when(repo.findTopByIsDeletedOrderByIdDesc(0)).thenReturn(dbRow());

        EffectiveLlmConfig cfg = service().resolve();

        assertThat(cfg.enabled()).isTrue();
        assertThat(cfg.model()).isEqualTo("deepseek-chat");
        assertThat(cfg.apiKey()).isEqualTo("sk-db");
        assertThat(cfg.source()).isEqualTo("数据库配置");
    }

    @Test
    void fallsBackToStaticSnapshot_whenNoDbRow() {
        when(repo.findTopByIsDeletedOrderByIdDesc(0)).thenReturn(null);

        EffectiveLlmConfig cfg = service().resolve();

        assertThat(cfg.source()).isEqualTo("环境与默认配置");
        assertThat(cfg.model()).isEqualTo("glm-4-plus");
    }

    /** 静态默认关且页面没配过 → 生效配置照实为停用（调用点即刻报错，不联网）。 */
    @Test
    void staticDisabledWithoutDbRow_staysDisabled() {
        properties.setEnabled(false);
        when(repo.findTopByIsDeletedOrderByIdDesc(0)).thenReturn(null);

        assertThat(service().resolve().enabled()).isFalse();
    }

    @Test
    void dbReadFailure_fallsBackToStatic() {
        when(repo.findTopByIsDeletedOrderByIdDesc(0)).thenThrow(new IllegalStateException("db down"));

        EffectiveLlmConfig cfg = service().resolve();

        assertThat(cfg.source()).isEqualTo("环境与默认配置");
    }
}
