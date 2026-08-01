package com.workflow.api.controller;

import com.workflow.api.dto.*;
import com.workflow.core.engine.WorkflowTaskService;
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
    public Result<PageResponse<TaskResponse>> listTodo(
            @RequestParam String assignee,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        Page<Task> result = taskService.listTodoTasks(assignee, PageRequest.of(page, size));

        PageResponse<TaskResponse> response = new PageResponse<>(
                result.getContent().stream().map(this::toResponse).toList(),
                result.getNumber(),
                result.getSize(),
                result.getTotalElements()
        );

        return Result.success(response);
    }

    @GetMapping("/historic")
    public Result<PageResponse<TaskResponse>> listHistoric(
            @RequestParam String userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        Page<HistoricTaskInstance> result = taskService.listHistoricTasks(userId, PageRequest.of(page, size));

        PageResponse<TaskResponse> response = new PageResponse<>(
                result.getContent().stream().map(this::toHistoricResponse).toList(),
                result.getNumber(),
                result.getSize(),
                result.getTotalElements()
        );

        return Result.success(response);
    }

    @GetMapping("/{id}")
    public Result<TaskResponse> get(@PathVariable String id) {
        return taskService.getTask(id)
                .map(task -> Result.success(toResponse(task)))
                .orElse(Result.error("Task not found"));
    }

    @PostMapping("/{id}/claim")
    public Result<Void> claim(@PathVariable String id, @RequestParam String userId) {
        taskService.claimTask(id, userId);
        return Result.success(null);
    }

    @PostMapping("/{id}/complete")
    public Result<Void> complete(@PathVariable String id, @RequestBody(required = false) CompleteTaskRequest request) {
        Map<String, Object> variables = request != null && request.getVariables() != null 
                ? request.getVariables() 
                : new HashMap<>();
        taskService.completeTask(id, variables);
        return Result.success(null);
    }

    private TaskResponse toResponse(Task task) {
        TaskResponse response = new TaskResponse();
        response.setId(task.getId());
        response.setName(task.getName());
        response.setDescription(task.getDescription());
        response.setAssignee(task.getAssignee());
        response.setProcessInstanceId(task.getProcessInstanceId());
        response.setProcessDefinitionId(task.getProcessDefinitionId());
        response.setTenantId(task.getTenantId());
        if (task.getCreateTime() != null) {
            response.setCreateTime(DateTimeFormatter.ISO_LOCAL_DATE_TIME.format(
                    task.getCreateTime().toInstant().atZone(ZoneId.systemDefault()).toLocalDateTime()
            ));
        }
        return response;
    }

    private TaskResponse toHistoricResponse(HistoricTaskInstance task) {
        TaskResponse response = new TaskResponse();
        response.setId(task.getId());
        response.setName(task.getName());
        response.setDescription(task.getDescription());
        response.setAssignee(task.getAssignee());
        response.setProcessInstanceId(task.getProcessInstanceId());
        response.setProcessDefinitionId(task.getProcessDefinitionId());
        response.setTenantId(task.getTenantId());
        if (task.getStartTime() != null) {
            response.setCreateTime(DateTimeFormatter.ISO_LOCAL_DATE_TIME.format(
                    task.getStartTime().toInstant().atZone(ZoneId.systemDefault()).toLocalDateTime()
            ));
        }
        return response;
    }
}