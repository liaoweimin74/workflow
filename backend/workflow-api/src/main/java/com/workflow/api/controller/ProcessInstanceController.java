package com.workflow.api.controller;

import com.workflow.api.dto.*;
import com.workflow.core.engine.ProcessInstanceService;
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
    public Result<ProcessInstanceResponse> start(@RequestBody StartProcessRequest request) {
        Map<String, Object> variables = request.getVariables() != null ? request.getVariables() : new HashMap<>();

        ProcessInstance instance;
        if (request.getBusinessKey() != null) {
            instance = processInstanceService.startProcess(request.getProcessKey(), request.getBusinessKey(), variables);
        } else {
            instance = processInstanceService.startProcess(request.getProcessKey(), variables);
        }

        ProcessInstanceResponse response = toResponse(instance);
        return Result.success(response);
    }

    @GetMapping
    public Result<PageResponse<ProcessInstanceResponse>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        Page<ProcessInstance> result = processInstanceService.listProcessInstances(PageRequest.of(page, size));

        PageResponse<ProcessInstanceResponse> response = new PageResponse<>(
                result.getContent().stream().map(this::toResponse).toList(),
                result.getNumber(),
                result.getSize(),
                result.getTotalElements()
        );

        return Result.success(response);
    }

    @GetMapping("/{id}")
    public Result<ProcessInstanceResponse> get(@PathVariable String id) {
        return processInstanceService.getProcessInstance(id)
                .map(instance -> Result.success(toResponse(instance)))
                .orElse(Result.error("Process instance not found"));
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

    private ProcessInstanceResponse toResponse(ProcessInstance instance) {
        ProcessInstanceResponse response = new ProcessInstanceResponse();
        response.setId(instance.getId());
        response.setProcessDefinitionId(instance.getProcessDefinitionId());
        response.setProcessDefinitionKey(instance.getProcessDefinitionKey());
        response.setProcessDefinitionName(instance.getProcessDefinitionName());
        response.setBusinessKey(instance.getBusinessKey());
        response.setTenantId(instance.getTenantId());
        response.setSuspended(instance.isSuspended());
        response.setEnded(instance.isEnded());
        return response;
    }
}