package com.workflow.system.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * 小程序 code2session 调用封装（P0.4）。
 *
 * <p>只做「code → openid/unionid」的换取与错误码翻译；绑定关系与登录态由
 * {@link com.workflow.system.service.impl.AuthServiceImpl} 负责。
 * 未配置 app-id/app-secret 时返回 503，避免把配置缺失伪装成微信拒绝。
 */
@Component
public class WechatMiniprogramClient {

    private static final Logger log = LoggerFactory.getLogger(WechatMiniprogramClient.class);
    private static final String DEFAULT_BASE_URL = "https://api.weixin.qq.com";

    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    @Value("${workflow.auth.miniprogram.app-id:}")
    private String appId;

    @Value("${workflow.auth.miniprogram.app-secret:}")
    private String appSecret;

    @Value("${workflow.auth.miniprogram.base-url:}")
    private String baseUrl;

    public WechatMiniprogramClient(RestClient.Builder restClientBuilder) {
        this.restClient = restClientBuilder.build();
        this.objectMapper = new ObjectMapper();
    }

    public record SessionInfo(String appId, String openid, String unionid) {
    }

    public SessionInfo code2Session(String code) {
        if (!isConfigured()) {
            throw new BusinessException(503, "小程序登录未配置（缺少 app-id/app-secret）");
        }
        String currentAppId = appId;
        String json;
        try {
            json = restClient.get()
                    .uri(baseUrl().concat("/sns/jscode2session")
                            .concat("?appid=").concat(encode(currentAppId))
                            .concat("&secret=").concat(encode(appSecret))
                            .concat("&js_code=").concat(encode(code))
                            .concat("&grant_type=authorization_code"))
                    .retrieve()
                    .body(String.class);
        } catch (Exception e) {
            log.error("小程序 code2session 请求失败: {}", e.getMessage());
            throw new BusinessException(502, "微信登录服务暂不可用");
        }
        return parse(currentAppId, json);
    }

    public boolean isConfigured() {
        return appId != null && !appId.isBlank() && appSecret != null && !appSecret.isBlank();
    }

    private SessionInfo parse(String currentAppId, String json) {
        Map<String, Object> resp;
        try {
            resp = objectMapper.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            log.error("小程序 code2session 响应解析失败: {}", e.getMessage());
            throw new BusinessException(502, "微信登录响应无法解析");
        }
        Object errcode = resp.get("errcode");
        if (errcode != null && !"0".equals(String.valueOf(errcode))) {
            String code = String.valueOf(errcode);
            String errmsg = resp.get("errmsg") == null ? "未知错误" : String.valueOf(resp.get("errmsg"));
            log.warn("小程序 code2session 失败: errcode={}, errmsg={}", code, errmsg);
            if ("40029".equals(code) || "40163".equals(code)) {
                throw new BusinessException(401, "微信登录凭证无效或已过期，请重试");
            }
            if ("40226".equals(code)) {
                throw new BusinessException(403, "该微信账号存在风险，暂无法登录");
            }
            throw new BusinessException(502, "微信登录失败: " + errmsg + "（" + code + "）");
        }
        Object openid = resp.get("openid");
        if (openid == null || String.valueOf(openid).isBlank()) {
            log.error("小程序 code2session 响应缺少 openid: {}", json);
            throw new BusinessException(502, "微信登录响应缺少 openid");
        }
        Object unionid = resp.get("unionid");
        return new SessionInfo(currentAppId, String.valueOf(openid),
                unionid == null || String.valueOf(unionid).isBlank() ? null : String.valueOf(unionid));
    }

    private String baseUrl() {
        return baseUrl != null && !baseUrl.isBlank() ? baseUrl : DEFAULT_BASE_URL;
    }

    private String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }
}
