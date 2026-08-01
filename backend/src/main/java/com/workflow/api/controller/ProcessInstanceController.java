package com.workflow.api.controller;

import com.workflow.api.dto.*;
import com.workflow.engine.process.ProcessInstanceService;
import org.flowable.engine.runtime.ProcessInstance;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/process-instances")
public class ProcessInstanceController {

    private final ProcessInstanceService processInstanceService;

    public ProcessInstanceController(ProcessInstanceService processInstanceService) {
        this.processInstanceService = processInstanceService;
    }

    @PostMapping
    public Result<Map<String, Object>> start(@RequestBody StartProcessRequest request) {
        Map<String, Object> variables = request.getVariables() != null ? request.getVariables() : new HashMap<>();

        ProcessInstance instance;
        if (request.getBusinessKey() != null) {
            instance = processInstanceService.startProcess(request.getProcessKey(), request.getBusinessKey(), variables);
        } else {
            instance = processInstanceService.startProcess(request.getProcessKey(), variables);
        }

        Map<String, Object> response = new HashMap<>();
        response.put("id", instance.getId());
        response.put("processDefinitionId", instance.getProcessDefinitionId());
        response.put("processDefinitionKey", instance.getProcessDefinitionKey());
        response.put("businessKey", instance.getBusinessKey());
        response.put("tenantId", instance.getTenantId());

        return Result.success(response);
    }

    @GetMapping
    public Result<PageResponse<Map<String, Object>>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        Page<ProcessInstance> result = processInstanceService.listProcessInstances(PageRequest.of(page, size));

        PageResponse<Map<String, Object>> response = new PageResponse<>(
                result.getContent().stream().map(this::toMap).toList(),
                result.getNumber(),
                result.getSize(),
                result.getTotalElements()
        );

        return Result.success(response);
    }

    @GetMapping("/{id}")
    public Result<Map<String, Object>> get(@PathVariable String id) {
        return processInstanceService.getProcessInstance(id)
                .map(instance -> Result.success(toMap(instance)))
                .orElse(Result.error(404, "Process instance not found"));
    }

    @PostMapping("/{id}/suspend")
    public Result<Void> suspend(@PathVariable String id) {
        processInstanceService.suspendProcessInstance(id);
        return Result.success(null);
    }

    @PostMapping("/{id}/resume")
    public Result<Void> resume(@PathVariable String id) {
        processInstanceService.resumeProcessInstance(id);
        return Result.success(null);
    }

    @PostMapping("/{id}/terminate")
    public Result<Void> terminate(@PathVariable String id, @RequestParam(required = false) String reason) {
        processInstanceService.terminateProcessInstance(id, reason != null ? reason : "User terminated");
        return Result.success(null);
    }

    private Map<String, Object> toMap(ProcessInstance instance) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", instance.getId());
        map.put("processDefinitionId", instance.getProcessDefinitionId());
        map.put("processDefinitionKey", instance.getProcessDefinitionKey());
        map.put("processDefinitionName", instance.getProcessDefinitionName());
        map.put("businessKey", instance.getBusinessKey());
        map.put("tenantId", instance.getTenantId());
        map.put("suspended", instance.isSuspended());
        map.put("ended", instance.isEnded());
        return map;
    }
}