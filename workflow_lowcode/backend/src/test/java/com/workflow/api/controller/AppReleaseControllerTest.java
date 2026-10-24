package com.workflow.api.controller;

import com.workflow.api.dto.AppReleaseCreateRequest;
import com.workflow.api.dto.AppReleaseResponse;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.app.AppReleaseService;
import com.workflow.engine.app.entity.AppClient;
import com.workflow.engine.app.entity.AppClientPage;
import com.workflow.engine.app.entity.AppRelease;
import com.workflow.engine.app.repository.AppClientPageRepository;
import com.workflow.engine.app.repository.AppClientRepository;
import com.workflow.engine.app.repository.AppReleaseRepository;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.engine.page.repository.PageDefinitionRepository;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * AppRelease 快照 API 测试（Task 9.1）。
 *
 * 直调控制器（真实 AppReleaseService + mock 仓储），覆盖 spec app-release-pipeline
 * 「AppRelease 发布快照」的三条口径：
 * - 快照固化页面版本：创建时读启用清单各页 published_version 写 snapshot_json；
 * - 不可原地变更：无更新接口，重发布 = 新 Release（version 递增）；
 * - 跨租户 404 / 未发布页面拒绝 / 空启用清单拒绝。
 */
class AppReleaseControllerTest {

    private static final String TENANT = "t1";
    private static final String APP_ID = "app1";
    private static final String CLIENT_ID = "client1";
    private static final String PAGE_A = "pageA";
    private static final String PAGE_B = "pageB";

    private AppClientRepository clientRepo;
    private AppClientPageRepository clientPageRepo;
    private AppReleaseRepository releaseRepo;
    private PageDefinitionRepository pageDefRepo;
    private AppReleaseController controller;

