package com.workflow.ai.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.ai.aiconfig.AiConfigService;
import com.workflow.ai.aiconfig.DynamicChatModel;
import com.workflow.ai.model.ChatModel;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * AI 模块自动装配。
 *
 * <p>装配平台唯一 {@link ChatModel} bean：{@link DynamicChatModel} 动态代理，
 * <b>恒装配</b>（不再有 {@code workflow.ai.enabled} 条件）。生效配置 = DB 动态配置
 * （系统管理 → 模型配置，保存即生效）优先，回退静态 {@code workflow.ai.*}
 * （yml / {@code AI_BASE_URL}/{@code AI_API_KEY}/{@code AI_MODEL} 环境变量 / 沙箱桥接）。
 *
 * <p>静态 {@code enabled=false} 与「未配置密钥」都不拆 bean，而是让调用点即刻拿到
 * 明确提示（见 {@link DynamicChatModel#complete}）——既不联网超时，也不影响启动；
 * 外部部署在页面接入模型后立即可用，无需改环境变量或重启。
 */
@Configuration
@EnableConfigurationProperties(AiProperties.class)
public class AiAutoConfiguration {

    @Bean
    public ChatModel chatModel(AiProperties properties, AiConfigService aiConfigService,
                               ObjectMapper objectMapper) {
        // 单后端部署形态：默认内部网关（NestJS）不存在时，桥接沙箱内置模型配置
        SandboxAiConfigBridge.apply(properties);
        return new DynamicChatModel(aiConfigService, objectMapper);
    }
}
