package com.workflow.notification.channel.sms;

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

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 短信渠道适配器
 *
 * <p>通过 REST 网关真实发送短信：POST JSON 到 {@code notification.sms.url}，
 * 携带 api-key/api-secret 鉴权头，正文含手机号、签名、内容。
 * 网关响应约定 {@code {"code":0,"msg":"..."}}，code=0 视为成功。
 * 未配置网关地址或密钥时 {@link #isAvailable()} 返回 false，投递方会跳过该渠道。
 */
@Component
public class SmsChannelAdapter implements ChannelAdapter {

    private static final Logger log = LoggerFactory.getLogger(SmsChannelAdapter.class);

    /** 收件人手机号：从收件人关联信息读取（当前 ChannelMessage 未携带手机号，用占位符由上层填充前仅记录） */
    private static final String PHONE_FIELD = "phone";

    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    @Value("${notification.sms.url:}")
    private String url;

    @Value("${notification.sms.api-key:}")
    private String apiKey;

    @Value("${notification.sms.api-secret:}")
    private String apiSecret;

    @Value("${notification.sms.sign-name:}")
    private String signName;

    public SmsChannelAdapter() {
        this.restClient = RestClient.builder().build();
        this.objectMapper = new ObjectMapper();
    }

    /**
     * 测试用构造：注入外部 builder（配合 MockRestServiceServer 绑定模拟网关）。
     */
    SmsChannelAdapter(RestClient.Builder restClientBuilder) {
        this(restClientBuilder, new ObjectMapper());
    }

    SmsChannelAdapter(RestClient.Builder restClientBuilder, ObjectMapper objectMapper) {
        this.restClient = restClientBuilder.build();
        this.objectMapper = objectMapper;
    }

    @Override
    public ChannelType getChannelType() {
        return ChannelType.SMS;
    }

    @Override
    public ChannelDeliveryResult send(ChannelMessage message) {
        if (!isAvailable()) {
            return ChannelDeliveryResult.failure("短信网关未配置（缺少 url/api-key）");
        }
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("phone", resolvePhone(message));
            body.put("signName", signName != null ? signName : "");
            body.put("content", message.getContent() != null ? message.getContent() : "");
            body.put("title", message.getTitle() != null ? message.getTitle() : "");
            body.put("messageId", message.getMessageId());
            if (message.getTemplateData() != null) {
                body.put("templateData", message.getTemplateData());
            }

            String json = restClient.post()
                    .uri(url)
                    .header("X-API-Key", apiKey)
                    .header("X-API-Secret", apiSecret)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(objectMapper.writeValueAsString(body))
                    .retrieve()
                    .body(String.class);

            return parseGatewayResponse(json);
        } catch (Exception e) {
            log.error("短信发送失败: messageId={}, error={}", message.getMessageId(), e.getMessage());
            return ChannelDeliveryResult.failure(e.getMessage());
        }
    }

    /**
     * 解析网关响应：{@code {"code":0,...}} 视为成功，其余为失败。
     * 容错解析：JSON 解析失败或字段缺失时按失败处理。
     */
    private ChannelDeliveryResult parseGatewayResponse(String json) {
        try {
            Map<String, Object> resp = objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
            Object code = resp.get("code");
            boolean ok = code != null && ("0".equals(String.valueOf(code)) || Integer.valueOf(0).equals(code));
            if (ok) {
                Object msgId = resp.get("messageId");
                return ChannelDeliveryResult.success(msgId != null ? String.valueOf(msgId) : "sms_" + System.currentTimeMillis());
            }
            Object msg = resp.get("msg");
            return ChannelDeliveryResult.failure("网关返回错误: " + (msg != null ? msg : json));
        } catch (Exception e) {
            return ChannelDeliveryResult.failure("网关响应解析失败: " + e.getMessage() + " body=" + json);
        }
    }

    /**
     * 解析收件人手机号：优先取 templateData/phone 或 data 中携带的手机号，
     * 缺失时返回空串并告警（上层需确保收件人手机号可获取，否则短信无法投递）。
     */
    private String resolvePhone(ChannelMessage message) {
        if (message.getTemplateData() != null) {
            Object phone = message.getTemplateData().get(PHONE_FIELD);
            if (phone != null && !String.valueOf(phone).isBlank()) {
                return String.valueOf(phone);
            }
        }
        log.warn("短信收件人手机号缺失: messageId={}, 请在 templateData 提供 phone 字段", message.getMessageId());
        return "";
    }

    @Override
    public boolean isAvailable() {
        return url != null && !url.isEmpty() && apiKey != null && !apiKey.isEmpty();
    }
}
