package com.workflow.engine.app;

import com.workflow.api.dto.AppClientResponse;
import com.workflow.api.dto.AppClientSaveRequest;
import com.workflow.api.dto.AppResponse;
import com.workflow.api.dto.AppSaveRequest;
import com.workflow.api.dto.PageResponse;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.app.entity.AppClient;
import com.workflow.engine.app.entity.AppDefinition;
import com.workflow.engine.app.repository.AppClientRepository;
import com.workflow.engine.app.repository.AppDefinitionRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * 多端应用模型服务：App / Client CRUD。
 *
 * - 租户归属从 TenantContext 解析（X-Tenant-Id），跨租户访问按 404 处理；
 * - App code 租户内唯一（uk_app_tenant_code），创建后不可变更；
 * - client_type 白名单 WEB / MP_WEIXIN / H5 / APP，render_mode 按端类型推导
 *   （WEB → RUNTIME，其余 → CODEGEN，见 design D4）；
 * - Client 唯一键 uk_client(tenant_id, app_id, client_type, name)，
 *   同一 App 同一端类型允许多个 Client（不同名称）。
 *
 * 页面分配（启用清单）方法在 Task 1.3 扩展。
 */
@Service
public class AppModelService {

    /** 端类型白名单（spec: app-client-model「应用与客户端实例建模」） */
    private static final Set<String> CLIENT_TYPES = Set.of("WEB", "MP_WEIXIN", "H5", "APP");

    private static final String RENDER_RUNTIME = "RUNTIME";
    private static final String RENDER_CODEGEN = "CODEGEN";
    private static final String CLIENT_TYPE_WEB = "WEB";

    private final AppDefinitionRepository appRepository;
    private final AppClientRepository clientRepository;
    private final TenantProvider tenantProvider;

    public AppModelService(AppDefinitionRepository appRepository,
                           AppClientRepository clientRepository,
                           TenantProvider tenantProvider) {
        this.appRepository = appRepository;
        this.clientRepository = clientRepository;
        this.tenantProvider = tenantProvider;
    }

    // ---------------- App ----------------

    public AppResponse createApp(AppSaveRequest req) {
        if (req.getCode() == null || req.getCode().isBlank()) {
            throw new BusinessException(400, "应用编码不能为空");
        }
        if (req.getName() == null || req.getName().isBlank()) {
            throw new BusinessException(400, "应用名称不能为空");
        }
        String tenantId = tenantProvider.getTenantId();
        if (appRepository.existsByTenantIdAndCode(tenantId, req.getCode())) {
            throw new BusinessException(400, "应用编码已存在: " + req.getCode());
        }
        AppDefinition app = new AppDefinition();
        app.setId(newId());
        app.setTenantId(tenantId);
        app.setCode(req.getCode());
        app.setName(req.getName());
        app.setThemeJson(req.getThemeJson());
        appRepository.save(app);
        return toResponse(app);
    }

    public AppResponse getApp(String appId) {
        return toResponse(requireApp(appId));
    }

    /**
     * 更新应用（name/themeJson）。code 不可变更：请求中的 code 字段被忽略。
     */
    public AppResponse updateApp(String appId, AppSaveRequest req) {
        AppDefinition app = requireApp(appId);
        if (req.getName() != null && !req.getName().isBlank()) {
            app.setName(req.getName());
        }
        if (req.getThemeJson() != null) {
            app.setThemeJson(req.getThemeJson());
        }
        appRepository.save(app);
        return toResponse(app);
    }

    public void deleteApp(String appId) {
        AppDefinition app = requireApp(appId);
        if (!clientRepository.findByTenantIdAndAppIdOrderByCreatedAtAsc(app.getTenantId(), appId).isEmpty()) {
            throw new BusinessException(400, "请先删除该应用下的客户端实例");
        }
        appRepository.delete(app);
    }

