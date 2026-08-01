package com.workflow.api.controller;

import com.workflow.api.dto.*;
import com.workflow.common.domain.R;
import com.workflow.engine.task.WorkflowTaskService;
import org.flowable.task.api.Task;
import org.flowable.task.api.history.HistoricTaskInstance;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/tasks")
public class TaskController {

    private final WorkflowTaskService taskService;

    public TaskController(WorkflowTaskService taskService) {
        this.taskService = taskService;
    }

    @GetMapping
    public R<PageResponse<Map<String, Object>>> listTodo(
            @RequestParam String assignee,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        Page<Task> result = taskService.listTodoTasks(assignee, PageRequest.of(page, size));

        PageResponse<Map<String, Object>> response = new PageResponse<>(
                result.getContent().stream().map(this::toMap).toList(),
                result.getNumber(),
                result.getSize(),
                result.getTotalElements()
        );

        return R.ok(response);
    }

    @GetMapping("/historic")
    public R<PageResponse<Map<String, Object>>> listHistoric(
            @RequestParam String userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        Page<HistoricTaskInstance> result = taskService.listHistoricTasks(userId, PageRequest.of(page, size));

        PageResponse<Map<String, Object>> response = new PageResponse<>(
                result.getContent().stream().map(this::toHistoricMap).toList(),
                result.getNumber(),
                result.getSize(),
                result.getTotalElements()
        );

        return R.ok(response);
    }

    @GetMapping("/{id}")
    public R<Map<String, Object>> get(@PathVariable String id) {
        return taskService.getTask(id)
                .map(task -> R.ok(toMap(task)))
                .orElse(R.fail(404, "Task not found"));
    }

    @PostMapping("/{id}/claim")
    public R<Void> claim(@PathVariable String id, @RequestParam String userId) {
        taskService.claimTask(id, userId);
        return R.ok();
    }

    @PostMapping("/{id}/complete")
    public R<Void> complete(@PathVariable String id, @RequestBody(required = false) CompleteTaskRequest request) {
        Map<String, Object> variables = request != null && request.getVariables() != null
                ? request.getVariables()
                : new HashMap<>();
        taskService.completeTask(id, variables);
        return R.ok();
    }

    private Map<String, Object> toMap(Task task) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", task.getId());
        map.put("name", task.getName());
        map.put("description", task.getDescription());
        map.put("assignee", task.getAssignee());
        map.put("processInstanceId", task.getProcessInstanceId());
        map.put("processDefinitionId", task.getProcessDefinitionId());
        map.put("tenantId", task.getTenantId());
        if (task.getCreateTime() != null) {
            map.put("createTime", DateTimeFormatter.ISO_LOCAL_DATE_TIME.format(
                    task.getCreateTime().toInstant().atZone(ZoneId.systemDefault()).toLocalDateTime()
            ));
        }
        return map;
    }

    private Map<String, Object> toHistoricMap(HistoricTaskInstance task) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", task.getId());
        map.put("name", task.getName());
        map.put("description", task.getDescription());
        map.put("assignee", task.getAssignee());
        map.put("processInstanceId", task.getProcessInstanceId());
        map.put("processDefinitionId", task.getProcessDefinitionId());
        map.put("tenantId", task.getTenantId());
        if (task.getStartTime() != null) {
            map.put("createTime", DateTimeFormatter.ISO_LOCAL_DATE_TIME.format(
                    task.getStartTime().toInstant().atZone(ZoneId.systemDefault()).toLocalDateTime()
            ));
        }
        return map;
    }
}