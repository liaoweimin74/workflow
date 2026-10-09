package com.workflow.engine.task;

import com.workflow.engine.task.entity.WfTaskRemind;
import com.workflow.engine.task.repository.WfTaskRemindRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.TaskService;
import org.flowable.task.api.Task;
import org.flowable.task.api.TaskQuery;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * TaskRemindService 单元测试。
 *
 * <p>验证：
 * <ul>
 *   <li>首次催办成功 — 插入 wf_task_remind 记录 + 日志通知</li>
 *   <li>24h 内重复催办被拒绝 — 抛出异常</li>
 *   <li>超过 24h 后再次催办成功</li>
 *   <li>任务不存在时抛异常</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class TaskRemindServiceTest {

    @Mock
    TaskService flowableTaskService;
    @Mock
    WfTaskRemindRepository remindRepository;
    @Mock
    TenantProvider tenantProvider;

    @InjectMocks
    TaskRemindService taskRemindService;

    private Task mockTask(String taskId, String piId, String assignee) {
        Task task = mock(Task.class);
        lenient().when(task.getId()).thenReturn(taskId);
        lenient().when(task.getProcessInstanceId()).thenReturn(piId);
        lenient().when(task.getAssignee()).thenReturn(assignee);
        return task;
    }

    private void stubTaskQuery(Task task) {
        TaskQuery query = mock(TaskQuery.class);
        when(flowableTaskService.createTaskQuery()).thenReturn(query);
        when(query.taskId(anyString())).thenReturn(query);
        when(query.singleResult()).thenReturn(task);
    }

    @Test
    void remindSucceedsFirstTime() {
        Task task = mockTask("task-001", "pi-001", "bob");
        stubTaskQuery(task);
        when(tenantProvider.getTenantId()).thenReturn("tenant-1");
        when(remindRepository.findByTaskIdOrderByRemindTimeDesc("task-001"))
                .thenReturn(List.of());

        taskRemindService.remind("task-001", "alice");

        // 验证催办记录保存
        ArgumentCaptor<WfTaskRemind> captor = ArgumentCaptor.forClass(WfTaskRemind.class);
        verify(remindRepository).save(captor.capture());

        WfTaskRemind record = captor.getValue();
        assertThat(record.getTaskId()).isEqualTo("task-001");
        assertThat(record.getProcessInstanceId()).isEqualTo("pi-001");
        assertThat(record.getRemindFrom()).isEqualTo("alice");
        assertThat(record.getRemindTo()).isEqualTo("bob");
        assertThat(record.getTenantId()).isEqualTo("tenant-1");
        assertThat(record.getRemindTime()).isNotNull();
    }

    @Test
    void remindRejectedWithin24h() {
        Task task = mockTask("task-001", "pi-001", "bob");
        stubTaskQuery(task);

        // 模拟 1 小时前已有催办记录
        WfTaskRemind priorRemind = new WfTaskRemind();
        priorRemind.setTaskId("task-001");
        priorRemind.setRemindFrom("alice");
        priorRemind.setRemindTo("bob");
        priorRemind.setRemindTime(LocalDateTime.now().minusHours(1));

        when(remindRepository.findByTaskIdOrderByRemindTimeDesc("task-001"))
                .thenReturn(List.of(priorRemind));

        assertThatThrownBy(() -> taskRemindService.remind("task-001", "alice"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("24");

        // 验证没有插入新记录
        verify(remindRepository, never()).save(any());
    }

    @Test
    void remindSucceedsAfter24h() {
        Task task = mockTask("task-001", "pi-001", "bob");
        stubTaskQuery(task);
        when(tenantProvider.getTenantId()).thenReturn("tenant-1");

        // 模拟 25 小时前已有催办记录（超过 24h 限制）
        WfTaskRemind priorRemind = new WfTaskRemind();
        priorRemind.setTaskId("task-001");
        priorRemind.setRemindFrom("alice");
        priorRemind.setRemindTo("bob");
        priorRemind.setRemindTime(LocalDateTime.now().minusHours(25));

        when(remindRepository.findByTaskIdOrderByRemindTimeDesc("task-001"))
                .thenReturn(List.of(priorRemind));

        taskRemindService.remind("task-001", "alice");

        verify(remindRepository).save(any(WfTaskRemind.class));
    }

    @Test
    void remind_taskNotFound_throwsException() {
        stubTaskQuery(null);

        assertThatThrownBy(() -> taskRemindService.remind("nonexistent", "alice"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Task not found");
    }
}
