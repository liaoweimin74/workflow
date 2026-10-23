package com.workflow.api.controller;

import com.workflow.api.dto.AppClientPageItem;
import com.workflow.api.dto.AppClientPageResponse;
import com.workflow.api.dto.AppClientResponse;
import com.workflow.api.dto.AppClientSaveRequest;
import com.workflow.api.dto.AppResponse;
import com.workflow.api.dto.AppSaveRequest;
import com.workflow.api.dto.PageResponse;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.app.AppModelService;
import com.workflow.engine.app.entity.AppClient;
import com.workflow.engine.app.entity.AppClientPage;
import com.workflow.engine.app.entity.AppDefinition;
import com.workflow.engine.app.repository.AppClientPageRepository;
import com.workflow.engine.app.repository.AppClientRepository;
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

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * App/Client 管理 API 测试（Task 1.2）。
 *
 * 直调控制器（真实 AppModelService + mock 仓储），覆盖：
 * - 创建 app：code 租户内唯一（重复 400）、必填校验 400
 * - 跨租户访问：404
 * - 创建 client：client_type 白名单 WEB/MP_WEIXIN/H5/APP（非法 400）、
 *   render_mode 由端类型推导（WEB→RUNTIME，其余→CODEGEN）、
 *   uk(tenant_id, app_id, client_type, name) 重复 400
 */
class AppAdminControllerTest {

    private static final String TENANT = "t1";

    private AppDefinitionRepository appRepo;
    private AppClientRepository clientRepo;
    private PageDefinitionRepository pageDefRepo;
    private AppClientPageRepository clientPageRepo;
    private AppAdminController controller;

