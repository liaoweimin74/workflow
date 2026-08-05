package com.workflow.engine.process;

import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.history.HistoricProcessInstanceQuery;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.engine.runtime.ProcessInstanceQuery;
import org.flowable.engine.HistoryService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * ProcessInstanceService 筛选功能单元测试。
 *
 * <p>验证：listProcessInstances 支持 initiator / status / processName 可选筛选参数。
 */
class ProcessInstanceServiceFilterTest {

    private RuntimeService runtimeService;
    private HistoryService historyService;
    private TenantProvider tenantProvider;
    private ProcessInstanceService service;

    @BeforeEach
    void setUp() {
        runtimeService = mock(RuntimeService.class);
        historyService = mock(HistoryService.class);
        tenantProvider = mock(TenantProvider.class);
        when(tenantProvider.getTenantId()).thenReturn("test-tenant");
        service = new ProcessInstanceService(runtimeService, historyService, tenantProvider);
    }

    /**
     * 构建已 mock 的 ProcessInstanceQuery 查询链。
     */
    private ProcessInstanceQuery buildMockedQuery() {
        ProcessInstanceQuery query = mock(ProcessInstanceQuery.class);
        when(runtimeService.createProcessInstanceQuery()).thenReturn(query);
        when(query.processInstanceTenantId(anyString())).thenReturn(query);
        when(query.startedBy(anyString())).thenReturn(query);
        when(query.active()).thenReturn(query);
        when(query.suspended()).thenReturn(query);
        when(query.processDefinitionNameLike(anyString())).thenReturn(query);
        when(query.variableValueEquals(anyString(), any())).thenReturn(query);
        when(query.orderByProcessInstanceId()).thenReturn(query);
        when(query.desc()).thenReturn(query);
        when(query.count()).thenReturn(0L);
        when(query.listPage(anyInt(), anyInt())).thenReturn(List.of());
        return query;
    }

    // ==================== initiator 筛选 ====================

    @Test
    void initiatorFilter_appliesVariableValueEquals() {
        ProcessInstanceQuery query = buildMockedQuery();
        Pageable pageable = PageRequest.of(0, 20);

        service.listProcessInstances(pageable, "user-42", null, null);

        verify(query).variableValueEquals(eq("initiator"), eq("user-42"));
        verify(query, never()).active();
        verify(query, never()).suspended();
        verify(query, never()).processDefinitionNameLike(anyString());
    }

    @Test
    void initiatorNull_doesNotApplyInitiatorFilter() {
        ProcessInstanceQuery query = buildMockedQuery();
        Pageable pageable = PageRequest.of(0, 20);

        service.listProcessInstances(pageable, null, null, null);

        verify(query, never()).variableValueEquals(eq("initiator"), any());
    }

    @Test
    void initiatorBlank_doesNotApplyInitiatorFilter() {
        ProcessInstanceQuery query = buildMockedQuery();
        Pageable pageable = PageRequest.of(0, 20);

        service.listProcessInstances(pageable, "  ", null, null);

        verify(query, never()).variableValueEquals(eq("initiator"), any());
    }

    // ==================== status 筛选 ====================

    @Test
    void statusRunning_appliesActiveFilter() {
        ProcessInstanceQuery query = buildMockedQuery();
        Pageable pageable = PageRequest.of(0, 20);

        service.listProcessInstances(pageable, null, "running", null);

        verify(query).active();
        verify(query, never()).suspended();
    }

    @Test
    void statusSuspended_appliesSuspendedFilter() {
        ProcessInstanceQuery query = buildMockedQuery();
        Pageable pageable = PageRequest.of(0, 20);

        service.listProcessInstances(pageable, null, "suspended", null);

        verify(query).suspended();
        verify(query, never()).active();
    }

    @Test
    void statusNull_doesNotApplyStatusFilter() {
        ProcessInstanceQuery query = buildMockedQuery();
        Pageable pageable = PageRequest.of(0, 20);

        service.listProcessInstances(pageable, null, null, null);

        verify(query, never()).active();
        verify(query, never()).suspended();
    }

    // ==================== processName 筛选 ====================

    @Test
    void processNameFilter_appliesNameLike() {
        ProcessInstanceQuery query = buildMockedQuery();
        Pageable pageable = PageRequest.of(0, 20);

        service.listProcessInstances(pageable, null, null, "leave");

        verify(query).processDefinitionNameLike(eq("leave"));
    }

    @Test
    void processNameNull_doesNotApplyNameFilter() {
        ProcessInstanceQuery query = buildMockedQuery();
        Pageable pageable = PageRequest.of(0, 20);

        service.listProcessInstances(pageable, null, null, null);

        verify(query, never()).processDefinitionNameLike(anyString());
    }

    @Test
    void processNameBlank_doesNotApplyNameFilter() {
        ProcessInstanceQuery query = buildMockedQuery();
        Pageable pageable = PageRequest.of(0, 20);

        service.listProcessInstances(pageable, null, null, "");

        verify(query, never()).processDefinitionNameLike(anyString());
    }

    // ==================== 组合筛选 ====================

    @Test
    void allFilters_appliedTogether() {
        ProcessInstanceQuery query = buildMockedQuery();
        Pageable pageable = PageRequest.of(0, 20);

        service.listProcessInstances(pageable, "user-1", "running", "leave");

        verify(query).variableValueEquals(eq("initiator"), eq("user-1"));
        verify(query).active();
        verify(query).processDefinitionNameLike(eq("leave"));
    }

    // ==================== 分页结果 ====================

    @Test
    void returnsPagedResult_withFilters() {
        ProcessInstanceQuery query = buildMockedQuery();
        ProcessInstance inst = mock(ProcessInstance.class);
        when(inst.getId()).thenReturn("inst-001");
        when(query.count()).thenReturn(1L);
        when(query.listPage(anyInt(), anyInt())).thenReturn(List.of(inst));
        Pageable pageable = PageRequest.of(0, 10);

        Page<ProcessInstance> result = service.listProcessInstances(pageable, "user-1", "running", "leave");

        assertThat(result.getContent()).hasSize(1);
        assertThat(result.getTotalElements()).isEqualTo(1);
        assertThat(result.getContent().get(0).getId()).isEqualTo("inst-001");
    }

    // ==================== 向后兼容：无参数重载 ====================

    @Test
    void noArgOverload_callsFilteredWithAllNulls() {
        ProcessInstanceQuery query = buildMockedQuery();
        Pageable pageable = PageRequest.of(0, 20);

        service.listProcessInstances(pageable);

        verify(query, never()).variableValueEquals(anyString(), any());
        verify(query, never()).active();
        verify(query, never()).suspended();
        verify(query, never()).processDefinitionNameLike(anyString());
        verify(query).count();
        verify(query).listPage(anyInt(), anyInt());
    }
}
