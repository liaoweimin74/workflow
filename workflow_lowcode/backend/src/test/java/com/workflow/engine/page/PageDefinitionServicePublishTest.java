package com.workflow.engine.page;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.engine.page.repository.PageDefinitionRepository;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.system.repository.SysClientRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * PageDefinitionService 发布流程单元测试（TDD）。
 * VIEW 视图编译已废弃：发布仅经 PageValidator.validateForPublish 校验 schema，不再编译；
 * 不执行 DDL（Service 不依赖 DDL 组件、不直接接触 formDefRepository）；
 * 内容未变化拒绝；同 key 旧 PUBLISHED 降 ARCHIVED。
 */
@ExtendWith(MockitoExtension.class)
class PageDefinitionServicePublishTest {

    @Mock
    private PageDefinitionRepository pageDefRepository;

    @Mock
    private FormDefinitionRepository formDefRepository;

    @Mock
    private TenantProvider tenantProvider;

    @Mock
    private PageValidator validator;

    @Mock
    private SysClientRepository clientRepository;

    private PageDefinitionService service;

    private static final String TENANT_ID = "test-tenant";

    @BeforeEach
    void setUp() {
        TenantContext.setTenantId(TENANT_ID);
        lenient().when(tenantProvider.getTenantId()).thenReturn(TENANT_ID);
        // A5：发布链缺省目标端 portal(1) 存在性校验放行（本类不测目标端语义）
        lenient().when(clientRepository.existsById(1L)).thenReturn(true);
        service = new PageDefinitionService(pageDefRepository, tenantProvider,
                validator, new ObjectMapper(), clientRepository);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    private PageDefinition draftPage(String id, String key, String schema) {
        PageDefinition page = new PageDefinition();
        page.setId(id);
        page.setTenantId(TENANT_ID);
        page.setName("测试页面");
        page.setKey(key);
        page.setType("PAGE");
        page.setSchema(schema);
        page.setVersion(1);
        page.setStatus("DRAFT");
        return page;
    }

    // ==================== 发布成功（不建表、不编译） ====================

    @Test
    void publish_success_withoutDdl() {
        PageDefinition draft = draftPage("page-1", "order-page", "{\"rule\":[]}");
        when(pageDefRepository.findByIdForUpdate("page-1", TENANT_ID)).thenReturn(Optional.of(draft));
        when(pageDefRepository.findFirstByTenantIdAndKeyAndStatusAndIdNotOrderByVersionDesc(
                TENANT_ID, "order-page", "PUBLISHED", "page-1")).thenReturn(Optional.empty());
        doNothing().when(validator).validateForPublish(draft);
        when(pageDefRepository.save(any(PageDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        PageDefinition result = service.publish("page-1");

        assertEquals("PUBLISHED", result.getStatus());
        assertEquals(1, result.getPublishedVersion());
        // 发布链路不直接接触表单仓储与普通查询（只用 findByIdForUpdate）
        verifyNoInteractions(formDefRepository);
        verify(pageDefRepository, never()).findByIdAndTenantId(any(), any());
    }

    // ==================== 内容未变化拒绝 ====================

    @Test
    void publish_contentUnchanged_rejected() {
        PageDefinition draft = draftPage("page-1", "order-page", "{\"rule\":[]}");
        PageDefinition oldPublished = draftPage("page-2", "order-page", "{\"rule\":[]}");
        oldPublished.setStatus("PUBLISHED");
        oldPublished.setVersion(1);

        when(pageDefRepository.findByIdForUpdate("page-1", TENANT_ID)).thenReturn(Optional.of(draft));
        when(pageDefRepository.findFirstByTenantIdAndKeyAndStatusAndIdNotOrderByVersionDesc(
                TENANT_ID, "order-page", "PUBLISHED", "page-1")).thenReturn(Optional.of(oldPublished));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.publish("page-1"));
        assertTrue(ex.getMessage().contains("未变化"));
        verify(validator, never()).validateForPublish(any());
    }

    // ==================== 旧 PUBLISHED 降 ARCHIVED ====================

    @Test
    void publish_archivesPreviousPublished() {
        PageDefinition draft = draftPage("page-1", "order-page", "{\"rule\":[{\"type\":\"a\"}]}");
        PageDefinition oldPublished = draftPage("page-2", "order-page", "{\"rule\":[{\"type\":\"b\"}]}");
        oldPublished.setStatus("PUBLISHED");
        oldPublished.setVersion(1);

        when(pageDefRepository.findByIdForUpdate("page-1", TENANT_ID)).thenReturn(Optional.of(draft));
        when(pageDefRepository.findFirstByTenantIdAndKeyAndStatusAndIdNotOrderByVersionDesc(
                TENANT_ID, "order-page", "PUBLISHED", "page-1")).thenReturn(Optional.of(oldPublished));
        doNothing().when(validator).validateForPublish(draft);
        when(pageDefRepository.save(any(PageDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        service.publish("page-1");

        assertEquals("ARCHIVED", oldPublished.getStatus());
        verify(pageDefRepository).save(oldPublished);
    }

    // ==================== 状态校验 ====================

    @Test
    void publish_archivedStatus_rejected() {
        PageDefinition archived = draftPage("page-1", "order-page", "{}");
        archived.setStatus("ARCHIVED");
        when(pageDefRepository.findByIdForUpdate("page-1", TENANT_ID)).thenReturn(Optional.of(archived));

        assertThrows(BusinessException.class, () -> service.publish("page-1"));
    }

    // ==================== 预览（返回最新定义，VIEW 编译已废弃，不编译不持久化） ====================

    @Test
    void preview_returnsLatestDefinition_asIs() {
        PageDefinition draft = draftPage("page-1", "order-page", "{\"rule\":[{\"type\":\"table\"}]}");
        when(pageDefRepository.findFirstByTenantIdAndKeyOrderByVersionDesc(TENANT_ID, "order-page"))
                .thenReturn(Optional.of(draft));

        PageDefinition result = service.getPreviewByKey("order-page");

        assertSame(draft, result);
        verify(pageDefRepository, never()).save(any());
    }

    @Test
    void preview_missingPage_rejected404() {
        when(pageDefRepository.findFirstByTenantIdAndKeyOrderByVersionDesc(TENANT_ID, "no-such-page"))
                .thenReturn(Optional.empty());

        assertThrows(BusinessException.class, () -> service.getPreviewByKey("no-such-page"));
    }
}
