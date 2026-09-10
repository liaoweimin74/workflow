package com.workflow.engine.logic.listener;

import com.workflow.engine.logic.executor.BackendLogicExecutor;
import org.flowable.common.engine.api.delegate.event.FlowableEngineEvent;
import org.flowable.common.engine.api.delegate.event.FlowableEngineEventType;
import org.flowable.common.engine.api.delegate.event.FlowableEntityEvent;
import org.flowable.common.engine.api.delegate.event.FlowableEvent;
import org.flowable.common.engine.api.delegate.event.FlowableEventListener;
import org.flowable.engine.delegate.event.FlowableActivityEvent;
import org.flowable.engine.delegate.event.FlowableProcessStartedEvent;
import org.flowable.task.api.Task;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Flowable 全局事件监听器，负责在后端逻辑配置的节点进入/完成时触发执行。
 *
 * <p>映射关系（见 design D1）：
 * <ul>
 *   <li>开始事件 ENTER ← {@code PROCESS_STARTED}</li>
 *   <li>用户任务 ENTER ← {@code ACTIVITY_STARTED}（活动类型 userTask）</li>
 *   <li>用户任务 COMPLETE ← {@code TASK_COMPLETED}</li>
 *   <li>结束事件 COMPLETE ← {@code ACTIVITY_COMPLETED}（活动类型 endEvent）</li>
 * </ul>
 */
public class BackendLogicEventListener implements FlowableEventListener {

    private static final Logger log = LoggerFactory.getLogger(BackendLogicEventListener.class);

    private final BackendLogicExecutor backendLogicExecutor;

    public BackendLogicEventListener(BackendLogicExecutor backendLogicExecutor) {
        this.backendLogicExecutor = backendLogicExecutor;
    }

    @Override
    public void onEvent(FlowableEvent event) {
        try {
            dispatch(event);
        } catch (Exception e) {
            // isFailOnException=false 时由监听器自行吞掉，避免影响引擎流转。
            log.error("BackendLogicEventListener failed to handle event {}: {}", event.getType(), e.getMessage(), e);
        }
    }

    private void dispatch(FlowableEvent event) {
        if (event == null) {
            return;
        }
        if (event.getType() == FlowableEngineEventType.PROCESS_STARTED && event instanceof FlowableProcessStartedEvent pi) {
            handleProcessStarted(pi);
            return;
        }
        if (event.getType() == FlowableEngineEventType.TASK_COMPLETED) {
            handleTaskCompleted(event);
            return;
        }
        if (event.getType() == FlowableEngineEventType.ACTIVITY_STARTED && event instanceof FlowableActivityEvent ae) {
            if ("userTask".equals(ae.getActivityType())) {
                run(ae, "ENTER");
            }
            return;
        }
        if (event.getType() == FlowableEngineEventType.ACTIVITY_COMPLETED && event instanceof FlowableActivityEvent ae) {
            if ("endEvent".equals(ae.getActivityType())) {
                run(ae, "COMPLETE");
            }
        }
    }

    private void handleProcessStarted(FlowableProcessStartedEvent pi) {
        FlowableEngineEvent engineEvent = (FlowableEngineEvent) pi;
        String processDefinitionId = engineEvent.getProcessDefinitionId();
        String processInstanceId = engineEvent.getProcessInstanceId();
        if (processDefinitionId == null || processDefinitionId.isBlank()) {
            return;
        }
        // 流程开始节点的 nodeId 即 startEvent；这里用流程实例 id 作为 executionId 读取变量。
        run(processDefinitionId, processInstanceId, processInstanceId, "ENTER");
    }

    private void run(FlowableActivityEvent ae, String trigger) {
        String nodeId = ae.getActivityId();
        String processId = ae.getProcessDefinitionId();
        String executionId = ae.getExecutionId();
        if (nodeId == null || nodeId.isBlank()) {
            return;
        }
        run(processId, nodeId, executionId, trigger);
    }

    private void run(String processId, String nodeId, String executionId, String trigger) {
        if (processId == null || processId.isBlank() || executionId == null || executionId.isBlank()) {
            return;
        }
        backendLogicExecutor.execute(processId, nodeId, trigger, executionId);
    }

    private void handleTaskCompleted(FlowableEvent event) {
        if (!(event instanceof FlowableEntityEvent entityEvent)) {
            return;
        }
        Object entity = entityEvent.getEntity();
        if (!(entity instanceof Task task)) {
            return;
        }
        String nodeId = task.getTaskDefinitionKey();
        String processDefinitionId = task.getProcessDefinitionId();
        String executionId = task.getExecutionId();
        if (executionId == null || executionId.isBlank()) {
            executionId = task.getProcessInstanceId();
        }
        run(processDefinitionId, nodeId, executionId, "COMPLETE");
    }

    @Override
    public boolean isFailOnException() {
        // 异常由本监听器自行处理（按节点 errorAction），不中断引擎。
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