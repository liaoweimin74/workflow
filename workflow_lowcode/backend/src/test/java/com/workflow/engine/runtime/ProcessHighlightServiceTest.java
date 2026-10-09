package com.workflow.engine.runtime;

import org.flowable.engine.HistoryService;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.history.HistoricActivityInstance;
import org.flowable.engine.history.HistoricActivityInstanceQuery;
import org.flowable.engine.runtime.ActivityInstance;
import org.flowable.engine.runtime.ActivityInstanceQuery;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Date;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import org.mockito.Mockito;

/**
 * ProcessHighlightService 单元测试。
 *
 * <p>验证：返回已完成节点列表 + 当前活动节点列表，供前端流程图高亮。
 */
@ExtendWith(MockitoExtension.class)
class ProcessHighlightServiceTest {

    @Mock
    RuntimeService runtimeService;
    @Mock
    HistoryService historyService;
    @Mock
    RepositoryService repositoryService;

    @InjectMocks
    ProcessHighlightService highlightService;

    @Test
    void getHighlight_returnsCompletedAndActiveActivities() {
        HistoricActivityInstance startAct = mock(HistoricActivityInstance.class);
        when(startAct.getActivityId()).thenReturn("start");
        when(startAct.getEndTime()).thenReturn(new Date());

        HistoricActivityInstance initiatorAct = mock(HistoricActivityInstance.class);
        when(initiatorAct.getActivityId()).thenReturn("initiatorTask");
        when(initiatorAct.getEndTime()).thenReturn(new Date());

        HistoricActivityInstance managerAct = mock(HistoricActivityInstance.class);
        lenient().when(managerAct.getActivityId()).thenReturn("managerApproval");
        lenient().when(managerAct.getEndTime()).thenReturn(null);

        HistoricActivityInstanceQuery histQuery = mock(HistoricActivityInstanceQuery.class);
        when(historyService.createHistoricActivityInstanceQuery()).thenReturn(histQuery);
        when(histQuery.processInstanceId(anyString())).thenReturn(histQuery);
        when(histQuery.orderByHistoricActivityInstanceStartTime()).thenReturn(histQuery);
        when(histQuery.asc()).thenReturn(histQuery);
        when(histQuery.list()).thenReturn(List.of(startAct, initiatorAct, managerAct));

        ActivityInstance runtimeAct = mock(ActivityInstance.class);
        when(runtimeAct.getActivityId()).thenReturn("managerApproval");
        ActivityInstanceQuery actQuery = mock(ActivityInstanceQuery.class);
        when(runtimeService.createActivityInstanceQuery()).thenReturn(actQuery);
        when(actQuery.processInstanceId(anyString())).thenReturn(actQuery);
        when(actQuery.list()).thenReturn(List.of(runtimeAct));

        Map<String, Object> result = highlightService.getHighlight("pi-001");

        assertThat(result).containsKeys("completedActivityIds", "activeActivityIds");

        @SuppressWarnings("unchecked")
        List<String> completed = (List<String>) result.get("completedActivityIds");
        @SuppressWarnings("unchecked")
        List<String> active = (List<String>) result.get("activeActivityIds");

        assertThat(completed).containsExactly("start", "initiatorTask");
        assertThat(active).containsExactly("managerApproval");
    }

    @Test
    void getHighlight_noActivities_returnsEmptyLists() {
        HistoricActivityInstanceQuery histQuery = mock(HistoricActivityInstanceQuery.class);
        when(historyService.createHistoricActivityInstanceQuery()).thenReturn(histQuery);
        when(histQuery.processInstanceId(anyString())).thenReturn(histQuery);
        when(histQuery.orderByHistoricActivityInstanceStartTime()).thenReturn(histQuery);
        when(histQuery.asc()).thenReturn(histQuery);
        when(histQuery.list()).thenReturn(List.of());

        ActivityInstanceQuery actQuery = mock(ActivityInstanceQuery.class);
        when(runtimeService.createActivityInstanceQuery()).thenReturn(actQuery);
        when(actQuery.processInstanceId(anyString())).thenReturn(actQuery);
        when(actQuery.list()).thenReturn(List.of());

        Map<String, Object> result = highlightService.getHighlight("pi-001");

        @SuppressWarnings("unchecked")
        List<String> completed = (List<String>) result.get("completedActivityIds");
        @SuppressWarnings("unchecked")
        List<String> active = (List<String>) result.get("activeActivityIds");

        assertThat(completed).isEmpty();
        assertThat(active).isEmpty();
    }

    @Test
    void getHighlight_nullRuntimeActivities_returnsOnlyCompleted() {
        HistoricActivityInstance act = mock(HistoricActivityInstance.class);
        when(act.getActivityId()).thenReturn("start");
        when(act.getEndTime()).thenReturn(new Date());

        HistoricActivityInstanceQuery histQuery = mock(HistoricActivityInstanceQuery.class);
        when(historyService.createHistoricActivityInstanceQuery()).thenReturn(histQuery);
        when(histQuery.processInstanceId(anyString())).thenReturn(histQuery);
        when(histQuery.orderByHistoricActivityInstanceStartTime()).thenReturn(histQuery);
        when(histQuery.asc()).thenReturn(histQuery);
        when(histQuery.list()).thenReturn(List.of(act));

        ActivityInstanceQuery actQuery = mock(ActivityInstanceQuery.class);
        when(runtimeService.createActivityInstanceQuery()).thenReturn(actQuery);
        when(actQuery.processInstanceId(anyString())).thenReturn(actQuery);
        when(actQuery.list()).thenReturn(List.of());

        Map<String, Object> result = highlightService.getHighlight("pi-001");

        @SuppressWarnings("unchecked")
        List<String> active = (List<String>) result.get("activeActivityIds");
        assertThat(active).isEmpty();
    }
}
