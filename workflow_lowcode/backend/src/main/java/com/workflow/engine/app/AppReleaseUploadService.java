package com.workflow.engine.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.AppReleaseResponse;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.app.entity.AppClient;
import com.workflow.engine.app.entity.AppRelease;
import com.workflow.engine.app.repository.AppClientRepository;
import com.workflow.engine.app.repository.AppReleaseRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * Release 体验版上传服务（Task 9.3，spec: app-release-pipeline「体验版上传」）。
 *
 * 小程序 Release 构建成功后，经 app-builder（Node 侧 miniprogram-ci）以「该 Client
 * 的 appid + 私钥」上传体验版并回传预览二维码。上传凭据全部取自该 Release 快照内
 * client.buildConfig（appid/privateKeyPath），MUST NOT 复用全局单例配置——同一租户
 * 内不同小程序客户端用各自凭证，互不影响（spec「小程序凭证多实例」上传侧先行；
 * 登录/推送多实例化见 Task 9.4）。
 *
 * 状态口径：上传成功 → UPLOADED + uploaded_qr_url；上传失败 → 保留已构建状态
 * （PUBLISHED/UPLOADED 不降级）并记录 error——构建产物并未失效，上传可重试。
 */
@Service
public class AppReleaseUploadService {

    private static final Logger log = LoggerFactory.getLogger(AppReleaseUploadService.class);

    /** V1 体验版上传仅支持小程序（uni build -p mp-weixin 产物） */
    private static final String MP_PLATFORM = "mp-weixin";
    /** 可上传的端类型（体验版只对小程序有意义） */
    private static final Set<String> MP_CLIENT_TYPES = Set.of("MP_WEIXIN");
    /** 可上传的 Release 状态：已构建成功（PUBLISHED）或已上传（UPLOADED，允许重传） */
    private static final Set<String> UPLOADABLE_STATUS = Set.of("PUBLISHED", "UPLOADED");

    private final AppReleaseRepository releaseRepository;
    private final AppClientRepository clientRepository;
    private final RestClient restClient;
    private final String appBuilderBaseUrl;
    private final TenantProvider tenantProvider;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AppReleaseUploadService(AppReleaseRepository releaseRepository,
                                   AppClientRepository clientRepository,
                                   RestClient.Builder restClientBuilder,
                                   @Value("${app-builder.base-url:http://localhost:5302}") String appBuilderBaseUrl,
                                   TenantProvider tenantProvider) {
        this.releaseRepository = releaseRepository;
        this.clientRepository = clientRepository;
        this.restClient = restClientBuilder.build();
        this.appBuilderBaseUrl = appBuilderBaseUrl;
        this.tenantProvider = tenantProvider;
    }

    /**
     * 上传体验版（同步）。成功回写 uploaded_qr_url + UPLOADED；失败记录 error 并
     * 保留已构建状态（可重试）。
     */
    @Transactional
    public AppReleaseResponse upload(String appId, String clientId, String releaseId) {
        String tenantId = tenantProvider.getTenantId();
        requireClient(appId, clientId, tenantId);
        AppRelease release = releaseRepository.findByIdAndTenantId(releaseId, tenantId)
                .orElseThrow(() -> new BusinessException(404, "发布快照不存在"));
        if (!release.getClientId().equals(clientId)) {
            throw new BusinessException(404, "发布快照不存在");
        }
        if (!UPLOADABLE_STATUS.contains(release.getStatus())) {
            throw new BusinessException(400, "构建成功后才能上传体验版（当前状态：" + release.getStatus() + "）");
        }

        JsonNode snapshot = parseSnapshot(release);
        String clientType = snapshot.path("client").path("type").asText(null);
        if (clientType == null || !MP_CLIENT_TYPES.contains(clientType)) {
            throw new BusinessException(400, "仅小程序客户端支持体验版上传（当前端类型：" + clientType + "）");
        }
        JsonNode buildConfig = snapshot.path("client").path("buildConfig");
        String appid = textOrNull(buildConfig, "appid");
        String privateKeyPath = textOrNull(buildConfig, "privateKeyPath");
        if (appid == null || privateKeyPath == null) {
            throw new BusinessException(400, "小程序上传凭据未配置：需在客户端构建配置提供 appid 与 privateKeyPath");
        }

        String version = release.getVersion() == null ? "1" : String.valueOf(release.getVersion());
        String desc = "体验版 v" + version;

        // 显式序列化成字符串体发送（同 HttpLogicExecutor / AppReleaseBuildService 手法）：
        // 避免消息转换器（Spring Boot 4 走 Jackson 3）对 payload 的意外再序列化。
        String jsonBody;
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("releaseId", release.getId());
            payload.put("platform", MP_PLATFORM);
            payload.put("appId", appid);
            payload.put("privateKeyPath", privateKeyPath);
            payload.put("version", version);
            payload.put("desc", desc);
            jsonBody = objectMapper.writeValueAsString(payload);
        } catch (Exception e) {
            throw new BusinessException(500, "上传请求序列化失败：" + e.getMessage());
        }

