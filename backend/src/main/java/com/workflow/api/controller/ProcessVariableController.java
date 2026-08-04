package com.workflow.api.controller;

import com.workflow.common.domain.R;
import com.workflow.engine.runtime.ProcessVariableService;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * 流程变量管理 REST API。
 */
@RestController
@RequestMapping("/api/v1/process-instances")
public class ProcessVariableController {

    private final ProcessVariableService variableService;

    public ProcessVariableController(ProcessVariableService variableService) {
        this.variableService = variableService;
    }

    /**
     * 获取流程实例全部变量。
     */
    @GetMapping("/{processInstanceId}/variables")
    public R<Map<String, Object>> getVariables(@PathVariable String processInstanceId) {
        return R.ok(variableService.getVariables(processInstanceId));
    }

    /**
     * 获取流程实例单个变量。
     */
    @GetMapping("/{processInstanceId}/variables/{name}")
    public R<Object> getVariable(@PathVariable String processInstanceId, @PathVariable String name) {
        return R.ok(variableService.getVariable(processInstanceId, name));
    }

    /**
     * 批量设置流程实例变量。
     */
    @PutMapping("/{processInstanceId}/variables")
    public R<Void> setVariables(@PathVariable String processInstanceId,
                                @RequestBody Map<String, Object> variables) {
        variableService.setVariables(processInstanceId, variables != null ? variables : new HashMap<>());
        return R.ok();
    }

    /**
     * 设置流程实例单个变量。
     */
    @PutMapping("/{processInstanceId}/variables/{name}")
    public R<Void> setVariable(@PathVariable String processInstanceId,
                               @PathVariable String name,
                               @RequestBody Map<String, Object> body) {
        Object value = body != null ? body.get("value") : null;
        variableService.setVariable(processInstanceId, name, value);
        return R.ok();
    }

    /**
     * 删除流程实例变量。
     */
    @DeleteMapping("/{processInstanceId}/variables/{name}")
    public R<Void> removeVariable(@PathVariable String processInstanceId, @PathVariable String name) {
        variableService.removeVariable(processInstanceId, name);
        return R.ok();
    }

    /**
     * 通过任务 ID 设置流程变量。
     */
    @PutMapping("/tasks/{taskId}/variables")
    public R<Void> setTaskVariables(@PathVariable String taskId, @RequestBody Map<String, Object> variables) {
        variableService.setTaskVariables(taskId, variables != null ? variables : new HashMap<>());
        return R.ok();
    }
}
