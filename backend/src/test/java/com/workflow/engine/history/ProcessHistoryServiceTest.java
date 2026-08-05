package com.workflow.engine.history;

import com.workflow.api.dto.ApprovalRecordVO;
import com.workflow.engine.history.entity.WfTaskComment;
import com.workflow.engine.history.repository.WfTaskCommentRepository;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.system.domain.vo.UserVO;
import com.workflow.system.service.UserService;
import org.flowable.engine.HistoryService;
import org.flowable.engine.history.HistoricActivityInstance;
import org.flowable.engine.history.HistoricActivityInstanceQuery;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Date;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * ProcessHistoryService 单元测试。
 *
 * <p>验证：将 Flowable HistoricActivityInstance + wf_task_comment 聚合为
 * ApprovalRecordVO 时间线列表，按 startTime 正序排列。
 */
@ExtendWith(MockitoExtension.class)
class ProcessHistoryServiceTest {

    @Mock
    HistoryService historyService;
    @Mock
    WfTaskCommentRepository commentRepository;
    @Mock
    TenantProvider tenantProvider;
    @Mock
    UserService userService;

    @InjectMocks
    ProcessHistoryService processHistoryService;

    @SuppressWarnings("unchecked")
    private HistoricActivityInstanceQuery mockActivityQuery(List<HistoricActivityInstance> activities) {
        HistoricActivityInstanceQuery query = mock(HistoricActivityInstanceQuery.class);
        lenient().when(historyService.createHistoricActivityInstanceQuery()).thenReturn(query);
        lenient().when(query.processInstanceId(anyString())).thenReturn(query);
        lenient().when(query.activityType("userTask")).thenReturn(query);
        lenient().when(query.orderByHistoricActivityInstanceStartTime()).thenReturn(query);
        lenient().when(query.asc()).thenReturn(query);
        lenient().when(query.list()).thenReturn(activities);
        return query;
    }

    private HistoricActivityInstance mockActivity(String activityId, String activityName,
                                                   String assignee,
                                                   Date startTime, Date endTime) {
        HistoricActivityInstance act = mock(HistoricActivityInstance.class);
        lenient().when(act.getActivityId()).thenReturn(activityId);
        lenient().when(act.getActivityName()).thenReturn(activityName);
        lenient().when(act.getActivityType()).thenReturn("userTask");
        lenient().when(act.getAssignee()).thenReturn(assignee);
        lenient().when(act.getStartTime()).thenReturn(startTime);
        lenient().when(act.getEndTime()).thenReturn(endTime);
        lenient().when(act.getTaskId()).thenReturn("task-" + activityId);
        return act;
    }

    private Date toDate(LocalDateTime ldt) {
        return Date.from(ldt.atZone(ZoneId.systemDefault()).toInstant());
    }

