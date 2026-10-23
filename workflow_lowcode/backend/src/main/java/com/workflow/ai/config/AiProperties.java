package com.workflow.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * AI 服务配置。
 *
 * <p>前缀 {@code workflow.ai}。默认接入<b>平台内置模型</b>：经 NestJS 后端的
 * 内部 LLM 网关（{@code http://127.0.0.1:8080/api/internal/llm/v1}）调用
 * GLM，无需外部 API key，开箱即用。
 *
 * <p>外部部署时可用 {@code AI_BASE_URL}/{@code AI_API_KEY}/{@code AI_MODEL}
 * 环境变量覆盖，接入任意 OpenAI 兼容服务（如 DeepSeek）。
 */
@ConfigurationProperties(prefix = "workflow.ai")
public class AiProperties {

    /**
     * 静态默认值的启用开关（对应 {@code workflow.ai.enabled} / {@code WORKFLOW_AI_ENABLED}）。
     *
     * <p>只描述「内置网关默认可不可用」，<b>不是</b> AI 功能的总闸：页面「系统管理 →
     * 模型配置」保存的 DB 行优先且能独立启用 AI（见
     * {@link com.workflow.ai.aiconfig.AiConfigService#resolve()}）。设为 false 时既不
     * 拆 {@code ChatModel} bean，也不影响启动，仅在真正调用时报「已停用」。
     */
    private boolean enabled = true;

    /** OpenAI 兼容端点基础地址，默认指向平台内部 LLM 网关（NestJS）。 */
    private String baseUrl = "http://127.0.0.1:8080/api/internal/llm/v1";

    /** API 密钥，为空时视为未配置（内部网关默认密钥与之互通）。 */
    private String apiKey = "internal-llm";

    /** 模型名称（平台内置模型，网关以实际返回校准）。 */
    private String model = "glm-4-plus";

    /** 默认温度。 */
    private double temperature = 0.7;

    /** 默认最大输出 token 数。 */
    private int maxTokens = 4096;

    /** 连接超时（毫秒）。 */
    private int connectTimeoutMs = 5000;

    /** 读超时（毫秒），流式场景需较长。 */
    private int readTimeoutMs = 120000;

    /**
     * 额外请求头（如网关要求的 {@code X-Token}、{@code X-Chat-Id} 等
     * 自定义鉴权头），随每次模型请求附加在 Bearer 之上。
     */
    private java.util.Map<String, String> extraHeaders = new java.util.LinkedHashMap<>();

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }

    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }

    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }

    public double getTemperature() { return temperature; }
    public void setTemperature(double temperature) { this.temperature = temperature; }

    public int getMaxTokens() { return maxTokens; }
    public void setMaxTokens(int maxTokens) { this.maxTokens = maxTokens; }

    public int getConnectTimeoutMs() { return connectTimeoutMs; }
    public void setConnectTimeoutMs(int connectTimeoutMs) { this.connectTimeoutMs = connectTimeoutMs; }

    public int getReadTimeoutMs() { return readTimeoutMs; }
    public void setReadTimeoutMs(int readTimeoutMs) { this.readTimeoutMs = readTimeoutMs; }

    public java.util.Map<String, String> getExtraHeaders() { return extraHeaders; }
    public void setExtraHeaders(java.util.Map<String, String> extraHeaders) {
        this.extraHeaders = extraHeaders == null ? new java.util.LinkedHashMap<>() : extraHeaders;
    }
}
