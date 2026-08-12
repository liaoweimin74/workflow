package com.workflow.engine.form;

import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.column.DynamicTableManager;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.common.exception.BusinessException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * FormDefinitionService 单元测试。
 * 使用 Mockito 模拟 Repository 和 TenantProvider，不依赖数据库。
 */
@ExtendWith(MockitoExtension.class)
class FormDefinitionServiceTest {

    @Mock
    private FormDefinitionRepository formDefRepository;

    @Mock
    private TenantProvider tenantProvider;

    @Mock
    private DynamicTableManager tableManager;

    @InjectMocks
    private FormDefinitionService formDefService;

    private static final String TENANT_ID = "test-tenant";

    @BeforeEach
    void setUp() {
        TenantContext.setTenantId(TENANT_ID);
        lenient().when(tenantProvider.getTenantId()).thenReturn(TENANT_ID);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    // ==================== create ====================

    @Test
    void create_success_setsDraftStatusAndVersion1() {
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "leave_form")).thenReturn(false);
        when(formDefRepository.save(any(FormDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        FormDefinition result = formDefService.create("请假申请", "leave_form");

        assertNotNull(result.getId());
        assertEquals(TENANT_ID, result.getTenantId());
        assertEquals("请假申请", result.getName());
        assertEquals("leave_form", result.getKey());
        assertEquals("[]", result.getSchema());
        assertEquals(1, result.getVersion());
        assertEquals("DRAFT", result.getStatus());
        verify(formDefRepository).save(any(FormDefinition.class));
    }

    @Test
    void create_duplicateKey_throwsException() {
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "leave_form")).thenReturn(true);

        RuntimeException ex = assertThrows(RuntimeException.class,
                () -> formDefService.create("请假申请", "leave_form"));
        assertTrue(ex.getMessage().contains("Form key already exists"));
        verify(formDefRepository, never()).save(any());
    }