    @Test
    void getHistoryReturnsApprovalRecords_sortedByStartTime() {
        // 两个历史活动节点
        Date start1 = toDate(LocalDateTime.of(2025, 1, 1, 10, 0));
        Date end1 = toDate(LocalDateTime.of(2025, 1, 1, 10, 30));
        Date start2 = toDate(LocalDateTime.of(2025, 1, 1, 11, 0));
        Date end2 = toDate(LocalDateTime.of(2025, 1, 1, 11, 15));

        HistoricActivityInstance act1 = mockActivity("initiatorTask", "发起人填表", "alice", start1, end1);
        HistoricActivityInstance act2 = mockActivity("managerApproval", "经理审批", "bob", start2, end2);

        lenient().when(tenantProvider.getTenantId()).thenReturn("tenant-1");
        mockActivityQuery(List.of(act1, act2));

        // 审批意见
        WfTaskComment comment1 = new WfTaskComment();
        comment1.setTaskId("task-initiatorTask");
        comment1.setUserId("alice");
        comment1.setAction("complete");
        comment1.setComment("提交申请");

        WfTaskComment comment2 = new WfTaskComment();
        comment2.setTaskId("task-managerApproval");
        comment2.setUserId("bob");
        comment2.setAction("complete");
        comment2.setComment("同意");

        lenient().when(commentRepository.findByProcessInstanceIdOrderByCreatedAtAsc("pi-001"))
                .thenReturn(List.of(comment1, comment2));

        // UserService 返回用户名
        UserVO alice = new UserVO(1L, "alice", "Alice", null, null, null, null, null, 1, null, null);
        UserVO bob = new UserVO(2L, "bob", "Bob", null, null, null, null, null, 1, null, null);
        lenient().when(userService.findByUsernames(any())).thenReturn(List.of(alice, bob));

        List<ApprovalRecordVO> result = processHistoryService.getApprovalHistory("pi-001");

        assertThat(result).hasSize(2);

        // 第一个记录：发起人
        ApprovalRecordVO r1 = result.get(0);
        assertThat(r1.getActivityId()).isEqualTo("initiatorTask");
        assertThat(r1.getActivityName()).isEqualTo("发起人填表");
        assertThat(r1.getAssignee()).isEqualTo("alice");
        assertThat(r1.getAssigneeName()).isEqualTo("Alice");
        assertThat(r1.getStartTime()).isNotNull();
        assertThat(r1.getEndTime()).isNotNull();
        assertThat(r1.getAction()).isEqualTo("complete");
        assertThat(r1.getComment()).isEqualTo("提交申请");

        // 第二个记录：经理审批
        ApprovalRecordVO r2 = result.get(1);
        assertThat(r2.getActivityId()).isEqualTo("managerApproval");
        assertThat(r2.getActivityName()).isEqualTo("经理审批");
        assertThat(r2.getAssignee()).isEqualTo("bob");
        assertThat(r2.getAssigneeName()).isEqualTo("Bob");
        assertThat(r2.getAction()).isEqualTo("complete");
        assertThat(r2.getComment()).isEqualTo("同意");
    }

    @Test
    void getHistory_noComments_actionIsNull() {
        Date start = toDate(LocalDateTime.of(2025, 1, 1, 10, 0));
        Date end = toDate(LocalDateTime.of(2025, 1, 1, 10, 30));

        HistoricActivityInstance act = mockActivity("initiatorTask", "发起人填表", "alice", start, end);

        lenient().when(tenantProvider.getTenantId()).thenReturn("tenant-1");
        mockActivityQuery(List.of(act));

        lenient().when(commentRepository.findByProcessInstanceIdOrderByCreatedAtAsc("pi-001"))
                .thenReturn(List.of());

        lenient().when(userService.findByUsernames(any())).thenReturn(List.of());

        List<ApprovalRecordVO> result = processHistoryService.getApprovalHistory("pi-001");

        assertThat(result).hasSize(1);
        ApprovalRecordVO r = result.get(0);
        assertThat(r.getActivityId()).isEqualTo("initiatorTask");
        assertThat(r.getAction()).isNull();
        assertThat(r.getComment()).isNull();
    }

    @Test
    void getHistory_emptyActivities_returnsEmptyList() {
        lenient().when(tenantProvider.getTenantId()).thenReturn("tenant-1");
        mockActivityQuery(List.of());

        List<ApprovalRecordVO> result = processHistoryService.getApprovalHistory("pi-001");

        assertThat(result).isEmpty();
    }

    @Test
    void getHistory_ongoingActivity_endTimeIsNull() {
        Date start = toDate(LocalDateTime.of(2025, 1, 1, 10, 0));

        // 活动尚未结束：endTime = null
        HistoricActivityInstance act = mockActivity("managerApproval", "经理审批", "bob", start, null);

        lenient().when(tenantProvider.getTenantId()).thenReturn("tenant-1");
        mockActivityQuery(List.of(act));

        lenient().when(commentRepository.findByProcessInstanceIdOrderByCreatedAtAsc("pi-001"))
                .thenReturn(List.of());

        lenient().when(userService.findByUsernames(any())).thenReturn(List.of());

        List<ApprovalRecordVO> result = processHistoryService.getApprovalHistory("pi-001");

        assertThat(result).hasSize(1);
        ApprovalRecordVO r = result.get(0);
        assertThat(r.getStartTime()).isNotNull();
        assertThat(r.getEndTime()).isNull();
    }
}
