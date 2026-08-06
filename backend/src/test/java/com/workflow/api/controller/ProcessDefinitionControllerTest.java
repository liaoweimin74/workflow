package com.workflow.api.controller;

import com.workflow.api.dto.PageResponse;
import com.workflow.common.domain.R;
import com.workflow.engine.process.ProcessService;
import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.repository.ProcessDefinition;
import org.flowable.engine.repository.ProcessDefinitionQuery;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.*;

/**
 * ProcessDefinitionController 单元测试。
 *
 * <p>验证：list() 方法将 categoryId/name/status 查询参数传递给 ProcessService，
 * 后者将其转化为 Flowable ProcessDefinitionQuery 的链式过滤条件。
 */
class ProcessDefinitionControllerTest {

    // ==================== Controller 层：参数传递 ====================

    @Test
    void listByCategoryId() {
        ProcessService mockService = mock(ProcessService.class);
        when(mockService.listProcessDefinitions(any(), any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));
        ProcessDefinitionController controller = new ProcessDefinitionController(mockService);

        R<PageResponse<Map<String, Object>>> result = controller.list(0, 20, "cat-1", null, null);

        assertThat(result.getCode()).isEqualTo(200);
        verify(mockService).listProcessDefinitions(
                eq(PageRequest.of(0, 20)), eq("cat-1"), isNull(), isNull());
    }

    @Test
    void listByName() {
        ProcessService mockService = mock(ProcessService.class);
        when(mockService.listProcessDefinitions(any(), any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));
        ProcessDefinitionController controller = new ProcessDefinitionController(mockService);

        R<PageResponse<Map<String, Object>>> result = controller.list(0, 20, null, "leave", null);

        assertThat(result.getCode()).isEqualTo(200);
        verify(mockService).listProcessDefinitions(
                eq(PageRequest.of(0, 20)), isNull(), eq("leave"), isNull());
    }

    @Test
    void listByStatus_active() {
        ProcessService mockService = mock(ProcessService.class);
        when(mockService.listProcessDefinitions(any(), any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));
        ProcessDefinitionController controller = new ProcessDefinitionController(mockService);

        R<PageResponse<Map<String, Object>>> result = controller.list(0, 20, null, null, "active");

        assertThat(result.getCode()).isEqualTo(200);
        verify(mockService).listProcessDefinitions(
                eq(PageRequest.of(0, 20)), isNull(), isNull(), eq("active"));
    }

    @Test
    void listByStatus_suspended() {
        ProcessService mockService = mock(ProcessService.class);
        when(mockService.listProcessDefinitions(any(), any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));
        ProcessDefinitionController controller = new ProcessDefinitionController(mockService);

        controller.list(0, 20, null, null, "suspended");

        verify(mockService).listProcessDefinitions(
                any(), isNull(), isNull(), eq("suspended"));
    }

    @Test
    void listWithAllFilters() {
        ProcessService mockService = mock(ProcessService.class);
        when(mockService.listProcessDefinitions(any(), any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));
        ProcessDefinitionController controller = new ProcessDefinitionController(mockService);

        controller.list(0, 20, "cat-1", "leave", "active");

        verify(mockService).listProcessDefinitions(
                eq(PageRequest.of(0, 20)), eq("cat-1"), eq("leave"), eq("active"));
    }

    @Test
    void listWithoutFilters_backwardCompatible() {
        ProcessService mockService = mock(ProcessService.class);
        when(mockService.listProcessDefinitions(any(), any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));
        ProcessDefinitionController controller = new ProcessDefinitionController(mockService);

        R<PageResponse<Map<String, Object>>> result = controller.list(0, 20, null, null, null);

        assertThat(result.getCode()).isEqualTo(200);
        verify(mockService).listProcessDefinitions(
                eq(PageRequest.of(0, 20)), isNull(), isNull(), isNull());
    }

    @Test
    void list_returnsCorrectPageResponse() {
        ProcessDefinition mockPd = mock(ProcessDefinition.class);
        when(mockPd.getId()).thenReturn("pd-1");
        Page<ProcessDefinition> servicePage = new PageImpl<>(
                List.of(mockPd), PageRequest.of(0, 20), 1);

        ProcessService mockService = mock(ProcessService.class);
        when(mockService.listProcessDefinitions(any(), any(), any(), any()))
                .thenReturn(servicePage);
        ProcessDefinitionController controller = new ProcessDefinitionController(mockService);

        R<PageResponse<Map<String, Object>>> result = controller.list(0, 20, null, null, null);

        assertThat(result.getCode()).isEqualTo(200);
        assertThat(result.getData().getContent()).hasSize(1);
        assertThat(result.getData().getTotalElements()).isEqualTo(1);
        assertThat(result.getData().getPageNumber()).isEqualTo(0);
        assertThat(result.getData().getPageSize()).isEqualTo(20);
    }