    @Test
    void create_withBusinessType_setsType() {
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "biz_leave")).thenReturn(false);
        when(formDefRepository.save(any(FormDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        FormDefinition result = formDefService.create("业务表单", "biz_leave", "BUSINESS");

        assertEquals("BUSINESS", result.getType());
        assertEquals("biz_leave", result.getKey());
        verify(formDefRepository).save(any(FormDefinition.class));
    }

    @Test
    void create_withoutType_defaultsToWorkflow() {
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "leave_form")).thenReturn(false);
        when(formDefRepository.save(any(FormDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        FormDefinition result = formDefService.create("工作流表单", "leave_form", null);

        assertEquals("WORKFLOW", result.getType());
    }

    @Test
    void create_blankType_defaultsToWorkflow() {
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "leave_form")).thenReturn(false);
        when(formDefRepository.save(any(FormDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        FormDefinition result = formDefService.create("工作流表单", "leave_form", "  ");

        assertEquals("WORKFLOW", result.getType());
    }

    // ==================== getById ====================

    @Test
    void getById_found_returnsFormDef() {
        FormDefinition formDef = buildFormDef("form-1", "leave_form", 1, "DRAFT");
        when(formDefRepository.findByIdAndTenantId("form-1", TENANT_ID))
                .thenReturn(Optional.of(formDef));

        FormDefinition result = formDefService.getById("form-1");

        assertEquals("form-1", result.getId());
        assertEquals("leave_form", result.getKey());
    }

    @Test
    void getById_notFound_throwsException() {
        when(formDefRepository.findByIdAndTenantId("nonexistent", TENANT_ID))
                .thenReturn(Optional.empty());

        RuntimeException ex = assertThrows(RuntimeException.class,
                () -> formDefService.getById("nonexistent"));
        assertTrue(ex.getMessage().contains("Form definition not found"));
    }

    // ==================== update ====================

    @Test
    void update_draftForm_inPlaceUpdate_noNewVersion() {
        FormDefinition existing = new FormDefinition();
        existing.setId("form-1");
        existing.setTenantId(TENANT_ID);
        existing.setKey("leave-form");
        existing.setName("请假表单");
        existing.setSchema("[]");
        existing.setVersion(1);
        existing.setStatus("DRAFT");

        when(formDefRepository.findByIdAndTenantId("form-1", TENANT_ID))
            .thenReturn(Optional.of(existing));
        when(formDefRepository.save(existing)).thenReturn(existing);

        FormDefinition result = formDefService.update("form-1", "新表单名", "leave-form", "[{\"field\":\"reason\"}]");

        assertEquals("form-1", result.getId());
        assertEquals(1, result.getVersion());
        assertEquals("DRAFT", result.getStatus());
        assertEquals("[{\"field\":\"reason\"}]", result.getSchema());
        assertEquals("新表单名", result.getName());
        verify(formDefRepository).save(existing);
    }

    @Test
    void update_publishedForm_inPlaceUpdate() {
        FormDefinition published = new FormDefinition();
        published.setId("form-1");
        published.setTenantId(TENANT_ID);
        published.setKey("leave-form");
        published.setName("请假表单");
        published.setSchema("[]");
        published.setVersion(2);
        published.setStatus("PUBLISHED");

        when(formDefRepository.findByIdAndTenantId("form-1", TENANT_ID))
            .thenReturn(Optional.of(published));
        when(formDefRepository.save(published)).thenReturn(published);

        FormDefinition result = formDefService.update("form-1", null, null, "[{\"field\":\"reason\"}]");

        assertEquals("form-1", result.getId());
        assertEquals(2, result.getVersion());
        assertEquals("PUBLISHED", result.getStatus());
        assertEquals("[{\"field\":\"reason\"}]", result.getSchema());
        verify(formDefRepository).save(published);
    }

    // ==================== publish ====================

    @Test
    void publish_draftForm_directPublish_oldPublishedArchived() {
        FormDefinition draft = new FormDefinition();
        draft.setId("form-draft");
        draft.setTenantId(TENANT_ID);
        draft.setKey("leave-form");
        draft.setName("请假表单");
        draft.setSchema("[{\"field\":\"reason\"}]");
        draft.setVersion(1);
        draft.setStatus("DRAFT");

        FormDefinition oldPublished = new FormDefinition();
        oldPublished.setId("form-old-pub");
        oldPublished.setTenantId(TENANT_ID);
        oldPublished.setKey("leave-form");
        oldPublished.setSchema("[{\"field\":\"name\"}]");
        oldPublished.setVersion(1);
        oldPublished.setStatus("PUBLISHED");

        when(formDefRepository.findByIdForUpdate("form-draft", TENANT_ID))
            .thenReturn(Optional.of(draft));
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, "leave-form", "PUBLISHED"))
            .thenReturn(Optional.of(oldPublished));
        when(formDefRepository.save(any(FormDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        FormDefinition result = formDefService.publish("form-draft");

        // 草稿直接发布：同一记录改状态，不创建新记录
        assertEquals("form-draft", result.getId());
        assertEquals(1, result.getVersion());
        assertEquals("PUBLISHED", result.getStatus());
        assertEquals(1, result.getPublishedVersion());
        assertEquals("[{\"field\":\"reason\"}]", result.getSchema());
        // 旧 PUBLISHED 降为 ARCHIVED
        assertEquals("ARCHIVED", oldPublished.getStatus());
        verify(formDefRepository).save(oldPublished);
        verify(formDefRepository).save(draft);
    }

    @Test
    void publish_schemaUnchanged_throwsException() {
        FormDefinition draft = new FormDefinition();
        draft.setId("form-draft");
        draft.setTenantId(TENANT_ID);
        draft.setKey("leave-form");
        draft.setName("请假表单");
        draft.setSchema("[{\"field\":\"reason\"}]");
        draft.setVersion(1);
        draft.setStatus("DRAFT");

        FormDefinition oldPublished = new FormDefinition();
        oldPublished.setId("form-old-pub");
        oldPublished.setTenantId(TENANT_ID);
        oldPublished.setKey("leave-form");
        oldPublished.setSchema("[{\"field\":\"reason\"}]");
        oldPublished.setVersion(1);
        oldPublished.setStatus("PUBLISHED");

        when(formDefRepository.findByIdForUpdate("form-draft", TENANT_ID))
            .thenReturn(Optional.of(draft));
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, "leave-form", "PUBLISHED"))
            .thenReturn(Optional.of(oldPublished));

        BusinessException ex = assertThrows(BusinessException.class,
            () -> formDefService.publish("form-draft"));
        assertTrue(ex.getMessage().contains("表单内容未变化"));
    }

    @Test
    void publish_noPreviousPublished_directPublish() {
        FormDefinition draft = new FormDefinition();
        draft.setId("form-draft");
        draft.setTenantId(TENANT_ID);
        draft.setKey("leave-form");
        draft.setName("请假表单");
        draft.setSchema("[{\"field\":\"reason\"}]");
        draft.setVersion(1);
        draft.setStatus("DRAFT");

        when(formDefRepository.findByIdForUpdate("form-draft", TENANT_ID))
            .thenReturn(Optional.of(draft));
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, "leave-form", "PUBLISHED"))
            .thenReturn(Optional.empty());
        when(formDefRepository.save(any(FormDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        FormDefinition result = formDefService.publish("form-draft");

        assertEquals("form-draft", result.getId());
        assertEquals(1, result.getVersion());
        assertEquals("PUBLISHED", result.getStatus());
        assertEquals(1, result.getPublishedVersion());
    }

    // ==================== delete ====================

    @Test
    void delete_setsStatusToArchived() {
        FormDefinition formDef = buildFormDef("form-1", "leave_form", 1, "DRAFT");
        when(formDefRepository.findByIdAndTenantId("form-1", TENANT_ID))
                .thenReturn(Optional.of(formDef));

        formDefService.delete("form-1");

        assertEquals("ARCHIVED", formDef.getStatus());
        verify(formDefRepository).save(formDef);
    }

    @Test
    void delete_publishedForm_throwsException() {
        FormDefinition formDef = buildFormDef("form-1", "leave_form", 1, "PUBLISHED");
        when(formDefRepository.findByIdAndTenantId("form-1", TENANT_ID))
                .thenReturn(Optional.of(formDef));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> formDefService.delete("form-1"));
        assertTrue(ex.getMessage().contains("已发布的表单不能删除"));
        verify(formDefRepository, never()).save(any());
    }

    // ==================== getVersions ====================

    @Test
    void getVersions_returnsListOrderedByVersionDesc() {
        FormDefinition v1 = buildFormDef("form-1", "leave_form", 1, "PUBLISHED");
        FormDefinition v2 = buildFormDef("form-2", "leave_form", 2, "DRAFT");
        FormDefinition v3 = buildFormDef("form-3", "leave_form", 3, "DRAFT");

        when(formDefRepository.findByIdAndTenantId("form-3", TENANT_ID))
                .thenReturn(Optional.of(v3));
        when(formDefRepository.findByTenantIdAndKeyOrderByVersionDesc(TENANT_ID, "leave_form"))
                .thenReturn(List.of(v3, v2, v1));

        List<FormDefinition> versions = formDefService.getVersions("form-3");

        assertEquals(3, versions.size());
        assertEquals(3, versions.get(0).getVersion());
        assertEquals(2, versions.get(1).getVersion());
        assertEquals(1, versions.get(2).getVersion());
    }

    // ==================== list ====================

    @Test
    void list_withNameFilter_callsCorrectRepositoryMethod() {
        Pageable pageable = PageRequest.of(0, 20);
        Page<FormDefinition> expectedPage = new PageImpl<>(List.of());
        when(formDefRepository.findByTenantIdAndNameContainingOrderByUpdatedAtDesc(
                TENANT_ID, "leave", pageable))
                .thenReturn(expectedPage);

        Page<FormDefinition> result = formDefService.list(null, "leave", pageable);

        assertSame(expectedPage, result);
        verify(formDefRepository).findByTenantIdAndNameContainingOrderByUpdatedAtDesc(
                TENANT_ID, "leave", pageable);
    }

    @Test
    void list_withStatusFilter_callsCorrectRepositoryMethod() {
        Pageable pageable = PageRequest.of(0, 20);
        Page<FormDefinition> expectedPage = new PageImpl<>(List.of());
        when(formDefRepository.findByTenantIdAndStatusOrderByUpdatedAtDesc(
                TENANT_ID, "DRAFT", pageable))
                .thenReturn(expectedPage);

        Page<FormDefinition> result = formDefService.list("DRAFT", null, pageable);

        assertSame(expectedPage, result);
        verify(formDefRepository).findByTenantIdAndStatusOrderByUpdatedAtDesc(
                TENANT_ID, "DRAFT", pageable);
    }

    @Test
    void list_noFilters_callsDefaultRepositoryMethod() {
        Pageable pageable = PageRequest.of(0, 20);
        Page<FormDefinition> expectedPage = new PageImpl<>(List.of());
        when(formDefRepository.findByTenantIdOrderByUpdatedAtDesc(TENANT_ID, pageable))
                .thenReturn(expectedPage);

        Page<FormDefinition> result = formDefService.list(null, null, pageable);

        assertSame(expectedPage, result);
        verify(formDefRepository).findByTenantIdOrderByUpdatedAtDesc(TENANT_ID, pageable);
    }

    @Test
    void list_withTypeFilter_callsTypeRepositoryMethod() {
        Pageable pageable = PageRequest.of(0, 20);
        Page<FormDefinition> expectedPage = new PageImpl<>(List.of());
        when(formDefRepository.findByTenantIdAndTypeOrderByUpdatedAtDesc(
                TENANT_ID, "BUSINESS", pageable))
                .thenReturn(expectedPage);

        Page<FormDefinition> result = formDefService.list(null, null, "BUSINESS", pageable);

        assertSame(expectedPage, result);
        verify(formDefRepository).findByTenantIdAndTypeOrderByUpdatedAtDesc(
                TENANT_ID, "BUSINESS", pageable);
    }

    @Test
    void list_withTypeAndName_callsTypeNameRepositoryMethod() {
        Pageable pageable = PageRequest.of(0, 20);
        Page<FormDefinition> expectedPage = new PageImpl<>(List.of());
        when(formDefRepository.findByTenantIdAndTypeAndNameContainingOrderByUpdatedAtDesc(
                TENANT_ID, "BUSINESS", "leave", pageable))
                .thenReturn(expectedPage);

        Page<FormDefinition> result = formDefService.list(null, "leave", "BUSINESS", pageable);

        assertSame(expectedPage, result);
        verify(formDefRepository).findByTenantIdAndTypeAndNameContainingOrderByUpdatedAtDesc(
                TENANT_ID, "BUSINESS", "leave", pageable);
    }

    // ==================== Helper ====================

    private FormDefinition buildFormDef(String id, String key, int version, String status) {
        FormDefinition fd = new FormDefinition();
        fd.setId(id);
        fd.setTenantId(TENANT_ID);
        fd.setName("请假申请");
        fd.setKey(key);
        fd.setSchema("[]");
        fd.setVersion(version);
        fd.setStatus(status);
        return fd;
    }
}