        try {
            String response = restClient.post()
                    .uri(appBuilderBaseUrl + "/upload")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(jsonBody)
                    .retrieve()
                    .body(String.class);

            JsonNode node = objectMapper.readTree(response == null ? "{}" : response);
            if (!node.path("ok").asBoolean(false)) {
                throw new BusinessException(500, node.path("error").asText("app-builder 返回失败"));
            }
            String qrUrl = node.path("qrUrl").asText(null);
            if (qrUrl == null || qrUrl.isBlank()) {
                throw new BusinessException(500, "app-builder 未返回二维码地址（qrUrl）");
            }
            release.setStatus("UPLOADED");
            release.setUploadedQrUrl(qrUrl);
            release.setError(null);
            releaseRepository.save(release);
            log.info("Release {} 体验版上传完成：{}", release.getId(), qrUrl);
        } catch (RestClientResponseException e) {
            // 4xx/5xx：从响应体提取 app-builder 的 error（{ok:false,error:...}），取不到回落原始报文
            String detail = extractBuilderError(e);
            recordUploadFailure(release, "app-builder 上传失败：" + detail);
            throw new BusinessException(500, "app-builder 上传失败：" + detail);
        } catch (BusinessException e) {
            recordUploadFailure(release, e.getMessage());
            throw e;
        } catch (Exception e) {
            String message = "app-builder 调用失败：" + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
            recordUploadFailure(release, message);
            throw new BusinessException(500, message);
        }
        return toResponse(release, appId);
    }

    // ---------------- internal ----------------

    private JsonNode parseSnapshot(AppRelease release) {
        try {
            return objectMapper.readTree(release.getSnapshotJson() == null ? "{}" : release.getSnapshotJson());
        } catch (Exception e) {
            throw new BusinessException(500, "发布快照解析失败：" + e.getMessage());
        }
    }

    private String textOrNull(JsonNode node, String field) {
        JsonNode value = node.path(field);
        String text = value.isMissingNode() || value.isNull() ? null : value.asText(null);
        return text == null || text.isBlank() ? null : text;
    }

    /** 上传失败：不推翻已构建状态与产物（可重试），只记录 error 供追溯。 */
    private void recordUploadFailure(AppRelease release, String message) {
        release.setError(message == null ? "未知错误" : (message.length() > 1000 ? message.substring(0, 1000) : message));
        releaseRepository.save(release);
    }

    /** 从 4xx/5xx 响应体提取 {ok:false,error:...} 的 error 字段；解析失败回落原始报文（截断）。 */
    private String extractBuilderError(RestClientResponseException e) {
        String body = e.getResponseBodyAsString();
        try {
            String error = objectMapper.readTree(body == null ? "{}" : body).path("error").asText(null);
            if (error != null && !error.isBlank()) {
                return error;
            }
        } catch (Exception ignored) {
            // 非 JSON 报文，走原始报文回落
        }
        String raw = body == null || body.isBlank() ? e.getMessage() : body;
        return raw.length() > 500 ? raw.substring(0, 500) : raw;
    }

    private void requireClient(String appId, String clientId, String tenantId) {
        AppClient client = clientRepository.findByIdAndTenantId(clientId, tenantId)
                .orElseThrow(() -> new BusinessException(404, "客户端不存在"));
        if (!client.getAppId().equals(appId)) {
            throw new BusinessException(404, "客户端不存在");
        }
    }

    private AppReleaseResponse toResponse(AppRelease release, String appId) {
        AppReleaseResponse vo = new AppReleaseResponse();
        vo.setId(release.getId());
        vo.setAppId(appId);
        vo.setClientId(release.getClientId());
        vo.setVersion(release.getVersion());
        vo.setSnapshotJson(release.getSnapshotJson());
        vo.setArtifactUrl(release.getArtifactUrl());
        vo.setUploadedQrUrl(release.getUploadedQrUrl());
        vo.setStatus(release.getStatus());
        vo.setError(release.getError());
        vo.setCreatedBy(release.getCreatedBy());
        vo.setCreatedAt(release.getCreatedAt());
        return vo;
    }
}