    @BeforeEach
    void setUp() {
        appRepo = mock(AppDefinitionRepository.class);
        clientRepo = mock(AppClientRepository.class);
        pageDefRepo = mock(PageDefinitionRepository.class);
        clientPageRepo = mock(AppClientPageRepository.class);
        AppModelService service = new AppModelService(appRepo, clientRepo, pageDefRepo, clientPageRepo,
                new TenantProvider());
        controller = new AppAdminController(service);
        TenantContext.setTenantId(TENANT);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    // ---------- 创建 App ----------

    @Test
    void createApp_returnsResponse_withTenantFromContext() {
        when(appRepo.existsByTenantIdAndCode(TENANT, "merchant")).thenReturn(false);
        when(appRepo.save(any(AppDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        R<AppResponse> result = controller.create(app("merchant", "商户端"));

        assertThat(result.getCode()).isEqualTo(200);
        assertThat(result.getData().getCode()).isEqualTo("merchant");
        assertThat(result.getData().getName()).isEqualTo("商户端");
        assertThat(result.getData().getTenantId()).isEqualTo(TENANT);
        assertThat(result.getData().getId()).isNotBlank();
        assertThat(result.getData().getStatus()).isEqualTo("ACTIVE");

        ArgumentCaptor<AppDefinition> captor = ArgumentCaptor.forClass(AppDefinition.class);
        verify(appRepo).save(captor.capture());
        assertThat(captor.getValue().getTenantId()).isEqualTo(TENANT);
    }

    @Test
    void createApp_duplicateCodeInTenant_rejected400() {
        when(appRepo.existsByTenantIdAndCode(TENANT, "merchant")).thenReturn(true);

        assertThatThrownBy(() -> controller.create(app("merchant", "商户端")))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(400))
                .hasMessageContaining("应用编码已存在");
    }

    @Test
    void createApp_blankCodeOrName_rejected400() {
        assertThatThrownBy(() -> controller.create(app(" ", "商户端")))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(400));
        assertThatThrownBy(() -> controller.create(app("merchant", "")))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(400));
    }

    // ---------- 跨租户访问 ----------

    @Test
    void getApp_missingInTenant_returns404() {
        when(appRepo.findByIdAndTenantId("a1", TENANT)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller.get("a1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(404))
                .hasMessageContaining("应用不存在");
    }

    // ---------- 创建 Client ----------

    @Test
    void createClient_webClient_derivesRuntimeRenderMode() {
        when(appRepo.findByIdAndTenantId("a1", TENANT)).thenReturn(Optional.of(appEntity("a1")));
        when(clientRepo.existsByTenantIdAndAppIdAndClientTypeAndName(TENANT, "a1", "WEB", "主站"))
                .thenReturn(false);
        when(clientRepo.save(any(AppClient.class))).thenAnswer(inv -> inv.getArgument(0));

        R<AppClientResponse> result = controller.createClient("a1", client("WEB", "主站"));

        assertThat(result.getCode()).isEqualTo(200);
        assertThat(result.getData().getRenderMode()).isEqualTo("RUNTIME");
    }

    @Test
    void createClient_miniprogramClient_derivesCodegenRenderMode() {
        when(appRepo.findByIdAndTenantId("a1", TENANT)).thenReturn(Optional.of(appEntity("a1")));
        when(clientRepo.existsByTenantIdAndAppIdAndClientTypeAndName(TENANT, "a1", "MP_WEIXIN", "主力小程序"))
                .thenReturn(false);
        when(clientRepo.save(any(AppClient.class))).thenAnswer(inv -> inv.getArgument(0));

        R<AppClientResponse> result = controller.createClient("a1", client("MP_WEIXIN", "主力小程序"));

        assertThat(result.getData().getRenderMode()).isEqualTo("CODEGEN");
        assertThat(result.getData().getClientType()).isEqualTo("MP_WEIXIN");
        assertThat(result.getData().getAppId()).isEqualTo("a1");
    }

    @Test
    void createClient_invalidClientType_rejected400() {
        when(appRepo.findByIdAndTenantId("a1", TENANT)).thenReturn(Optional.of(appEntity("a1")));

        assertThatThrownBy(() -> controller.createClient("a1", client("MP_ALIPAY", "支付宝小程序")))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(400))
                .hasMessageContaining("端类型");
    }

    @Test
    void createClient_duplicateTypeAndName_rejected400() {
        when(appRepo.findByIdAndTenantId("a1", TENANT)).thenReturn(Optional.of(appEntity("a1")));
        when(clientRepo.existsByTenantIdAndAppIdAndClientTypeAndName(TENANT, "a1", "MP_WEIXIN", "主力小程序"))
                .thenReturn(true);

        assertThatThrownBy(() -> controller.createClient("a1", client("MP_WEIXIN", "主力小程序")))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(400))
                .hasMessageContaining("已存在");
    }

    @Test
    void createClient_appMissingInTenant_returns404() {
        when(appRepo.findByIdAndTenantId("a1", TENANT)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller.createClient("a1", client("WEB", "主站")))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(404));
    }

    // ---------- 查询 ----------

    @Test
    void listClients_mapsToResponses() {
        when(appRepo.findByIdAndTenantId("a1", TENANT)).thenReturn(Optional.of(appEntity("a1")));
        AppClient c1 = clientEntity("c1", "MP_WEIXIN", "主力小程序");
        AppClient c2 = clientEntity("c2", "H5", "H5 版");
        when(clientRepo.findByTenantIdAndAppIdOrderByCreatedAtAsc(TENANT, "a1")).thenReturn(List.of(c1, c2));

        R<List<AppClientResponse>> result = controller.listClients("a1");

        assertThat(result.getData()).hasSize(2);
        assertThat(result.getData().get(0).getId()).isEqualTo("c1");
        assertThat(result.getData().get(1).getName()).isEqualTo("H5 版");
    }

    @Test
    void listApps_mapsPageToPageResponse() {
        AppDefinition app = appEntity("a1");
        app.setCode("merchant");
        app.setName("商户端");
        when(appRepo.findByTenantIdOrderByUpdatedAtDesc(eq(TENANT), any()))
                .thenReturn(new PageImpl<>(List.of(app)));

        R<PageResponse<AppResponse>> result = controller.list(null, 0, 20);

        assertThat(result.getData().getTotalElements()).isEqualTo(1);
        assertThat(result.getData().getContent().get(0).getCode()).isEqualTo("merchant");
    }