    // ==================== ProcessService 层：Flowable 查询条件 ====================

    /**
     * 构建已 mock 的 ProcessService（含 Flowable 查询链），用于验证查询条件。
     */
    private ProcessService buildServiceWithMockedQuery(ProcessDefinitionQuery query) {
        RepositoryService repoService = mock(RepositoryService.class);
        TenantProvider tenantProvider = mock(TenantProvider.class);
        when(repoService.createProcessDefinitionQuery()).thenReturn(query);
        when(tenantProvider.getTenantId()).thenReturn("test-tenant");

        when(query.processDefinitionTenantId(anyString())).thenReturn(query);
        when(query.latestVersion()).thenReturn(query);
        when(query.processDefinitionCategoryLike(anyString())).thenReturn(query);
        when(query.processDefinitionNameLike(anyString())).thenReturn(query);
        when(query.active()).thenReturn(query);
        when(query.suspended()).thenReturn(query);
        when(query.orderByProcessDefinitionVersion()).thenReturn(query);
        when(query.desc()).thenReturn(query);
        when(query.count()).thenReturn(0L);
        when(query.listPage(anyInt(), anyInt())).thenReturn(List.of());

        return new ProcessService(repoService, tenantProvider);
    }

    @Test
    void processService_categoryFilter_appliesCategoryLike() {
        ProcessDefinitionQuery query = mock(ProcessDefinitionQuery.class);
        ProcessService service = buildServiceWithMockedQuery(query);

        service.listProcessDefinitions(PageRequest.of(0, 20), "cat-1", null, null);

        verify(query).processDefinitionCategoryLike(eq("cat-1"));
        verify(query, never()).processDefinitionNameLike(anyString());
        verify(query, never()).active();
        verify(query, never()).suspended();
    }

    @Test
    void processService_nameFilter_appliesNameLike() {
        ProcessDefinitionQuery query = mock(ProcessDefinitionQuery.class);
        ProcessService service = buildServiceWithMockedQuery(query);

        service.listProcessDefinitions(PageRequest.of(0, 20), null, "leave", null);

        verify(query).processDefinitionNameLike(eq("leave"));
        verify(query, never()).processDefinitionCategoryLike(anyString());
    }

    @Test
    void processService_statusActive_appliesActiveFilter() {
        ProcessDefinitionQuery query = mock(ProcessDefinitionQuery.class);
        ProcessService service = buildServiceWithMockedQuery(query);

        service.listProcessDefinitions(PageRequest.of(0, 20), null, null, "active");

        verify(query).active();
        verify(query, never()).suspended();
    }

    @Test
    void processService_statusSuspended_appliesSuspendedFilter() {
        ProcessDefinitionQuery query = mock(ProcessDefinitionQuery.class);
        ProcessService service = buildServiceWithMockedQuery(query);

        service.listProcessDefinitions(PageRequest.of(0, 20), null, null, "suspended");

        verify(query).suspended();
        verify(query, never()).active();
    }

    @Test
    void processService_noFilters_doesNotApplyAnyFilter() {
        ProcessDefinitionQuery query = mock(ProcessDefinitionQuery.class);
        ProcessService service = buildServiceWithMockedQuery(query);

        service.listProcessDefinitions(PageRequest.of(0, 20), null, null, null);

        verify(query, never()).processDefinitionCategoryLike(anyString());
        verify(query, never()).processDefinitionNameLike(anyString());
        verify(query, never()).active();
        verify(query, never()).suspended();
    }

    @Test
    void processService_allFilters_appliedTogether() {
        ProcessDefinitionQuery query = mock(ProcessDefinitionQuery.class);
        ProcessService service = buildServiceWithMockedQuery(query);

        service.listProcessDefinitions(PageRequest.of(0, 20), "cat-1", "leave", "active");

        verify(query).processDefinitionCategoryLike(eq("cat-1"));
        verify(query).processDefinitionNameLike(eq("leave"));
        verify(query).active();
    }
}
