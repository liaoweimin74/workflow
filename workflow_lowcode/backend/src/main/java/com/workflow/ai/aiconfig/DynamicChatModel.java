package com.workflow.ai.aiconfig;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.ai.config.AiProperties;
import com.workflow.ai.exception.AiException;
import com.workflow.ai.model.ChatMessage;
import com.workflow.ai.model.ChatModel;
import com.workflow.ai.model.ChatOptions;
import com.workflow.ai.model.ChatResult;
import com.workflow.ai.provider.OpenAiCompatibleChatModel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;
import java.util.function.Consumer;

/**
 * 动态大模型代理：每次调用前经 {@link AiConfigService#resolve()} 解析「生效配置」
 * （DB 动态配置优先，回退静态 {@code workflow.ai.*}），配置指纹变化时自动重建底层
 * {@link OpenAiCompatibleChatModel}（含超时/端点/密钥），保存即生效、无需重启。
 *
 * <p>被 {@link com.workflow.ai.config.AiAutoConfiguration} 装配为平台唯一
 * {@link ChatModel} bean——逻辑流 LLM 节点、AI 对话、Agent、表单生成等
 * 全部消费方自动获得动态配置能力。本 bean <b>恒装配</b>：静态
 * {@code workflow.ai.enabled=false} 只表示「不带内置网关默认」，不可用时在调用点
 * 即刻报「已停用/未填密钥」，不联网、不占用启动。
 */
public class DynamicChatModel implements ChatModel {

    private static final Logger log = LoggerFactory.getLogger(DynamicChatModel.class);

    private final AiConfigService configService;
    private final ObjectMapper objectMapper;

    private volatile String fingerprint;
    private volatile OpenAiCompatibleChatModel delegate;

    public DynamicChatModel(AiConfigService configService, ObjectMapper objectMapper) {
        this.configService = configService;
        this.objectMapper = objectMapper;
    }

    @Override
    public String complete(List<ChatMessage> messages, ChatOptions options) {
        return delegate().complete(messages, options);
    }

    @Override
    public ChatResult completeWithTools(List<ChatMessage> messages, ChatOptions options) {
        return delegate().completeWithTools(messages, options);
    }

    @Override
    public void completeStream(List<ChatMessage> messages, ChatOptions options,
                               Consumer<String> onDelta, Consumer<String> onDone, Consumer<AiException> onError) {
        delegate().completeStream(messages, options, onDelta, onDone, onError);
    }

    /** 解析生效配置并返回（必要时重建）底层客户端。 */
    private OpenAiCompatibleChatModel delegate() {
        EffectiveLlmConfig cfg = currentConfig();
        if (!cfg.enabled()) {
            throw new AiException(AiException.Code.CONFIG_MISSING,
                    "大模型服务已停用，请在 系统管理 → 模型配置 中启用");
        }
        if (cfg.apiKey() == null || cfg.apiKey().isBlank()) {
            throw new AiException(AiException.Code.CONFIG_MISSING,
                    "大模型未配置 API Key，请在 系统管理 → 模型配置 中填写");
        }
        String fp = cfg.fingerprint();
        if (!fp.equals(fingerprint)) {
            synchronized (this) {
                if (!fp.equals(fingerprint)) {
                    delegate = build(cfg, objectMapper);
                    fingerprint = fp;
                    log.info("大模型客户端已切换: source={}, model={}, baseUrl={}",
                            cfg.source(), cfg.model(), cfg.baseUrl());
                }
            }
        }
        return delegate;
    }

    /** 解析当前生效配置（DB 优先，回退静态快照）。 */
    private EffectiveLlmConfig currentConfig() {
        return configService.resolve();
    }

    /** 从静态 AiProperties（已含沙箱桥接结果）构造生效配置快照。 */
    public static EffectiveLlmConfig fromProperties(AiProperties p, String source) {
        return new EffectiveLlmConfig(
                p.isEnabled(), p.getBaseUrl(), p.getApiKey(), p.getModel(),
                p.getTemperature(), p.getMaxTokens(),
                p.getConnectTimeoutMs(), p.getReadTimeoutMs(),
                p.getExtraHeaders(), source);
    }

    /** 按生效配置构建底层 OpenAI 兼容客户端（独立 RestClient + 超时）。 */
    public static OpenAiCompatibleChatModel build(EffectiveLlmConfig cfg, ObjectMapper objectMapper) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofMillis(cfg.connectTimeoutMs()));
        factory.setReadTimeout(Duration.ofMillis(cfg.readTimeoutMs()));
        RestClient restClient = RestClient.builder()
                .baseUrl(cfg.baseUrl())
                .requestFactory(factory)
                .build();
        AiProperties snapshot = new AiProperties();
        snapshot.setEnabled(cfg.enabled());
        snapshot.setBaseUrl(cfg.baseUrl());
        snapshot.setApiKey(cfg.apiKey());
        snapshot.setModel(cfg.model());
        if (cfg.temperature() != null) {
            snapshot.setTemperature(cfg.temperature());
        }
        if (cfg.maxTokens() != null) {
            snapshot.setMaxTokens(cfg.maxTokens());
        }
        snapshot.setConnectTimeoutMs(cfg.connectTimeoutMs());
        snapshot.setReadTimeoutMs(cfg.readTimeoutMs());
        snapshot.setExtraHeaders(cfg.extraHeaders() == null
                ? new java.util.LinkedHashMap<>() : cfg.extraHeaders());
        return new OpenAiCompatibleChatModel(restClient, objectMapper, snapshot);
    }
}
