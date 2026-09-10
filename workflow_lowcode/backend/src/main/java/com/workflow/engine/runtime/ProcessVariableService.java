package com.workflow.engine.runtime;

import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.task.api.Task;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

/**
 * 流程变量管理服务。
 *
 * <p>提供运行时实例级和任务级的流程变量读写操作。
 * 任务级变量写入时，通过任务反查 processInstanceId，写入到实例级。
 */
@Service
public class ProcessVariableService {

    private static final Logger log = LoggerFactory.getLogger(ProcessVariableService.class);

    private final RuntimeService runtimeService;
    private final TaskService flowableTaskService;

    public ProcessVariableService(RuntimeService runtimeService, TaskService flowableTaskService) {
        this.runtimeService = runtimeService;
        this.flowableTaskService = flowableTaskService;
    }

    /**
     * 获取流程实例的全部变量。
     */
    public Map<String, Object> getVariables(String processInstanceId) {
        return runtimeService.getVariables(processInstanceId);
    }

    /**
     * 获取流程实例的单个变量。
     */
    public Object getVariable(String processInstanceId, String variableName) {
        return runtimeService.getVariable(processInstanceId, variableName);
    }

    /**
     * 批量设置流程实例变量。
     */
    @Transactional
    public void setVariables(String processInstanceId, Map<String, Object> variables) {
        log.debug("设置流程变量 pi={} vars={}", processInstanceId, variables.keySet());
        runtimeService.setVariables(processInstanceId, variables);
    }

    /**
     * 设置流程实例单个变量。
     */
    @Transactional
    public void setVariable(String processInstanceId, String variableName, Object value) {
        log.debug("设置流程变量 pi={} name={}", processInstanceId, variableName);
        runtimeService.setVariable(processInstanceId, variableName, value);
    }

    /**
     * 通过任务 ID 设置流程变量（写入到任务所属的流程实例）。
     */
    @Transactional
    public void setTaskVariables(String taskId, Map<String, Object> variables) {
        Task task = flowableTaskService.createTaskQuery()
                .taskId(taskId)
                .singleResult();

        if (task == null) {
            throw new IllegalStateException("Task not found: " + taskId);
        }

        String processInstanceId = task.getProcessInstanceId();
        log.debug("通过任务设置流程变量 taskId={} pi={} vars={}", taskId, processInstanceId, variables.keySet());
        runtimeService.setVariables(processInstanceId, variables);
    }

    /**
     * 删除流程实例变量。
     */
    @Transactional
    public void removeVariable(String processInstanceId, String variableName) {
        log.debug("删除流程变量 pi={} name={}", processInstanceId, variableName);
        runtimeService.removeVariable(processInstanceId, variableName);
    }
}
