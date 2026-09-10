package com.workflow.notification.bridge;

import org.flowable.common.engine.api.delegate.event.FlowableEngineEvent;
import org.flowable.common.engine.api.delegate.event.FlowableEngineEventType;
import org.flowable.common.engine.api.delegate.event.FlowableEntityEvent;
import org.flowable.common.engine.api.delegate.event.FlowableEvent;
import org.flowable.common.engine.api.delegate.event.FlowableEventListener;
import org.flowable.engine.impl.persistence.entity.ExecutionEntity;
import org.flowable.task.api.Task;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 工作流通知事件监听器（引擎全局监听器，注册见 FlowableEngineConfig）。
 *
 * <p>订阅两类事件并转发 {@link WorkflowNotifier}：
 * <ul>
 *   <li>{@code TASK_ASSIGNED}：任务分配/改派给办理人 → 通知办理人（待办提醒）；</li>
 *   <li>{@code PROCESS_COMPLETED}：流程实例办结 → 通知发起人。</li>
 * </ul>
 *
 * <p>实现约束：
 * <ul>
 *   <li>不在此处解析流程名/发起人昵称等需要额外查询的数据——仅抽取 ID，
 *       由 Notifier 统一经历史库/用户服务解析，保证监听器逻辑最轻；</li>
 *   <li>{@code isFailOnException()} 返回 false，且 onEvent 内部不再抛出任何异常，
 *       通知链路的任何故障（含历史库查询失败）都不影响引擎事务；</li>
 *   <li>流程实例的 tenantId 从事件负载透传给 Notifier，供无上下文线程（异步 Job）
 *       临时补设租户。</li>
 * </ul>
 */
public class WorkflowNotificationListener implements FlowableEventListener {

    private static final Logger log = LoggerFactory.getLogger(WorkflowNotificationListener.class);

    private final WorkflowNotifier notifier;

    public WorkflowNotificationListener(WorkflowNotifier notifier) {
        this.notifier = notifier;
    }

    @Override
    public void onEvent(FlowableEvent event) {
        try {
            dispatch(event);
        } catch (Exception e) {
            // isFailOnException=false；双保险兜底，确保通知永不影响引擎流转
            log.error("WorkflowNotificationListener failed to handle event {}: {}",
                    event != null ? event.getType() : null, e.getMessage(), e);
        }
    }

    private void dispatch(FlowableEvent event) {
        if (!(event instanceof FlowableEngineEvent engineEvent)) {
            return;
        }

        if (event.getType() == FlowableEngineEventType.TASK_ASSIGNED
                && event instanceof FlowableEntityEvent entityEvent
                && entityEvent.getEntity() instanceof Task task) {
            String assignee = task.getAssignee();
            if (assignee == null || assignee.isBlank()) {
                return; // 未分配（候选人组场景）不推送
            }
            notifier.notifyTaskAssigned(task.getTenantId(), assignee, task.getName(),
                    task.getProcessInstanceId(), null, task.getId());
            return;
        }

        if (event.getType() == FlowableEngineEventType.PROCESS_COMPLETED
                && event instanceof FlowableEntityEvent entityEvent
                && entityEvent.getEntity() instanceof ExecutionEntity execution) {
            String instanceId = engineEvent.getProcessInstanceId() != null
                    ? engineEvent.getProcessInstanceId()
                    : execution.getId();
            notifier.notifyProcessFinished(execution.getTenantId(), instanceId);
        }
    }

    @Override
    public boolean isFailOnException() {
        return false;
    }

    @Override
    public boolean isFireOnTransactionLifecycleEvent() {
        return false;
    }

    @Override
    public String getOnTransaction() {
        return null;
    }
}
