package com.workflow.notification.channel.wechatwork;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.notification.channel.ChannelAdapter;
import com.workflow.notification.channel.ChannelDeliveryResult;
import com.workflow.notification.channel.ChannelMessage;
import com.workflow.notification.model.ChannelType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 企业微信渠道适配器
 *
 * <p>调用官方企业微信应用消息 API 真实发送：
 * <ol>
 *   <li>{@code GET /cgi-bin/gettoken?corpid=&corpsecret=} 获取 access_token（内存缓存，过期前复用）</li>
 *   <li>{@code POST /cgi-bin/message/send?access_token=} 发送文本应用消息</li>
 * </ol>
 * 响应 {@code errcode=0} 视为成功。未配置 corp-id/corp-secret/agent-id 时 {@link #isAvailable()} 返回 false。
 * 收件人为企业微信成员 userid，优先取 templateData/userId，缺失时以 recipientUserId 兜底。
 */
@Component
public class WechatWorkChannelAdapter implements ChannelAdapter {

    private static final Logger log = LoggerFactory.getLogger(WechatWorkChannelAdapter.class);

    private static final String DEFAULT_BASE_URL = "https://qyapi.weixin.qq.com";
    private static final String USERID_FIELD = "userId";

    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    @Value("${notification.wechat-work.base-url:}")
    private String baseUrl;

    @Value("${notification.wechat-work.corp-id:}")
    private String corpId;

    @Value("${notification.wechat-work.corp-secret:}")
    private String corpSecret;

    @Value("${notification.wechat-work.agent-id:}")
    private String agentId;

    /** access_token 缓存（含过期时间戳） */
    private volatile String cachedToken;
    private volatile long tokenExpiresAt;

    public WechatWorkChannelAdapter() {
        this.restClient = RestClient.builder().build();
        this.objectMapper = new ObjectMapper();
    }

    /**
     * 测试用构造：注入外部 builder（配合 MockRestServiceServer 绑定模拟网关）。
     */
    WechatWorkChannelAdapter(RestClient.Builder restClientBuilder) {
        this(restClientBuilder, new ObjectMapper());
    }

    WechatWorkChannelAdapter(RestClient.Builder restClientBuilder, ObjectMapper objectMapper) {
        this.restClient = restClientBuilder.build();
        this.objectMapper = objectMapper;
    }

    @Override
    public ChannelType getChannelType() {
        return ChannelType.WECHAT_WORK;
    }

    @Override
    public ChannelDeliveryResult send(ChannelMessage message) {
        if (!isAvailable()) {
            return ChannelDeliveryResult.failure("企业微信未配置（缺少 corp-id/corp-secret/agent-id）");
        }
        try {
            String token = getAccessToken();
            if (token == null) {
                return ChannelDeliveryResult.failure("获取企业微信 access_token 失败");
            }

            Map<String, Object> text = new LinkedHashMap<>();
            text.put("content", message.getContent() != null ? message.getContent() : "");

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("touser", resolveUserId(message));
            body.put("msgtype", "text");
            body.put("agentid", parseAgentId());
            body.put("text", text);
            body.put("safe", 0);

            String json = restClient.post()
                    .uri(baseUrl().concat("/cgi-bin/message/send").concat("?access_token=").concat(token))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(objectMapper.writeValueAsString(body))
                    .retrieve()
                    .body(String.class);

            return parseResponse(json);
        } catch (Exception e) {
            log.error("企业微信发送失败: messageId={}, error={}", message.getMessageId(), e.getMessage());
            return ChannelDeliveryResult.failure(e.getMessage());
        }
    }

    /**
     * 获取 access_token：优先使用未过期的缓存，否则重新请求。
     *
     * @return access_token，失败返回 null
     */
    private String getAccessToken() {
        if (cachedToken != null && System.currentTimeMillis() < tokenExpiresAt) {
            return cachedToken;
        }
        try {
            String json = restClient.get()
                    .uri(baseUrl().concat("/cgi-bin/gettoken")
                            .concat("?corpid=").concat(encode(corpId))
                            .concat("&corpsecret=").concat(encode(corpSecret)))
                    .retrieve()
                    .body(String.class);

            Map<String, Object> resp = objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
            Object errcode = resp.get("errcode");
            if (errcode != null && !"0".equals(String.valueOf(errcode))) {
                log.error("获取企业微信 access_token 失败: errcode={}, errmsg={}", errcode, resp.get("errmsg"));
                return null;
            }
            Object token = resp.get("access_token");
            if (token == null) {
                log.error("企业微信 access_token 响应缺少 access_token 字段: {}", json);
                return null;
            }
            cachedToken = String.valueOf(token);
            // 官方有效期 7200 秒，留 5 分钟余量提前刷新
            tokenExpiresAt = System.currentTimeMillis() + 6600 * 1000L;
            return cachedToken;
        } catch (Exception e) {
            log.error("获取企业微信 access_token 异常: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 解析 send 响应：{@code errcode=0} 成功。
     */
    private ChannelDeliveryResult parseResponse(String json) {
        try {
            Map<String, Object> resp = objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
            Object errcode = resp.get("errcode");
            if (errcode != null && "0".equals(String.valueOf(errcode))) {
                return ChannelDeliveryResult.success("wxwork_" + System.currentTimeMillis());
            }
            return ChannelDeliveryResult.failure("企业微信返回错误: errcode=" + errcode + ", errmsg=" + resp.get("errmsg"));
        } catch (Exception e) {
            return ChannelDeliveryResult.failure("企业微信响应解析失败: " + e.getMessage() + " body=" + json);
        }
    }

    /**
     * 解析收件人企业微信 userid：优先取 templateData/userId，缺失时用 recipientUserId 兜底。
     */
    private String resolveUserId(ChannelMessage message) {
        if (message.getTemplateData() != null) {
            Object userId = message.getTemplateData().get(USERID_FIELD);
            if (userId != null && !String.valueOf(userId).isBlank()) {
                return String.valueOf(userId);
            }
        }
        if (message.getRecipientUserId() != null) {
            return String.valueOf(message.getRecipientUserId());
        }
        return "";
    }

    private Integer parseAgentId() {
        try {
            return agentId != null ? Integer.parseInt(agentId.trim()) : 0;
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private String encode(String value) {
        return URLEncoder.encode(value != null ? value : "", StandardCharsets.UTF_8);
    }

    private String baseUrl() {
        return (baseUrl != null && !baseUrl.isEmpty()) ? baseUrl : DEFAULT_BASE_URL;
    }

    @Override
    public boolean isAvailable() {
        return corpId != null && !corpId.isEmpty()
                && corpSecret != null && !corpSecret.isEmpty()
                && agentId != null && !agentId.isEmpty();
    }
}
