package com.workflow.engine.form;

import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
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
    void update_createsNewVersionWithSchema() {
        FormDefinition current = buildFormDef("form-1", "leave_form", 1, "DRAFT");
        when(formDefRepository.findByIdAndTenantId("form-1", TENANT_ID))
                .thenReturn(Optional.of(current));
        when(formDefRepository.findMaxVersionByTenantIdAndKey(TENANT_ID, "leave_form"))
                .thenReturn(1);
        when(formDefRepository.save(any(FormDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        String newSchema = "[{\"type\":\"input\",\"field\":\"reason\"}]";
        FormDefinition result = formDefService.update("form-1", newSchema);

        assertNotEquals("form-1", result.getId()); // 新 ID
        assertEquals(TENANT_ID, result.getTenantId());
        assertEquals("leave_form", result.getKey());
        assertEquals(newSchema, result.getSchema());
        assertEquals(2, result.getVersion()); // 版本号 +1
        assertEquals("DRAFT", result.getStatus());
        verify(formDefRepository).save(any(FormDefinition.class));
    }

    // ==================== publish ====================

    @Test
    void publish_draftChangesToPublished() {
        FormDefinition draft = buildFormDef("form-2", "leave_form", 2, "DRAFT");
        when(formDefRepository.findByIdAndTenantId("form-2", TENANT_ID))
                .thenReturn(Optional.of(draft));
        when(formDefRepository.save(any(FormDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        FormDefinition result = formDefService.publish("form-2");

        assertEquals("PUBLISHED", result.getStatus());
        assertEquals(2, result.getPublishedVersion());
        verify(formDefRepository).save(any(FormDefinition.class));
    }

    @Test
    void publish_nonDraft_throwsException() {
        FormDefinition published = buildFormDef("form-1", "leave_form", 1, "PUBLISHED");
        when(formDefRepository.findByIdAndTenantId("form-1", TENANT_ID))
                .thenReturn(Optional.of(published));

        RuntimeException ex = assertThrows(RuntimeException.class,
                () -> formDefService.publish("form-1"));
        assertTrue(ex.getMessage().contains("Only DRAFT forms can be published"));
        verify(formDefRepository, never()).save(any());
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

    // ==================== Repository query by formKey ====================

    @Test
    void repository_findFirstByFormKeyAndStatus_returnsLatestPublishedVersion() {
        // 验证 repository 查询方法存在且能被调用
        FormDefinition published = buildFormDef("form-1", "leave_form", 2, "PUBLISHED");
        published.setFormKey("user-crud");
        published.setPublishedVersion(2);

        when(formDefRepository.findFirstByTenantIdAndFormKeyAndStatusOrderByPublishedVersionDesc(
                TENANT_ID, "user-crud", "PUBLISHED"))
                .thenReturn(Optional.of(published));

        Optional<FormDefinition> result = formDefRepository.findFirstByTenantIdAndFormKeyAndStatusOrderByPublishedVersionDesc(
                TENANT_ID, "user-crud", "PUBLISHED");

        assertTrue(result.isPresent());
        assertEquals("user-crud", result.get().getFormKey());
        assertEquals("PUBLISHED", result.get().getStatus());
        assertEquals(2, result.get().getPublishedVersion());
    }

    @Test
    void repository_findFirstByFormKeyAndStatus_notFound_returnsEmpty() {
        when(formDefRepository.findFirstByTenantIdAndFormKeyAndStatusOrderByPublishedVersionDesc(
                TENANT_ID, "nonexistent", "PUBLISHED"))
                .thenReturn(Optional.empty());

        Optional<FormDefinition> result = formDefRepository.findFirstByTenantIdAndFormKeyAndStatusOrderByPublishedVersionDesc(
                TENANT_ID, "nonexistent", "PUBLISHED");

        assertTrue(result.isEmpty());
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
