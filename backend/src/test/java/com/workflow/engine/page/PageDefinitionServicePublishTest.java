package com.workflow.engine.page;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.engine.page.repository.PageDefinitionRepository;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.*;

/**
 * PageDefinitionService 发布流程单元测试（TDD）。
 * 关键断言：发布不执行 DDL（Service 不依赖 DynamicTableManager 等 DDL 组件，
 * 且不直接接触 formDefRepository——绑定列经 PageValidator.resolveBindColumns 获取）；
 * 内容未变化拒绝；同 key 旧 PUBLISHED 降 ARCHIVED；编译产物合并进 schema。
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
    private ViewCompiler compiler;

    private PageDefinitionService service;

    private static final String TENANT_ID = "test-tenant";

    @BeforeEach
    void setUp() {
        TenantContext.setTenantId(TENANT_ID);
        lenient().when(tenantProvider.getTenantId()).thenReturn(TENANT_ID);
        service = new PageDefinitionService(pageDefRepository, tenantProvider,
                validator, compiler, new ObjectMapper());
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    private PageDefinition draftView(String id, String key, String schema) {
        PageDefinition page = new PageDefinition();
        page.setId(id);
        page.setTenantId(TENANT_ID);
        page.setName("测试页面");
        page.setKey(key);
        page.setType("VIEW");
        page.setFormKey("leave");
        page.setSchema(schema);
        page.setVersion(1);
        page.setStatus("DRAFT");
        return page;
    }

    // ==================== 发布成功（不建表） ====================

    @Test
    void publish_view_success_withoutDdl() {
        PageDefinition draft = draftView("page-1", "leave-query", "{\"searchFields\":[]}");
        when(pageDefRepository.findByIdForUpdate("page-1", TENANT_ID)).thenReturn(Optional.of(draft));
        when(pageDefRepository.findFirstByTenantIdAndKeyAndStatusAndIdNotOrderByVersionDesc(
                TENANT_ID, "leave-query", "PUBLISHED", "page-1")).thenReturn(Optional.empty());
        doNothing().when(validator).validateForPublish(draft);
        when(validator.resolveBindColumns(draft)).thenReturn(List.of());
        when(compiler.compile(any(PageDefinition.class), anyList())).thenReturn("{\"rule\":[],\"option\":{}}");
        when(pageDefRepository.save(any(PageDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        PageDefinition result = service.publish("page-1");

        assertEquals("PUBLISHED", result.getStatus());
        assertEquals(1, result.getPublishedVersion());
        // 编译产物已合并进 schema
        assertNotNull(result.getSchema());
        assertTrue(result.getSchema().contains("\"rule\""));
        assertTrue(result.getSchema().contains("\"option\""));
        // 无 DDL：不直接接触 formDefRepository（绑定列经 validator 解析）；
        // Service 构造不依赖 DynamicTableManager/JdbcTemplate，结构性排除 DDL
        verify(compiler).compile(any(PageDefinition.class), anyList());
    }

    // ==================== 发布不直接接触 DDL/表单仓储 ====================

    @Test
    void publish_doesNotTouchDdlAndFormRepo() {
        PageDefinition draft = draftView("page-1", "leave-query", "{\"searchFields\":[]}");
        when(pageDefRepository.findByIdForUpdate("page-1", TENANT_ID)).thenReturn(Optional.of(draft));
        when(pageDefRepository.findFirstByTenantIdAndKeyAndStatusAndIdNotOrderByVersionDesc(
                TENANT_ID, "leave-query", "PUBLISHED", "page-1")).thenReturn(Optional.empty());
        doNothing().when(validator).validateForPublish(draft);
        when(validator.resolveBindColumns(draft)).thenReturn(List.of());
        when(compiler.compile(any(PageDefinition.class), anyList())).thenReturn("{\"rule\":[]}");
        when(pageDefRepository.save(any(PageDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        service.publish("page-1");

        // 发布链路中不直接接触表单仓储与普通查询（只用 findByIdForUpdate）
        verifyNoInteractions(formDefRepository);
        verify(pageDefRepository, never()).findByIdAndTenantId(any(), any());
    }

    // ==================== 内容未变化拒绝 ====================

    @Test
    void publish_contentUnchanged_rejected() {
        PageDefinition draft = draftView("page-1", "leave-query", "{\"searchFields\":[]}");
        PageDefinition oldPublished = draftView("page-2", "leave-query", "{\"searchFields\":[]}");
        oldPublished.setStatus("PUBLISHED");
        oldPublished.setVersion(1);

        when(pageDefRepository.findByIdForUpdate("page-1", TENANT_ID)).thenReturn(Optional.of(draft));
        when(pageDefRepository.findFirstByTenantIdAndKeyAndStatusAndIdNotOrderByVersionDesc(
                TENANT_ID, "leave-query", "PUBLISHED", "page-1")).thenReturn(Optional.of(oldPublished));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.publish("page-1"));
        assertTrue(ex.getMessage().contains("未变化"));
        // 未调用 validator/compiler
        verify(validator, never()).validateForPublish(any());
        verify(compiler, never()).compile(any(), anyList());
    }

    // ==================== 旧 PUBLISHED 降 ARCHIVED ====================

    @Test
    void publish_archivesPreviousPublished() {
        PageDefinition draft = draftView("page-1", "leave-query", "{\"searchFields\":[{\"key\":\"a\"}]}");
        PageDefinition oldPublished = draftView("page-2", "leave-query", "{\"searchFields\":[{\"key\":\"b\"}]}");
        oldPublished.setStatus("PUBLISHED");
        oldPublished.setVersion(1);

        when(pageDefRepository.findByIdForUpdate("page-1", TENANT_ID)).thenReturn(Optional.of(draft));
        when(pageDefRepository.findFirstByTenantIdAndKeyAndStatusAndIdNotOrderByVersionDesc(
                TENANT_ID, "leave-query", "PUBLISHED", "page-1")).thenReturn(Optional.of(oldPublished));
        doNothing().when(validator).validateForPublish(draft);
        when(validator.resolveBindColumns(draft)).thenReturn(List.of());
        when(compiler.compile(any(PageDefinition.class), anyList())).thenReturn("{\"rule\":[]}");
        when(pageDefRepository.save(any(PageDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        service.publish("page-1");

        assertEquals("ARCHIVED", oldPublished.getStatus());
        verify(pageDefRepository).save(oldPublished);
    }

    // ==================== 状态校验 ====================

    @Test
    void publish_archivedStatus_rejected() {
        PageDefinition archived = draftView("page-1", "leave-query", "{}");
        archived.setStatus("ARCHIVED");
        when(pageDefRepository.findByIdForUpdate("page-1", TENANT_ID)).thenReturn(Optional.of(archived));

        assertThrows(BusinessException.class, () -> service.publish("page-1"));
    }
}