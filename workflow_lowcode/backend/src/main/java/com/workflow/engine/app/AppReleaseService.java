package com.workflow.engine.app;

import com.workflow.api.dto.AppReleaseResponse;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.app.entity.AppClient;
import com.workflow.engine.app.entity.AppClientPage;
import com.workflow.engine.app.entity.AppRelease;
import com.workflow.engine.app.repository.AppClientPageRepository;
import com.workflow.engine.app.repository.AppClientRepository;
import com.workflow.engine.app.repository.AppReleaseRepository;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.engine.page.repository.PageDefinitionRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * 发布快照服务（Task 9.1，spec: app-release-pipeline「AppRelease 发布快照」）。
 *
 * 创建 Release 时固化该 Client 启用清单中各页面的 published_version（快照），
 * Release 一经创建不可原地变更——本服务只提供 create/get/list，刻意不提供
 * update：定义更新后的重新发布通过新建 Release（version 递增）表达，
 * 历史 Release 的内容与构建产物因此可回溯。
 *
 * 快照 JSON 形状（与 uni 出码 client/pages 消费对齐，Task 9.2 构建直接吃快照）：
 * { client: {...构建配置}, pages: [{ key, pageId, title, publishedVersion, nav }] }
 * 其中 key 取页面 PageDefinition.key（出码 pageKey 同源），nav 为启用清单
 * 条目级导航配置原样并入。
 */
@Service
public class AppReleaseService {

    private final AppClientRepository clientRepository;
    private final AppClientPageRepository clientPageRepository;
    private final AppReleaseRepository releaseRepository;
    private final PageDefinitionRepository pageDefRepository;
    private final TenantProvider tenantProvider;

    public AppReleaseService(AppClientRepository clientRepository,
                             AppClientPageRepository clientPageRepository,
                             AppReleaseRepository releaseRepository,
                             PageDefinitionRepository pageDefRepository,
                             TenantProvider tenantProvider) {
        this.clientRepository = clientRepository;
        this.clientPageRepository = clientPageRepository;
        this.releaseRepository = releaseRepository;
        this.pageDefRepository = pageDefRepository;
        this.tenantProvider = tenantProvider;
    }

    /**
     * 创建发布快照：Client 归属校验 → 启用清单读取（空清单拒绝）→
     * 逐页固化 publishedVersion（未发布拒绝）→ version = Client 内最新 +1 → 落库。
     */
    @Transactional
    public AppReleaseResponse create(String appId, String clientId) {
        String tenantId = tenantProvider.getTenantId();
        AppClient client = clientRepository.findByIdAndTenantId(clientId, tenantId)
                .orElseThrow(() -> new BusinessException(404, "客户端不存在"));
        if (!client.getAppId().equals(appId)) {
            throw new BusinessException(404, "客户端不存在");
        }

        List<AppClientPage> assigned = clientPageRepository.findByTenantIdAndClientIdOrderBySortAsc(tenantId, clientId);
        if (assigned.isEmpty()) {
            throw new BusinessException(400, "客户端页面启用清单为空，无法创建发布快照");
        }

        StringBuilder pagesJson = new StringBuilder("[");
        for (int i = 0; i < assigned.size(); i++) {
            AppClientPage row = assigned.get(i);
            PageDefinition page = pageDefRepository.findByIdAndTenantId(row.getPageId(), tenantId)
                    .orElseThrow(() -> new BusinessException(400, "页面不存在: " + row.getPageId()));
            if (page.getPublishedVersion() == null) {
                throw new BusinessException(400, "页面未发布，无法纳入发布快照: " + page.getKey());
            }
            if (i > 0) {
                pagesJson.append(',');
            }
            pagesJson.append("{\"key\":\"").append(escape(page.getKey()))
                    .append("\",\"pageId\":\"").append(escape(page.getId()))
                    .append("\",\"title\":\"").append(escape(page.getName()))
                    .append("\",\"publishedVersion\":").append(page.getPublishedVersion())
                    .append(",\"nav\":").append(row.getNavConfigJson() == null || row.getNavConfigJson().isBlank()
                            ? "null" : row.getNavConfigJson())
                    .append('}');
        }
        pagesJson.append(']');

        // 快照整体：构建配置 + 页面清单（构建链路按 client.buildConfig + pages 两段消费）
        String snapshotJson = "{\"client\":{\"id\":\"" + escape(client.getId())
                + "\",\"type\":\"" + escape(client.getClientType())
                + "\",\"name\":\"" + escape(client.getName())
                + "\",\"buildConfig\":" + (client.getBuildConfigJson() == null || client.getBuildConfigJson().isBlank()
                        ? "null" : client.getBuildConfigJson())
                + ",\"navigation\":" + (client.getNavigationJson() == null || client.getNavigationJson().isBlank()
                        ? "null" : client.getNavigationJson())
                + "},\"pages\":" + pagesJson + "}";

        int nextVersion = releaseRepository.findFirstByClientIdOrderByVersionDesc(clientId)
                .map(last -> last.getVersion() == null ? 1 : last.getVersion() + 1)
                .orElse(1);

        AppRelease release = new AppRelease();
        release.setId(newId());
        release.setTenantId(tenantId);
        release.setClientId(clientId);
        release.setVersion(nextVersion);
        release.setSnapshotJson(snapshotJson);
        release.setStatus("CREATED");
        releaseRepository.save(release);
        return toResponse(release, appId);
    }

