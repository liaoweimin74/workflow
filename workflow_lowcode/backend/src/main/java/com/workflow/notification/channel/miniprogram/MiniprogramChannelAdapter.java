package com.workflow.notification.channel.miniprogram;

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
 * 微信小程序渠道适配器
 *
 * <p>调用微信官方订阅消息 API 真实发送：
 * <ol>
 *   <li>{@code GET /cgi-bin/token?grant_type=client_credential&appid=&secret=} 获取 access_token（内存缓存）</li>
 *   <li>{@code POST /cgi-bin/message/subscribe/send?access_token=} 发送订阅消息</li>
 * </ol>
 * 响应 {@code errcode=0} 视为成功。未配置 app-id/app-secret 时 {@link #isAvailable()} 返回 false。
 * 收件人为小程序 openid，优先取 templateData/openId，缺失时以 recipientUserId 兜底。
 */
@Component
public class MiniprogramChannelAdapter implements ChannelAdapter {

    private static final Logger log = LoggerFactory.getLogger(MiniprogramChannelAdapter.class);

    private static final String DEFAULT_BASE_URL = "https://api.weixin.qq.com";
    private static final String OPENID_FIELD = "openId";

    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    @Value("${notification.miniprogram.base-url:}")
    private String baseUrl;

    @Value("${notification.miniprogram.app-id:}")
    private String appId;

    @Value("${notification.miniprogram.app-secret:}")
    private String appSecret;

    @Value("${notification.miniprogram.template-id:}")
    private String templateId;

    /** access_token 缓存（含过期时间戳） */
    private volatile String cachedToken;
    private volatile long tokenExpiresAt;

    public MiniprogramChannelAdapter() {
        this.restClient = RestClient.builder().build();
        this.objectMapper = new ObjectMapper();
    }

    /**
     * 测试用构造：注入外部 builder（配合 MockRestServiceServer 绑定模拟网关）。
     */
    MiniprogramChannelAdapter(RestClient.Builder restClientBuilder) {
        this(restClientBuilder, new ObjectMapper());
    }

    MiniprogramChannelAdapter(RestClient.Builder restClientBuilder, ObjectMapper objectMapper) {
        this.restClient = restClientBuilder.build();
        this.objectMapper = objectMapper;
    }

    @Override
    public ChannelType getChannelType() {
        return ChannelType.WECHAT_MINIPROGRAM;
    }

    @Override
    public ChannelDeliveryResult send(ChannelMessage message) {
        if (!isAvailable()) {
            return ChannelDeliveryResult.failure("小程序未配置（缺少 app-id/app-secret/template-id）");
        }
        try {
            String token = getAccessToken();
            if (token == null) {
                return ChannelDeliveryResult.failure("获取小程序 access_token 失败");
            }

            // data 结构：{ 模板字段名: { value: xxx } }
            Map<String, Object> data = new LinkedHashMap<>();
            Map<String, Object> contentValue = new LinkedHashMap<>();
            contentValue.put("value", message.getContent() != null ? message.getContent() : "");
            data.put("content", contentValue);
            Map<String, Object> titleValue = new LinkedHashMap<>();
            titleValue.put("value", message.getTitle() != null ? message.getTitle() : "");
            data.put("title", titleValue);

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("touser", resolveOpenId(message));
            body.put("template_id", templateId);
            body.put("data", data);
            if (message.getLinkTemplate() != null && message.getLinkTemplate().get("page") != null) {
                body.put("page", String.valueOf(message.getLinkTemplate().get("page")));
            }

            String json = restClient.post()
                    .uri(baseUrl().concat("/cgi-bin/message/subscribe/send").concat("?access_token=").concat(token))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(objectMapper.writeValueAsString(body))
                    .retrieve()
                    .body(String.class);

            return parseResponse(json);
        } catch (Exception e) {
            log.error("小程序订阅消息发送失败: messageId={}, error={}", message.getMessageId(), e.getMessage());
            return ChannelDeliveryResult.failure(e.getMessage());
        }
    }

    /**
     * 获取 access_token：优先使用未过期的缓存，否则重新请求。
     */
    private String getAccessToken() {
        if (cachedToken != null && System.currentTimeMillis() < tokenExpiresAt) {
            return cachedToken;
        }
        try {
            String json = restClient.get()
                    .uri(baseUrl().concat("/cgi-bin/token")
                            .concat("?grant_type=client_credential")
                            .concat("&appid=").concat(encode(appId))
                            .concat("&secret=").concat(encode(appSecret)))
                    .retrieve()
                    .body(String.class);

            Map<String, Object> resp = objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
            Object errcode = resp.get("errcode");
            if (errcode != null && !"0".equals(String.valueOf(errcode))) {
                log.error("获取小程序 access_token 失败: errcode={}, errmsg={}", errcode, resp.get("errmsg"));
                return null;
            }
            Object token = resp.get("access_token");
            if (token == null) {
                log.error("小程序 access_token 响应缺少 access_token 字段: {}", json);
                return null;
            }
            cachedToken = String.valueOf(token);
            // 官方有效期 7200 秒，留 5 分钟余量提前刷新
            tokenExpiresAt = System.currentTimeMillis() + 6600 * 1000L;
            return cachedToken;
        } catch (Exception e) {
            log.error("获取小程序 access_token 异常: {}", e.getMessage());
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
                return ChannelDeliveryResult.success("miniprogram_" + System.currentTimeMillis());
            }
            return ChannelDeliveryResult.failure("小程序返回错误: errcode=" + errcode + ", errmsg=" + resp.get("errmsg"));
        } catch (Exception e) {
            return ChannelDeliveryResult.failure("小程序响应解析失败: " + e.getMessage() + " body=" + json);
        }
    }

    /**
     * 解析收件人 openid：优先取 templateData/openId，缺失时用 recipientUserId 兜底。
     */
    private String resolveOpenId(ChannelMessage message) {
        if (message.getTemplateData() != null) {
            Object openId = message.getTemplateData().get(OPENID_FIELD);
            if (openId != null && !String.valueOf(openId).isBlank()) {
                return String.valueOf(openId);
            }
        }
        if (message.getRecipientUserId() != null) {
            return String.valueOf(message.getRecipientUserId());
        }
        return "";
    }

    private String baseUrl() {
        return (baseUrl != null && !baseUrl.isEmpty()) ? baseUrl : DEFAULT_BASE_URL;
    }

    private String encode(String value) {
        return URLEncoder.encode(value != null ? value : "", StandardCharsets.UTF_8);
    }

    @Override
    public boolean isAvailable() {
        return appId != null && !appId.isEmpty()
                && appSecret != null && !appSecret.isEmpty()
                && templateId != null && !templateId.isEmpty();
    }
}
