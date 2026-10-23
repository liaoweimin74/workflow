package com.workflow.engine.page;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.app.entity.AppDefinition;
import com.workflow.engine.app.repository.AppDefinitionRepository;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.engine.page.repository.PageDefinitionRepository;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 页面服务层 app 维度测试（Task 1.4）。
 *
 * 覆盖（spec: custom-page-designer MODIFIED「自定义页面创建与保存」）：
 * - 创建携带应用上下文：页面落指定 app_id
 * - key 唯一性按 (tenant_id, app_id, key, version)：同 app 同 key 拒绝、跨 app 同 key 允许
 * - 未显式指定应用：落当前租户「默认应用」（code=default；缺失时自动创建）——存量调用方式兼容
 * - 列表按 app 过滤；不传 app 保持租户级行为不变
 */
class PageDefinitionServiceTest {

    private static final String TENANT = "t1";

    private PageDefinitionRepository pageDefRepo;
    private AppDefinitionRepository appRepo;
    private PageDefinitionService service;

    @BeforeEach
    void setUp() {
        pageDefRepo = mock(PageDefinitionRepository.class);
        appRepo = mock(AppDefinitionRepository.class);
        PageValidator validator = mock(PageValidator.class);
        service = new PageDefinitionService(pageDefRepo, appRepo, new TenantProvider(), validator,
                new ObjectMapper());
        TenantContext.setTenantId(TENANT);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    // ---------- 创建携带应用上下文 ----------

    @Test
    void create_withAppId_landsInGivenApp() {
        when(appRepo.findByIdAndTenantId("a1", TENANT)).thenReturn(Optional.of(app("a1")));
        when(pageDefRepo.existsByTenantIdAndAppIdAndKey(TENANT, "a1", "order-list")).thenReturn(false);
        when(pageDefRepo.save(any(PageDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        PageDefinition result = service.create("a1", "订单列表", "order-list", "PAGE", null, null, null);

        assertThat(result.getAppId()).isEqualTo("a1");
        // key 唯一性走 app 维度判定口径
        verify(pageDefRepo).existsByTenantIdAndAppIdAndKey(TENANT, "a1", "order-list");
    }

    @Test
    void create_crossAppSameKey_allowed() {
        when(appRepo.findByIdAndTenantId("a2", TENANT)).thenReturn(Optional.of(app("a2")));
        // a1 下已有同 key 页面，但唯一性按 (tenant, app, key) 判定 → a2 下可创建
        when(pageDefRepo.existsByTenantIdAndAppIdAndKey(TENANT, "a2", "order-list")).thenReturn(false);
        when(pageDefRepo.save(any(PageDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        PageDefinition result = service.create("a2", "订单列表", "order-list", "PAGE", null, null, null);

        assertThat(result.getAppId()).isEqualTo("a2");
    }

    @Test
    void create_sameAppDuplicateKey_rejected400() {
        when(appRepo.findByIdAndTenantId("a1", TENANT)).thenReturn(Optional.of(app("a1")));
        when(pageDefRepo.existsByTenantIdAndAppIdAndKey(TENANT, "a1", "order-list")).thenReturn(true);

        assertThatThrownBy(() -> service.create("a1", "订单列表", "order-list", "PAGE", null, null, null))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(400))
                .hasMessageContaining("页面 key 已存在");
    }

    @Test
    void create_unknownApp_rejected400() {
        when(appRepo.findByIdAndTenantId("a-ghost", TENANT)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.create("a-ghost", "订单列表", "order-list", "PAGE", null, null, null))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(400))
                .hasMessageContaining("应用不存在");
    }

    // ---------- 未指定应用 → 默认应用兼容路径 ----------

    @Test
    void create_withoutApp_fallsToDefaultApp() {
        when(appRepo.findByTenantIdAndCode(TENANT, "default")).thenReturn(Optional.of(app("default-app-1")));
        when(pageDefRepo.existsByTenantIdAndAppIdAndKey(TENANT, "default-app-1", "p1")).thenReturn(false);
        when(pageDefRepo.save(any(PageDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        PageDefinition result = service.create(null, "页面", "p1", "PAGE", null, null, null);

        assertThat(result.getAppId()).isEqualTo("default-app-1");
    }

    @Test
    void create_withoutAppAndNoDefaultApp_createsDefaultApp() {
        when(appRepo.findByTenantIdAndCode(TENANT, "default")).thenReturn(Optional.empty());
        when(appRepo.save(any(AppDefinition.class))).thenAnswer(inv -> inv.getArgument(0));
        when(pageDefRepo.existsByTenantIdAndAppIdAndKey(eq(TENANT), anyString(), eq("p1"))).thenReturn(false);
        when(pageDefRepo.save(any(PageDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        PageDefinition result = service.create(null, "页面", "p1", "PAGE", null, null, null);

        ArgumentCaptor<AppDefinition> appCaptor = ArgumentCaptor.forClass(AppDefinition.class);
        verify(appRepo).save(appCaptor.capture());
        assertThat(appCaptor.getValue().getCode()).isEqualTo("default");
        assertThat(appCaptor.getValue().getName()).isEqualTo("默认应用");
        assertThat(appCaptor.getValue().getTenantId()).isEqualTo(TENANT);
        assertThat(result.getAppId()).isEqualTo(appCaptor.getValue().getId());
    }

    // ---------- 列表按 app 过滤 ----------

    @Test
    void list_byApp_returnsAppScopedPages() {
        Pageable pageable = PageRequest.of(0, 20);
        when(pageDefRepo.findByTenantIdAndAppIdOrderByUpdatedAtDesc(TENANT, "a1", pageable))
                .thenReturn(new PageImpl<>(List.of()));

        service.list("a1", null, null, null, pageable);

        verify(pageDefRepo).findByTenantIdAndAppIdOrderByUpdatedAtDesc(TENANT, "a1", pageable);
    }

    @Test
    void list_byAppWithName_combinesFilters() {
        Pageable pageable = PageRequest.of(0, 20);
        when(pageDefRepo.findByTenantIdAndAppIdAndNameContainingOrderByUpdatedAtDesc(TENANT, "a1", "订单", pageable))
                .thenReturn(new PageImpl<>(List.of()));

        service.list("a1", null, "订单", null, pageable);

        verify(pageDefRepo).findByTenantIdAndAppIdAndNameContainingOrderByUpdatedAtDesc(TENANT, "a1", "订单", pageable);
    }

    @Test
    void list_withoutApp_keepsLegacyTenantScope() {
        Pageable pageable = PageRequest.of(0, 20);
        when(pageDefRepo.findByTenantIdOrderByUpdatedAtDesc(TENANT, pageable)).thenReturn(new PageImpl<>(List.of()));

        service.list(null, null, null, null, pageable);

        verify(pageDefRepo).findByTenantIdOrderByUpdatedAtDesc(TENANT, pageable);
    }

    // ---------- fixtures ----------

    private AppDefinition app(String id) {
        AppDefinition entity = new AppDefinition();
        entity.setId(id);
        entity.setTenantId(TENANT);
        entity.setCode(id.equals("default-app-1") ? "default" : "code-" + id);
        entity.setName(id.equals("default-app-1") ? "默认应用" : "应用-" + id);
        return entity;
    }
}
