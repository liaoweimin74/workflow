package com.workflow.api.controller;

import com.workflow.api.dto.*;
import com.workflow.common.domain.R;
import com.workflow.engine.form.FormDataService;
import com.workflow.engine.process.ProcessInstanceService;
import com.workflow.engine.runtime.ProcessHighlightService;
import com.workflow.framework.security.domain.LoginUser;
import org.flowable.engine.runtime.ProcessInstance;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/process-instances")
public class ProcessInstanceController {

    private final ProcessInstanceService processInstanceService;
    private final ProcessHighlightService highlightService;
    private final FormDataService formDataService;
    private final ObjectMapper objectMapper;

    public ProcessInstanceController(ProcessInstanceService processInstanceService,
                                     ProcessHighlightService highlightService,
                                     FormDataService formDataService,
                                     ObjectMapper objectMapper) {
        this.processInstanceService = processInstanceService;
        this.highlightService = highlightService;
        this.formDataService = formDataService;
        this.objectMapper = objectMapper;
    }

    @PostMapping
    public R<Map<String, Object>> start(@RequestBody StartProcessRequest request) {
        Map<String, Object> variables = request.getVariables() != null ? request.getVariables() : new HashMap<>();

        // 注入发起人变量：从 SecurityContext 提取当前用户 ID
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof LoginUser loginUser) {
            variables.put("initiator", String.valueOf(loginUser.getUserId()));
        }

        ProcessInstance instance;
        if (request.getBusinessKey() != null) {
            instance = processInstanceService.startProcess(request.getProcessKey(), request.getBusinessKey(), variables);
        } else {
            instance = processInstanceService.startProcess(request.getProcessKey(), variables);
        }

        // 保存表单数据到 form_data 表，供任务处理页面加载
        if (request.getFormDefId() != null && !request.getFormDefId().isEmpty()) {
            try {
                String dataJson = objectMapper.writeValueAsString(variables);
                formDataService.save(request.getFormDefId(), instance.getId(), null, dataJson);
            } catch (Exception e) {
                // 表单数据保存失败不影响流程启动
            }
        }

        Map<String, Object> response = new HashMap<>();
        response.put("id", instance.getId());
        response.put("processDefinitionId", instance.getProcessDefinitionId());
        response.put("processDefinitionKey", instance.getProcessDefinitionKey());
        response.put("businessKey", instance.getBusinessKey());
        response.put("tenantId", instance.getTenantId());

        return R.ok(response);
    }

    @GetMapping
    public R<PageResponse<Map<String, Object>>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String initiator,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String processName) {

        Page<ProcessInstance> result = processInstanceService.listProcessInstances(
                PageRequest.of(page, size), initiator, status, processName);

        PageResponse<Map<String, Object>> response = new PageResponse<>(
                result.getContent().stream().map(this::toMap).toList(),
                result.getNumber(),
                result.getSize(),
                result.getTotalElements()
        );

        return R.ok(response);
    }

    @GetMapping("/{id}")
    public R<Map<String, Object>> get(@PathVariable String id) {
        return processInstanceService.getProcessInstance(id)
                .map(instance -> R.ok(toMap(instance)))
                .orElse(R.fail(404, "Process instance not found"));
    }

    @PostMapping("/{id}/suspend")
    public R<Void> suspend(@PathVariable String id) {
        processInstanceService.suspendProcessInstance(id);
        return R.ok();
    }

    @PostMapping("/{id}/resume")
    public R<Void> resume(@PathVariable String id) {
        processInstanceService.resumeProcessInstance(id);
        return R.ok();
    }

    @PostMapping("/{id}/terminate")
    public R<Void> terminate(@PathVariable String id, @RequestParam(required = false) String reason) {
        processInstanceService.terminateProcessInstance(id, reason != null ? reason : "User terminated");
        return R.ok();
    }

    @GetMapping("/{id}/highlight")
    public R<Map<String, Object>> highlight(@PathVariable String id) {
        return R.ok(highlightService.getHighlight(id));
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

        // 当前节点名称
        map.put("currentNode", instance.getName());

        // 状态：suspended → "suspended", ended → "completed", 否则 "running"
        String status;
        if (instance.isSuspended()) {
            status = "suspended";
        } else if (instance.isEnded()) {
            status = "completed";
        } else {
            status = "running";
        }
        map.put("status", status);

        return map;
    }
}