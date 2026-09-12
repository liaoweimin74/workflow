package com.workflow.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * AI 服务配置。
 *
 * <p>前缀 {@code workflow.ai}。默认关闭（{@code enabled=false}），
 * 配置 {@code api-key} 后置 {@code enabled=true} 启用。
 */
@ConfigurationProperties(prefix = "workflow.ai")
public class AiProperties {

    /** AI 服务开关，默认关闭。 */
    private boolean enabled = false;

    /** OpenAI 兼容端点基础地址。 */
    private String baseUrl = "https://api.deepseek.com/v1";

    /** API 密钥，为空时视为未配置。 */
    private String apiKey = "";

    /** 模型名称。 */
    private String model = "deepseek-chat";

    /** 默认温度。 */
    private double temperature = 0.7;

    /** 默认最大输出 token 数。 */
    private int maxTokens = 4096;

    /** 连接超时（毫秒）。 */
    private int connectTimeoutMs = 5000;

    /** 读超时（毫秒），流式场景需较长。 */
    private int readTimeoutMs = 120000;

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

    /**
     * 是否具备可用配置（开关打开且 api-key 非空）。
     */
    public boolean isConfigured() {
        return enabled && apiKey != null && !apiKey.isBlank();
    }
}
