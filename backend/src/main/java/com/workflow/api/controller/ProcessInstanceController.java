package com.workflow.api.controller;

import com.workflow.api.dto.*;
import com.workflow.common.domain.R;
import com.workflow.engine.form.FormDataService;
import com.workflow.engine.form.mapping.VariableMappingWriter;
import com.workflow.engine.process.ProcessInstanceService;
import com.workflow.engine.runtime.ProcessHighlightService;
import com.workflow.engine.runtime.ProcessTaskPredictionService;
import com.workflow.framework.security.domain.LoginUser;
import org.flowable.engine.TaskService;
import org.flowable.engine.history.HistoricProcessInstance;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.task.api.Task;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.time.ZoneId;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/v1/process-instances")
public class ProcessInstanceController {

    private static final Logger log = LoggerFactory.getLogger(ProcessInstanceController.class);

    private final ProcessInstanceService processInstanceService;
    private final ProcessHighlightService highlightService;
    private final ProcessTaskPredictionService predictionService;
    private final FormDataService formDataService;
    private final VariableMappingWriter variableMappingWriter;
    private final TaskService taskService;
    private final ObjectMapper objectMapper;

    public ProcessInstanceController(ProcessInstanceService processInstanceService,
                                     ProcessHighlightService highlightService,
                                     ProcessTaskPredictionService predictionService,
                                     FormDataService formDataService,
                                     VariableMappingWriter variableMappingWriter,
                                     TaskService taskService,
                                     ObjectMapper objectMapper) {
        this.processInstanceService = processInstanceService;
        this.highlightService = highlightService;
        this.predictionService = predictionService;
        this.formDataService = formDataService;
        this.variableMappingWriter = variableMappingWriter;
        this.taskService = taskService;
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

        // 流程变量映射写入（form:* 源需在表单数据保存之后读取）
        try {
            variableMappingWriter.write(instance.getProcessDefinitionId(), instance.getId());
        } catch (Exception e) {
            log.warn("Failed to write variable mappings for instance [{}]: {}", instance.getId(), e.getMessage());
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
        // 优先查 runtime 表；已结束实例不在 runtime 表，回退查历史表（ACT_HI_PROCINST）
        Optional<Map<String, Object>> data = processInstanceService.getProcessInstance(id)
                .map(this::toMap)
                .or(() -> processInstanceService.getHistoricProcessInstance(id).map(this::toHistoricMap));
        return data.map(R::ok).orElse(R.fail(404, "Process instance not found"));
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

    /**
     * 获取流程实例的执行预测列表（已执行 + 活跃 + 预测节点）。
     */
    @GetMapping("/{id}/prediction")
    public R<List<ExecutionNodeVO>> prediction(@PathVariable String id) {
        return R.ok(predictionService.getPrediction(id));
    }

    /**
     * 历史流程实例列表（查 act_hi_procinst），用于"我发起的"。
     * 包含已结束的实例，比 runtime 列表更完整。
     */
    @GetMapping("/history")
    public R<PageResponse<Map<String, Object>>> listHistory(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String initiator,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String processName) {

        Page<HistoricProcessInstance> result = processInstanceService.listHistoricProcessInstances(
                PageRequest.of(page, size), initiator, status, processName);

        PageResponse<Map<String, Object>> response = new PageResponse<>(
                result.getContent().stream().map(this::toHistoricMap).toList(),
                result.getNumber(),
                result.getSize(),
                result.getTotalElements()
        );

        return R.ok(response);
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

        // 标题
        map.put("name", instance.getName());

        // 发起时间
        Date startTime = instance.getStartTime();
        map.put("startTime", startTime != null
                ? startTime.toInstant().atZone(ZoneId.systemDefault()).toLocalDateTime().toString()
                : null);

        // 当前节点名称（运行时实例才有，已结束的为空）
        String currentNode = null;
        if (!instance.isEnded()) {
            currentNode = instance.getActivityId();
        }
        map.put("currentNode", currentNode);

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

    private Map<String, Object> toHistoricMap(HistoricProcessInstance instance) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", instance.getId());
        map.put("processDefinitionId", instance.getProcessDefinitionId());
        map.put("processDefinitionKey", instance.getProcessDefinitionKey());
        map.put("processDefinitionName", instance.getProcessDefinitionName());
        map.put("businessKey", instance.getBusinessKey());
        map.put("tenantId", instance.getTenantId());
        map.put("suspended", false);
        map.put("ended", instance.getEndTime() != null);

        // 标题
        map.put("name", instance.getName());

        // 发起时间
        Date startTime = instance.getStartTime();
        map.put("startTime", startTime != null
                ? startTime.toInstant().atZone(ZoneId.systemDefault()).toLocalDateTime().toString()
                : null);

        // 当前节点：运行中的实例查当前活跃任务名（可能多个，用逗号连接）
        String currentNode = null;
        if (instance.getEndTime() == null) {
            List<Task> activeTasks = taskService.createTaskQuery()
                    .processInstanceId(instance.getId())
                    .active()
                    .list();
            if (!activeTasks.isEmpty()) {
                currentNode = activeTasks.stream()
                        .map(Task::getName)
                        .filter(n -> n != null && !n.isBlank())
                        .distinct()
                        .collect(java.util.stream.Collectors.joining("、"));
            }
        }
        map.put("currentNode", currentNode);

        // 状态：endTime != null → "completed", 否则 "running"
        map.put("status", instance.getEndTime() != null ? "completed" : "running");

        return map;
    }
}