    @Test
    void updateApp_keepsCodeImmutable() {
        AppDefinition existing = appEntity("a1");
        existing.setCode("merchant");
        when(appRepo.findByIdAndTenantId("a1", TENANT)).thenReturn(Optional.of(existing));
        when(appRepo.save(any(AppDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        R<AppResponse> result = controller.update("a1", app("merchant", "新名称"));

        assertThat(result.getData().getName()).isEqualTo("新名称");
        ArgumentCaptor<AppDefinition> captor = ArgumentCaptor.forClass(AppDefinition.class);
        verify(appRepo).save(captor.capture());
        assertThat(captor.getValue().getCode()).as("code 创建后不可变更").isEqualTo("merchant");
    }

    // ---------- 页面分配（Task 1.3：启用清单全量替换） ----------

    @Test
    void assignPages_sameAppReplaces_fullListSorted() {
        when(clientRepo.findByIdAndTenantId("c-mp", TENANT))
                .thenReturn(Optional.of(clientEntity("c-mp", "MP_WEIXIN", "主力小程序")));
        when(pageDefRepo.findByIdAndTenantId("p1", TENANT)).thenReturn(Optional.of(page("p1", "a1", "uniapp")));
        when(pageDefRepo.findByIdAndTenantId("p2", TENANT)).thenReturn(Optional.of(page("p2", "a1", "uniapp")));

        R<List<AppClientPageResponse>> result = controller.assignPages("a1", "c-mp",
                List.of(item("p2", 2), item("p1", 1)));

        assertThat(result.getCode()).isEqualTo(200);
        verify(clientPageRepo).deleteByTenantIdAndClientId(TENANT, "c-mp");
        ArgumentCaptor<AppClientPage> captor = ArgumentCaptor.forClass(AppClientPage.class);
        verify(clientPageRepo, times(2)).save(captor.capture());
        // 全量替换：条目顺序即清单顺序，sort 值随条目落库
        assertThat(captor.getAllValues())
                .extracting(AppClientPage::getPageId, AppClientPage::getSort)
                .containsExactly(tuple("p2", 2), tuple("p1", 1));
    }

    @Test
    void assignPages_pageFromOtherApp_rejected400() {
        when(clientRepo.findByIdAndTenantId("c-mp", TENANT))
                .thenReturn(Optional.of(clientEntity("c-mp", "MP_WEIXIN", "主力小程序")));
        when(pageDefRepo.findByIdAndTenantId("p-x", TENANT)).thenReturn(Optional.of(page("p-x", "a2", "uniapp")));

        assertThatThrownBy(() -> controller.assignPages("a1", "c-mp", List.of(item("p-x", 1))))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(400))
                .hasMessageContaining("不属于该应用");
    }

    @Test
    void assignPages_missingPage_rejected400() {
        when(clientRepo.findByIdAndTenantId("c-mp", TENANT))
                .thenReturn(Optional.of(clientEntity("c-mp", "MP_WEIXIN", "主力小程序")));
        when(pageDefRepo.findByIdAndTenantId("p-ghost", TENANT)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller.assignPages("a1", "c-mp", List.of(item("p-ghost", 1))))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(400))
                .hasMessageContaining("页面不存在");
    }

    @Test
    void assignPages_webPageToMiniprogram_rejected400() {
        when(clientRepo.findByIdAndTenantId("c-mp", TENANT))
                .thenReturn(Optional.of(clientEntity("c-mp", "MP_WEIXIN", "主力小程序")));
        when(pageDefRepo.findByIdAndTenantId("p-web", TENANT)).thenReturn(Optional.of(page("p-web", "a1", "web")));

        assertThatThrownBy(() -> controller.assignPages("a1", "c-mp", List.of(item("p-web", 1))))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(400))
                .hasMessageContaining("不兼容");
    }