    /** 查询单个快照（Client 归属校验；跨租户/跨 Client 访问按 404 处理）。 */
    public AppReleaseResponse get(String appId, String clientId, String releaseId) {
        String tenantId = tenantProvider.getTenantId();
        requireClientOf(appId, clientId, tenantId);
        AppRelease release = releaseRepository.findByIdAndTenantId(releaseId, tenantId)
                .orElseThrow(() -> new BusinessException(404, "发布快照不存在"));
        if (!release.getClientId().equals(clientId)) {
            throw new BusinessException(404, "发布快照不存在");
        }
        return toResponse(release, appId);
    }

    /** 快照列表（version 降序，历史 Release 记录保留可查）。 */
    public List<AppReleaseResponse> list(String appId, String clientId) {
        String tenantId = tenantProvider.getTenantId();
        requireClientOf(appId, clientId, tenantId);
        return releaseRepository.findByTenantIdAndClientIdOrderByVersionDesc(tenantId, clientId)
                .stream()
                .map(release -> toResponse(release, appId))
                .toList();
    }

    // ---------------- internal ----------------

    private void requireClientOf(String appId, String clientId, String tenantId) {
        AppClient client = clientRepository.findByIdAndTenantId(clientId, tenantId)
                .orElseThrow(() -> new BusinessException(404, "客户端不存在"));
        if (!client.getAppId().equals(appId)) {
            throw new BusinessException(404, "客户端不存在");
        }
    }

    /**
     * 快照 JSON 字符串值转义（pageKey/pageName 来自用户输入，避免注入破坏 JSON 结构）。
     * 只处理 JSON 字符串字面量内的必转义字符（控制字符不至于出现在合法 key/name 中）。
     */
    private String escape(String raw) {
        if (raw == null) {
            return "";
        }
        return raw.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private String newId() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    private AppReleaseResponse toResponse(AppRelease release, String appId) {
        AppReleaseResponse vo = new AppReleaseResponse();
        vo.setId(release.getId());
        vo.setAppId(appId);
        vo.setClientId(release.getClientId());
        vo.setVersion(release.getVersion());
        vo.setSnapshotJson(release.getSnapshotJson());
        vo.setArtifactUrl(release.getArtifactUrl());
        vo.setStatus(release.getStatus());
        vo.setCreatedBy(release.getCreatedBy());
        vo.setCreatedAt(release.getCreatedAt());
        return vo;
    }
}