    @BeforeEach
    void setUp() {
        clientRepo = mock(AppClientRepository.class);
        clientPageRepo = mock(AppClientPageRepository.class);
        releaseRepo = mock(AppReleaseRepository.class);
        pageDefRepo = mock(PageDefinitionRepository.class);
        AppReleaseService service = new AppReleaseService(
                clientRepo, clientPageRepo, releaseRepo, pageDefRepo, new TenantProvider());
        controller = new AppReleaseController(service);
        TenantContext.setTenantId(TENANT);

        when(clientRepo.findByIdAndTenantId(CLIENT_ID, TENANT)).thenReturn(Optional.of(client()));
        when(releaseRepo.findFirstByClientIdOrderByVersionDesc(CLIENT_ID)).thenReturn(Optional.empty());
        when(releaseRepo.save(any(AppRelease.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    // ---------- 快照固化页面版本 ----------

    @Test
    void createRelease_snapshotsPublishedVersions() {
        AppClientPage itemA = pageItem("row1", PAGE_A, 0);
        AppClientPage itemB = pageItem("row2", PAGE_B, 1);
        when(clientPageRepo.findByTenantIdAndClientIdOrderBySortAsc(TENANT, CLIENT_ID))
                .thenReturn(List.of(itemA, itemB));
        when(pageDefRepo.findByIdAndTenantId(PAGE_A, TENANT)).thenReturn(Optional.of(publishedPage(PAGE_A, "页面A", 3)));
        when(pageDefRepo.findByIdAndTenantId(PAGE_B, TENANT)).thenReturn(Optional.of(publishedPage(PAGE_B, "页面B", 1)));

        R<AppReleaseResponse> result = controller.create(APP_ID, CLIENT_ID, new AppReleaseCreateRequest());

        assertThat(result.getCode()).isEqualTo(200);
        assertThat(result.getData().getVersion()).isEqualTo(1);
        assertThat(result.getData().getStatus()).isEqualTo("CREATED");
        assertThat(result.getData().getSnapshotJson()).isNotBlank();

        ArgumentCaptor<AppRelease> captor = ArgumentCaptor.forClass(AppRelease.class);
        verify(releaseRepo).save(captor.capture());
        AppRelease saved = captor.getValue();
        assertThat(saved.getClientId()).isEqualTo(CLIENT_ID);
        assertThat(saved.getTenantId()).isEqualTo(TENANT);
        // 快照 JSON 固化 pageKey → publishedVersion（含导航配置），此后页面发布 v4 不影响它
        assertThat(saved.getSnapshotJson())
                .contains("\"key\":\"pageA\"").contains("\"publishedVersion\":3")
                .contains("\"key\":\"pageB\"").contains("\"publishedVersion\":1")
                .contains("\"nav\"");
    }

    @Test
    void createRelease_versionIncrementsPerClient() {
        AppRelease last = new AppRelease();
        last.setVersion(4);
        when(releaseRepo.findFirstByClientIdOrderByVersionDesc(CLIENT_ID)).thenReturn(Optional.of(last));
        when(clientPageRepo.findByTenantIdAndClientIdOrderBySortAsc(TENANT, CLIENT_ID))
                .thenReturn(List.of(pageItem("row1", PAGE_A, 0)));
        when(pageDefRepo.findByIdAndTenantId(PAGE_A, TENANT)).thenReturn(Optional.of(publishedPage(PAGE_A, "页面A", 4)));

        R<AppReleaseResponse> result = controller.create(APP_ID, CLIENT_ID, new AppReleaseCreateRequest());

        assertThat(result.getData().getVersion()).isEqualTo(5);
    }

    @Test
    void createRelease_snapshotIsImmutable_noUpdatePath() {
        // 快照一经创建 MUST NOT 原地变更：服务只提供 create/get/list，不提供 update。
        // 这里以反射锁死接口面，防止后续顺手加 setter 式更新方法破坏 spec。
        assertThat(AppReleaseService.class.getMethods())
                .extracting(java.lang.reflect.Method::getName)
                .filteredOn(n -> n.toLowerCase().contains("update"))
                .isEmpty();
    }

    // ---------- 校验与边界 ----------

    @Test
    void createRelease_unpublishedPage_rejected400() {
        when(clientPageRepo.findByTenantIdAndClientIdOrderBySortAsc(TENANT, CLIENT_ID))
                .thenReturn(List.of(pageItem("row1", PAGE_A, 0)));
        // 启用清单里的页面还没有 PUBLISHED 版本
        when(pageDefRepo.findByIdAndTenantId(PAGE_A, TENANT))
                .thenReturn(Optional.of(publishedPage(PAGE_A, "页面A", null)));

        assertThatThrownBy(() -> controller.create(APP_ID, CLIENT_ID, new AppReleaseCreateRequest()))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(400))
                .hasMessageContaining("页面未发布");
        verify(releaseRepo, org.mockito.Mockito.never()).save(any());
    }

    @Test
    void createRelease_emptyPageList_rejected400() {
        when(clientPageRepo.findByTenantIdAndClientIdOrderBySortAsc(TENANT, CLIENT_ID))
                .thenReturn(List.of());

        assertThatThrownBy(() -> controller.create(APP_ID, CLIENT_ID, new AppReleaseCreateRequest()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("启用清单为空");
    }

    @Test
    void createRelease_clientOfOtherApp_404() {
        AppClient other = client();
        other.setAppId("appOther");
        when(clientRepo.findByIdAndTenantId(CLIENT_ID, TENANT)).thenReturn(Optional.of(other));

        assertThatThrownBy(() -> controller.create(APP_ID, CLIENT_ID, new AppReleaseCreateRequest()))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(404));
    }

    @Test
    void createRelease_clientMissing_404() {
        when(clientRepo.findByIdAndTenantId(CLIENT_ID, TENANT)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller.create(APP_ID, CLIENT_ID, new AppReleaseCreateRequest()))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(404));
    }

    // ---------- 查询 ----------

    @Test
    void getRelease_crossTenant_404() {
        when(releaseRepo.findByIdAndTenantId("rel1", TENANT)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller.get(APP_ID, CLIENT_ID, "rel1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(404));
    }

    @Test
    void getRelease_returnsSnapshot() {
        AppRelease release = new AppRelease();
        release.setId("rel1");
        release.setTenantId(TENANT);
        release.setClientId(CLIENT_ID);
        release.setVersion(2);
        release.setStatus("CREATED");
        release.setSnapshotJson("{\"pages\":[]}");
        when(releaseRepo.findByIdAndTenantId("rel1", TENANT)).thenReturn(Optional.of(release));

        R<AppReleaseResponse> result = controller.get(APP_ID, CLIENT_ID, "rel1");
        assertThat(result.getData().getId()).isEqualTo("rel1");
        assertThat(result.getData().getVersion()).isEqualTo(2);
        assertThat(result.getData().getSnapshotJson()).isEqualTo("{\"pages\":[]}");
    }

    @Test
    void listReleases_orderedByVersionDesc() {
        AppRelease r5 = new AppRelease();
        r5.setId("rel5");
        r5.setVersion(5);
        AppRelease r2 = new AppRelease();
        r2.setId("rel2");
        r2.setVersion(2);
        when(releaseRepo.findByTenantIdAndClientIdOrderByVersionDesc(TENANT, CLIENT_ID))
                .thenReturn(List.of(r5, r2));

        R<List<AppReleaseResponse>> result = controller.list(APP_ID, CLIENT_ID);
        assertThat(result.getData()).extracting(AppReleaseResponse::getVersion)
                .containsExactly(5, 2);
    }

    // ---------- fixtures ----------

    private AppClient client() {
        AppClient client = new AppClient();
        client.setId(CLIENT_ID);
        client.setTenantId(TENANT);
        client.setAppId(APP_ID);
        client.setClientType("MP_WEIXIN");
        return client;
    }

    private AppClientPage pageItem(String rowId, String pageId, int sort) {
        AppClientPage row = new AppClientPage();
        row.setId(rowId);
        row.setTenantId(TENANT);
        row.setClientId(CLIENT_ID);
        row.setPageId(pageId);
        row.setSort(sort);
        return row;
    }

    private PageDefinition publishedPage(String key, String name, Integer publishedVersion) {
        PageDefinition page = new PageDefinition();
        page.setId(key + "-def");
        page.setTenantId(TENANT);
        page.setAppId(APP_ID);
        page.setKey(key);
        page.setName(name);
        page.setPublishedVersion(publishedVersion);
        return page;
    }
}