    public PageResponse<AppResponse> listApps(String keyword, int page, int size) {
        String tenantId = tenantProvider.getTenantId();
        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.max(size, 1),
                Sort.by(Sort.Direction.DESC, "updatedAt"));
        boolean hasKeyword = keyword != null && !keyword.isBlank();
        Page<AppDefinition> result = hasKeyword
                ? appRepository.findByTenantIdAndNameContainingOrderByUpdatedAtDesc(tenantId, keyword.trim(), pageable)
                : appRepository.findByTenantIdOrderByUpdatedAtDesc(tenantId, pageable);
        List<AppResponse> content = result.getContent().stream().map(this::toResponse).toList();
        return new PageResponse<>(content, result.getNumber(), result.getSize(), result.getTotalElements());
    }

    // ---------------- Client ----------------

    public AppClientResponse createClient(String appId, AppClientSaveRequest req) {
        AppDefinition app = requireApp(appId);
        if (req.getClientType() == null || !CLIENT_TYPES.contains(req.getClientType())) {
            throw new BusinessException(400, "不支持的端类型: " + req.getClientType()
                    + "（允许 WEB / MP_WEIXIN / H5 / APP）");
        }
        if (req.getName() == null || req.getName().isBlank()) {
            throw new BusinessException(400, "客户端名称不能为空");
        }
        if (clientRepository.existsByTenantIdAndAppIdAndClientTypeAndName(
                app.getTenantId(), appId, req.getClientType(), req.getName())) {
            throw new BusinessException(400, "同端类型同名客户端已存在: " + req.getName());
        }
        AppClient client = new AppClient();
        client.setId(newId());
        client.setTenantId(app.getTenantId());
        client.setAppId(appId);
        client.setClientType(req.getClientType());
        client.setName(req.getName());
        client.setRenderMode(CLIENT_TYPE_WEB.equals(req.getClientType()) ? RENDER_RUNTIME : RENDER_CODEGEN);
        client.setBuildConfigJson(req.getBuildConfigJson());
        client.setNavigationJson(req.getNavigationJson());
        clientRepository.save(client);
        return toResponse(client);
    }

    public List<AppClientResponse> listClients(String appId) {
        AppDefinition app = requireApp(appId);
        return clientRepository.findByTenantIdAndAppIdOrderByCreatedAtAsc(app.getTenantId(), appId)
                .stream().map(this::toResponse).toList();
    }

    /**
     * 更新客户端（name/buildConfigJson/navigationJson）。clientType 不可变更：请求中的 clientType 被忽略。
     */
    public AppClientResponse updateClient(String appId, String clientId, AppClientSaveRequest req) {
        AppClient client = requireClient(appId, clientId);
        if (req.getName() != null && !req.getName().isBlank()) {
            client.setName(req.getName());
        }
        if (req.getBuildConfigJson() != null) {
            client.setBuildConfigJson(req.getBuildConfigJson());
        }
        if (req.getNavigationJson() != null) {
            client.setNavigationJson(req.getNavigationJson());
        }
        clientRepository.save(client);
        return toResponse(client);
    }

    public void deleteClient(String appId, String clientId) {
        AppClient client = requireClient(appId, clientId);
        clientRepository.delete(client);
    }

    // ---------------- internal ----------------

    private AppDefinition requireApp(String appId) {
        String tenantId = tenantProvider.getTenantId();
        return appRepository.findByIdAndTenantId(appId, tenantId)
                .orElseThrow(() -> new BusinessException(404, "应用不存在"));
    }

    /**
     * 客户端归属校验：租户内存在且属于指定 App（跨应用访问按 404 处理）。
     */
    private AppClient requireClient(String appId, String clientId) {
        String tenantId = tenantProvider.getTenantId();
        AppClient client = clientRepository.findByIdAndTenantId(clientId, tenantId)
                .orElseThrow(() -> new BusinessException(404, "客户端不存在"));
        if (!client.getAppId().equals(appId)) {
            throw new BusinessException(404, "客户端不存在");
        }
        return client;
    }

    private String newId() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    private AppResponse toResponse(AppDefinition app) {
        AppResponse vo = new AppResponse();
        vo.setId(app.getId());
        vo.setTenantId(app.getTenantId());
        vo.setCode(app.getCode());
        vo.setName(app.getName());
        vo.setThemeJson(app.getThemeJson());
        vo.setStatus(app.getStatus());
        vo.setCreatedAt(app.getCreatedAt());
        vo.setUpdatedAt(app.getUpdatedAt());
        return vo;
    }

    private AppClientResponse toResponse(AppClient client) {
        AppClientResponse vo = new AppClientResponse();
        vo.setId(client.getId());
        vo.setAppId(client.getAppId());
        vo.setClientType(client.getClientType());
        vo.setName(client.getName());
        vo.setRenderMode(client.getRenderMode());
        vo.setBuildConfigJson(client.getBuildConfigJson());
        vo.setNavigationJson(client.getNavigationJson());
        vo.setStatus(client.getStatus());
        vo.setCreatedAt(client.getCreatedAt());
        vo.setUpdatedAt(client.getUpdatedAt());
        return vo;
    }
}
