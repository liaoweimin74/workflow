package com.workflow.engine.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.AppReleaseResponse;
import com.workflow.api.dto.AppReleaseBuildRequest;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.app.entity.AppClient;
import com.workflow.engine.app.entity.AppRelease;
import com.workflow.engine.app.repository.AppClientRepository;
import com.workflow.engine.app.repository.AppReleaseRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.HashMap;
import java.util.Map;

/**
 * Release 构建触发与归档服务（Task 9.2，spec: app-release-pipeline「按 Client 构建」）。
 *
 * 状态机：CREATED/BUILT/FAILED → BUILDING →（app-builder 同步应答）PUBLISHED / FAILED。
 * 构建执行体在 app-builder（mini-services/app-builder，Node 侧）：
 * 接收 {releaseId, platform, buildConfig, files}，落盘 uni 工程并执行
 * `uni build -p mp-weixin | h5`，产物归档后回 {ok, artifactUrl}。
 * 后端职责：归属/状态校验 → 置 BUILDING → 转发 → 回写 artifact_url 与状态。
 * V1 触发为接口同步调用（spec 口径），异步化属后续演进。
 *
 * 快照消费：snapshot_json 由 9.1 固化（client.type/buildConfig + pages），
 * 构建按快照的 client 配置驱动——页面后续发版不影响已固化快照的构建内容。
 */
@Service
public class AppReleaseBuildService {

    private static final Logger log = LoggerFactory.getLogger(AppReleaseBuildService.class);

    /** 快照 client.type → app-builder 构建平台（uni build -p 值） */
    private static final Map<String, String> PLATFORM_BY_CLIENT_TYPE = Map.of(
            "MP_WEIXIN", "mp-weixin",
            "H5", "h5"
    );

    private final AppReleaseRepository releaseRepository;
    private final AppClientRepository clientRepository;
    private final RestClient restClient;
    private final String appBuilderBaseUrl;
    private final TenantProvider tenantProvider;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AppReleaseBuildService(AppReleaseRepository releaseRepository,
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
     * 触发构建（同步）。成功回写 artifact_url + PUBLISHED；任何失败置 FAILED
     * 并记录 error（已有 artifact_url 不清除——失败不影响历史产物）。
     */
    @Transactional
    public AppReleaseResponse build(String appId, String clientId, String releaseId, AppReleaseBuildRequest req) {
        String tenantId = tenantProvider.getTenantId();
        requireClient(appId, clientId, tenantId);
        AppRelease release = releaseRepository.findByIdAndTenantId(releaseId, tenantId)
                .orElseThrow(() -> new BusinessException(404, "发布快照不存在"));
        if (!release.getClientId().equals(clientId)) {
            throw new BusinessException(404, "发布快照不存在");
        }
        if ("BUILDING".equals(release.getStatus())) {
            throw new BusinessException(400, "构建进行中，请等待完成后再触发");
        }
        String platform = platformOf(release);
        if (platform == null) {
            throw new BusinessException(400, "该客户端端类型暂不支持构建（仅 MP_WEIXIN / H5）");
        }
        if (req == null || req.getFiles() == null || req.getFiles().isBlank()) {
            throw new BusinessException(400, "files 不能为空：构建需要前端出码产物（generatePageUni files）");
        }

        // 输入校验（含 files JSON 合法性）必须在 BUILDING 之前：格式错误直接 400，不留半途状态。
        // 同步链路里 BUILDING 只是过路状态；失败/成功都会立即离开它。
        // 先落 BUILDING 再调外部，进程崩溃时留 BUILDING 便于人工识别悬挂构建。
        String jsonBody;
        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("releaseId", release.getId());
            payload.put("platform", platform);
            payload.put("buildConfig", buildConfigOf(release));
            payload.put("files", objectMapper.readTree(req.getFiles()));
            // 自行序列化后以字符串体发送：payload 内含 Jackson 2 JsonNode，交给
            // HTTP 消息转换器（Spring Boot 4 默认 Jackson 3）会按 POJO 序列化成 {}，
            // buildConfig/files 被静默清空——显式序列化保证 wire 格式一致
            // （同 HttpLogicExecutor 的 RestClient 手法）。
            jsonBody = objectMapper.writeValueAsString(payload);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(400, "files 不是合法 JSON：" + e.getMessage());
        }

        release.setStatus("BUILDING");
        release.setError(null);
        releaseRepository.save(release);

        try {
            String response = restClient.post()
                    .uri(appBuilderBaseUrl + "/build")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(jsonBody)
                    .retrieve()
                    .body(String.class);

            JsonNode node = objectMapper.readTree(response == null ? "{}" : response);
            if (!node.path("ok").asBoolean(false)) {
                throw new BusinessException(500, node.path("error").asText("app-builder 返回失败"));
            }
            String artifactUrl = node.path("artifactUrl").asText(null);
            if (artifactUrl == null || artifactUrl.isBlank()) {
                throw new BusinessException(500, "app-builder 未返回产物地址（artifactUrl）");
            }
            release.setStatus("PUBLISHED");
            release.setArtifactUrl(artifactUrl);
            release.setError(null);
            releaseRepository.save(release);
            log.info("Release {} 构建完成（{}）：{}", release.getId(), platform, artifactUrl);
        } catch (RestClientResponseException e) {
            // 4xx/5xx：从响应体提取 app-builder 的 error（{ok:false,error:...}），取不到回落原始报文
            String detail = extractBuilderError(e);
            markFailed(release, "app-builder 构建失败：" + detail);
            throw new BusinessException(500, "app-builder 构建失败：" + detail);
        } catch (BusinessException e) {
            markFailed(release, e.getMessage());
            throw e;
        } catch (Exception e) {
            String message = "app-builder 调用失败：" + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
            markFailed(release, message);
            throw new BusinessException(500, message);
        }
        return toResponse(release, appId);
    }

    // ---------------- internal ----------------

    /** 从快照解析构建平台；MP_WEIXIN/H5 之外（WEB/APP）返回 null（不支持构建）。 */
    private String platformOf(AppRelease release) {
        try {
            JsonNode snapshot = objectMapper.readTree(release.getSnapshotJson() == null ? "{}" : release.getSnapshotJson());
            String clientType = snapshot.path("client").path("type").asText(null);
            return clientType == null ? null : PLATFORM_BY_CLIENT_TYPE.get(clientType);
        } catch (Exception e) {
            throw new BusinessException(500, "发布快照解析失败：" + e.getMessage());
        }
    }

    /** 快照里的 client.buildConfig 原样转发（appid/域名等，app-builder 按平台取用）。 */
    private Object buildConfigOf(AppRelease release) throws Exception {
        JsonNode snapshot = objectMapper.readTree(release.getSnapshotJson());
        JsonNode buildConfig = snapshot.path("client").path("buildConfig");
        return buildConfig.isMissingNode() || buildConfig.isNull() ? null : buildConfig;
    }

    private void markFailed(AppRelease release, String message) {
        release.setStatus("FAILED");
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
