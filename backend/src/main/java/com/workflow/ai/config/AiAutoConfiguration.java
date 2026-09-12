package com.workflow.ai.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.ai.model.ChatModel;
import com.workflow.ai.provider.OpenAiCompatibleChatModel;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/**
 * AI 模块自动装配。
 *
 * <p>仅当 {@code workflow.ai.enabled=true} 时装配 {@link ChatModel} bean；
 * 未启用时不创建，AI 端点据此返回"AI 服务未配置"。
 */
@Configuration
@EnableConfigurationProperties(AiProperties.class)
public class AiAutoConfiguration {

    @Bean
    @ConditionalOnProperty(prefix = "workflow.ai", name = "enabled", havingValue = "true")
    public ChatModel chatModel(AiProperties properties, ObjectMapper objectMapper) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofMillis(properties.getConnectTimeoutMs()));
        factory.setReadTimeout(Duration.ofMillis(properties.getReadTimeoutMs()));
        RestClient restClient = RestClient.builder()
                .baseUrl(properties.getBaseUrl())
                .requestFactory(factory)
                .build();
        return new OpenAiCompatibleChatModel(restClient, objectMapper, properties);
    }
}