    @Test
    void assignPages_legacyPageWithoutDesignType_treatedAsWeb() {
        when(clientRepo.findByIdAndTenantId("c-mp", TENANT))
                .thenReturn(Optional.of(clientEntity("c-mp", "MP_WEIXIN", "主力小程序")));
        when(pageDefRepo.findByIdAndTenantId("p-legacy", TENANT))
                .thenReturn(Optional.of(page("p-legacy", "a1", null)));

        assertThatThrownBy(() -> controller.assignPages("a1", "c-mp", List.of(item("p-legacy", 1))))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(400))
                .hasMessageContaining("不兼容");
    }

    @Test
    void assignPages_uniappPage_sharedAcrossMiniprogramAndH5() {
        when(clientRepo.findByIdAndTenantId("c-mp", TENANT))
                .thenReturn(Optional.of(clientEntity("c-mp", "MP_WEIXIN", "主力小程序")));
        when(clientRepo.findByIdAndTenantId("c-h5", TENANT))
                .thenReturn(Optional.of(clientEntity("c-h5", "H5", "H5 版")));
        when(pageDefRepo.findByIdAndTenantId("p1", TENANT)).thenReturn(Optional.of(page("p1", "a1", "uniapp")));

        R<List<AppClientPageResponse>> mp = controller.assignPages("a1", "c-mp", List.of(item("p1", 1)));
        R<List<AppClientPageResponse>> h5 = controller.assignPages("a1", "c-h5", List.of(item("p1", 1)));

        // 同一 uniapp 页面池可跨小程序 + H5 复用
        assertThat(mp.getCode()).isEqualTo(200);
        assertThat(h5.getCode()).isEqualTo(200);
    }

    @Test
    void getAssignedPages_sortedBySort_withPageName() {
        when(clientRepo.findByIdAndTenantId("c-mp", TENANT))
                .thenReturn(Optional.of(clientEntity("c-mp", "MP_WEIXIN", "主力小程序")));
        when(clientPageRepo.findByTenantIdAndClientIdOrderBySortAsc(TENANT, "c-mp"))
                .thenReturn(List.of(assignment("r1", "p1", 1), assignment("r2", "p2", 2)));
        when(pageDefRepo.findByIdAndTenantId("p1", TENANT)).thenReturn(Optional.of(page("p1", "a1", "uniapp")));
        when(pageDefRepo.findByIdAndTenantId("p2", TENANT)).thenReturn(Optional.of(page("p2", "a1", "uniapp")));

        R<List<AppClientPageResponse>> result = controller.getAssignedPages("a1", "c-mp");

        assertThat(result.getData()).extracting(AppClientPageResponse::getPageId)
                .containsExactly("p1", "p2");
        assertThat(result.getData()).extracting(AppClientPageResponse::getPageName)
                .containsExactly("页面-p1", "页面-p2");
    }

    // ---------- fixtures ----------

    private AppSaveRequest app(String code, String name) {
        AppSaveRequest req = new AppSaveRequest();
        req.setCode(code);
        req.setName(name);
        return req;
    }

    private AppClientSaveRequest client(String clientType, String name) {
        AppClientSaveRequest req = new AppClientSaveRequest();
        req.setClientType(clientType);
        req.setName(name);
        return req;
    }

    private AppDefinition appEntity(String id) {
        AppDefinition entity = new AppDefinition();
        entity.setId(id);
        entity.setTenantId(TENANT);
        entity.setCode("merchant");
        entity.setName("商户端");
        return entity;
    }

    private AppClient clientEntity(String id, String clientType, String name) {
        AppClient entity = new AppClient();
        entity.setId(id);
        entity.setTenantId(TENANT);
        entity.setAppId("a1");
        entity.setClientType(clientType);
        entity.setName(name);
        entity.setRenderMode("WEB".equals(clientType) ? "RUNTIME" : "CODEGEN");
        return entity;
    }

    private AppClientPageItem item(String pageId, int sort) {
        AppClientPageItem item = new AppClientPageItem();
        item.setPageId(pageId);
        item.setSort(sort);
        return item;
    }

    private PageDefinition page(String id, String appId, String designType) {
        PageDefinition entity = new PageDefinition();
        entity.setId(id);
        entity.setTenantId(TENANT);
        entity.setAppId(appId);
        entity.setDesignType(designType);
        entity.setName("页面-" + id);
        entity.setKey("k-" + id);
        return entity;
    }

    private AppClientPage assignment(String id, String pageId, int sort) {
        AppClientPage row = new AppClientPage();
        row.setId(id);
        row.setTenantId(TENANT);
        row.setClientId("c-mp");
        row.setPageId(pageId);
        row.setSort(sort);
        return row;
    }
}
