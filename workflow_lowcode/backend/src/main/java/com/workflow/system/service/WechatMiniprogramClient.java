package com.workflow.system.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.app.entity.AppClient;
import com.workflow.engine.app.repository.AppClientRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 小程序 code2session 调用封装（P0.4 + Task 9.4 多实例化）。
 *
 * <p>只做「code → openid/unionid」的换取与错误码翻译；绑定关系与登录态由
 * {@link com.workflow.system.service.impl.AuthServiceImpl} 负责。
 * 未配置 app-id/app-secret 时返回 503，避免把配置缺失伪装成微信拒绝。
 *
 * <p><b>多实例（Task 9.4，spec: app-release-pipeline「小程序凭证多实例」）</b>：
 * 同一租户可存在多个小程序客户端（不同 appid）。本类提供三种按 Client 的凭证解析
 * ——{@link #forClient(AppClient)}（从 Client 的 buildConfig 解析）、
 * {@link #forClientId(String)}（租户内按 clientId）、
 * {@link #forAppId(String, String)}（租户内按 appId 取小程序客户端）——并以
 * {@link #code2Session(Credentials, String)} 用该 Client 凭证换取会话。
 * 不同 Client 的凭证互不影响；缺凭据时明确 503，绝不回落到别家凭证。
 * 全局 {@link #code2Session(String)} 保留，供单 appid 部署（P0.4）后向兼容。
 */
@Component
public class WechatMiniprogramClient {

    private static final Logger log = LoggerFactory.getLogger(WechatMiniprogramClient.class);
    private static final String DEFAULT_BASE_URL = "https://api.weixin.qq.com";
    /** 小程序端类型（多实例解析仅认这一种） */
    private static final Set<String> MP_CLIENT_TYPES = Set.of("MP_WEIXIN");

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    /** 按 Client 多实例解析所需（全局单 appid 场景可为空） */
    private final AppClientRepository clientRepository;
    private final TenantProvider tenantProvider;

    @Value("${workflow.auth.miniprogram.app-id:}")
    private String appId;

    @Value("${workflow.auth.miniprogram.app-secret:}")
    private String appSecret;

    @Value("${workflow.auth.miniprogram.base-url:}")
    private String baseUrl;

    /** 全局单 appid 部署 / 单测：仅全局 code2session，不启用按 Client 解析 */
    public WechatMiniprogramClient(RestClient.Builder restClientBuilder) {
        this(restClientBuilder, null, null);
    }

    /** Spring 注入：多实例解析需 AppClientRepository + TenantProvider */
    @Autowired
    public WechatMiniprogramClient(RestClient.Builder restClientBuilder,
                                   AppClientRepository clientRepository,
                                   TenantProvider tenantProvider) {
        this.restClient = restClientBuilder.build();
        this.objectMapper = new ObjectMapper();
        this.clientRepository = clientRepository;
        this.tenantProvider = tenantProvider;
    }

    public record SessionInfo(String appId, String openid, String unionid) {
    }

    /** 某 Client 的小程序凭证（多实例解析结果） */
    public record Credentials(String appId, String appSecret) {
    }

    /** 全局凭证换取会话（单 appid 部署后向兼容）。 */
    public SessionInfo code2Session(String code) {
        if (!isConfigured()) {
            throw new BusinessException(503, "小程序登录未配置（缺少 app-id/app-secret）");
        }
        return code2Session(appId, appSecret, code);
    }

    /** 以指定 Client 的凭证换取会话（多实例）。缺凭据 → 503（禁止回落别家凭证）。 */
    public SessionInfo code2Session(Credentials credentials, String code) {
        if (credentials == null || isBlank(credentials.appId()) || isBlank(credentials.appSecret())) {
            throw new BusinessException(503, "该客户端未配置小程序登录凭证（buildConfig.appid/appSecret）");
        }
        return code2Session(credentials.appId(), credentials.appSecret(), code);
    }

    public boolean isConfigured() {
        return !isBlank(appId) && !isBlank(appSecret);
    }

    // ---------------- 按 Client 凭证解析（Task 9.4） ----------------

    /**
     * 解析该 Client 的小程序凭证：取自 Client 的 buildConfig
     * （兼容 {@code appid}/{@code appId} 与 {@code appSecret}/{@code app-secret} 键名）。
     * 缺 appid 或 appSecret → 503（明确暴露配置缺失，不静默用全局配置顶替）。
     */
    public Credentials forClient(AppClient client) {
        if (client == null) {
            throw new BusinessException(404, "客户端不存在");
        }
        JsonNode buildConfig = parseBuildConfig(client);
        String clientAppId = firstNonBlank(text(buildConfig, "appid"), text(buildConfig, "appId"));
        String clientSecret = firstNonBlank(text(buildConfig, "appSecret"), text(buildConfig, "app-secret"));
        if (clientAppId == null || clientSecret == null) {
            throw new BusinessException(503,
                    "客户端未配置小程序凭证（buildConfig.appid/appSecret）：" + client.getId());
        }
        return new Credentials(clientAppId, clientSecret);
    }

    /** 租户内按 clientId 解析该 Client 的凭证；未知客户端 → 404。 */
    public Credentials forClientId(String clientId) {
        if (clientRepository == null) {
            throw new BusinessException(503, "未启用按客户端解析小程序凭证（缺少客户端仓库注入）");
        }
        AppClient client = clientRepository.findByIdAndTenantId(clientId, currentTenantId())
                .orElseThrow(() -> new BusinessException(404, "客户端不存在"));
        return forClient(client);
    }

    /** 租户内按 appId 解析小程序客户端的凭证；该应用下无小程序客户端 → 404。 */
    public Credentials forAppId(String tenantId, String appId) {
        if (clientRepository == null) {
            throw new BusinessException(503, "未启用按客户端解析小程序凭证（缺少客户端仓库注入）");
        }
        List<AppClient> clients = clientRepository.findByTenantIdAndAppIdOrderByCreatedAtAsc(tenantId, appId);
        AppClient mp = clients == null ? null : clients.stream()
                .filter(c -> c.getClientType() != null && MP_CLIENT_TYPES.contains(c.getClientType()))
                .findFirst()
                .orElse(null);
        if (mp == null) {
            throw new BusinessException(404, "该应用下未配置小程序客户端：" + appId);
        }
        return forClient(mp);
    }

    // ---------------- internal ----------------

    private SessionInfo code2Session(String effectiveAppId, String secret, String code) {
        String json;
        try {
            json = restClient.get()
                    .uri(baseUrl().concat("/sns/jscode2session")
                            .concat("?appid=").concat(encode(effectiveAppId))
                            .concat("&secret=").concat(encode(secret))
                            .concat("&js_code=").concat(encode(code))
                            .concat("&grant_type=authorization_code"))
                    .retrieve()
                    .body(String.class);
        } catch (Exception e) {
            log.error("小程序 code2session 请求失败: {}", e.getMessage());
            throw new BusinessException(502, "微信登录服务暂不可用");
        }
        return parse(effectiveAppId, json);
    }

    private JsonNode parseBuildConfig(AppClient client) {
        String raw = client.getBuildConfigJson();
        if (raw == null || raw.isBlank()) {
            return objectMapper.createObjectNode();
        }
        try {
            JsonNode node = objectMapper.readTree(raw);
            return node == null || !node.isObject() ? objectMapper.createObjectNode() : node;
        } catch (Exception e) {
            throw new BusinessException(503, "客户端构建配置无法解析（buildConfig）：" + client.getId());
        }
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) {
            return null;
        }
        String text = value.asText(null);
        return isBlank(text) ? null : text;
    }

    private String firstNonBlank(String first, String second) {
        return first != null ? first : second;
    }

    private String currentTenantId() {
        return tenantProvider == null ? null : tenantProvider.getTenantId();
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

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}