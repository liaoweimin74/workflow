package com.workflow.api.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.PageDefinitionDetailDTO;
import com.workflow.api.dto.PageDefinitionSaveRequest;
import com.workflow.common.domain.R;
import com.workflow.engine.app.entity.AppDefinition;
import com.workflow.engine.app.repository.AppDefinitionRepository;
import com.workflow.engine.page.HomePageSettingService;
import com.workflow.engine.page.PageAccessGuard;
import com.workflow.engine.page.PageDefinitionService;
import com.workflow.engine.page.PageValidator;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.engine.page.repository.PageDefinitionRepository;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.framework.security.permission.PermissionEvaluator;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 页面定义控制器 design_type 接线测试（Task 2.1）。
 *
 * 约定：纯 Mockito 直调控制器方法 + 真实 PageDefinitionService + mock 仓储。
 * 覆盖（spec: custom-page-designer「页面设计类型与契约渲染画布」）：
 * - create 请求的 designType 透传到 service 并落值
 * - 详情 DTO 透出 designType（前端设计类型徽标与保存回传依赖）
 */
class PageDefinitionControllerTest {

    private static final String TENANT = "t1";

    private PageDefinitionRepository pageDefRepo;
    private AppDefinitionRepository appRepo;
    private PageDefinitionController controller;

    @BeforeEach
    void setUp() {
        pageDefRepo = mock(PageDefinitionRepository.class);
        appRepo = mock(AppDefinitionRepository.class);
        PageValidator validator = mock(PageValidator.class);
        PageDefinitionService service = new PageDefinitionService(pageDefRepo, appRepo,
                new TenantProvider(), validator, new ObjectMapper());
        controller = new PageDefinitionController(service,
                mock(PageAccessGuard.class), mock(HomePageSettingService.class),
                mock(PermissionEvaluator.class));
        TenantContext.setTenantId(TENANT);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    @Test
    void create_passesDesignTypeThrough() {
        when(appRepo.findByIdAndTenantId("a1", TENANT)).thenReturn(Optional.of(app()));
        when(pageDefRepo.existsByTenantIdAndAppIdAndKey(TENANT, "a1", "order-m")).thenReturn(false);
        when(pageDefRepo.save(any(PageDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        PageDefinitionSaveRequest request = new PageDefinitionSaveRequest();
        request.setAppId("a1");
        request.setName("移动订单");
        request.setKey("order-m");
        request.setType("PAGE");
        request.setDesignType("uniapp");

        R<PageDefinition> response = controller.create(request);

        assertThat(response.getData().getDesignType()).isEqualTo("uniapp");
    }

    @Test
    void getById_exposesDesignType() {
        PageDefinition existing = new PageDefinition();
        existing.setId("p1");
        existing.setTenantId(TENANT);
        existing.setAppId("a1");
        existing.setDesignType("uniapp");
        existing.setName("移动订单");
        existing.setKey("order-m");
        when(pageDefRepo.findByIdAndTenantId("p1", TENANT)).thenReturn(Optional.of(existing));

        R<PageDefinitionDetailDTO> response = controller.getById("p1");

        assertThat(response.getData().getDesignType()).isEqualTo("uniapp");
    }

    private AppDefinition app() {
        AppDefinition entity = new AppDefinition();
        entity.setId("a1");
        entity.setTenantId(TENANT);
        entity.setCode("merchant");
        entity.setName("商户端");
        return entity;
    }
}
