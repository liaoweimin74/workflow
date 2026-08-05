package com.workflow.api.controller;

import com.workflow.api.dto.*;
import com.workflow.common.domain.R;
import com.workflow.engine.task.AddSignService;
import com.workflow.engine.task.ForwardSignService;
import com.workflow.engine.task.RejectService;
import com.workflow.engine.task.TransferService;
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
    private final RejectService rejectService;
    private final TransferService transferService;
    private final AddSignService addSignService;
    private final ForwardSignService forwardSignService;

    public TaskController(WorkflowTaskService taskService, RejectService rejectService,
                          TransferService transferService, AddSignService addSignService,
                          ForwardSignService forwardSignService) {
        this.taskService = taskService;
        this.rejectService = rejectService;
        this.transferService = transferService;
        this.addSignService = addSignService;
        this.forwardSignService = forwardSignService;
    }

    @GetMapping
    public R<PageResponse<TaskTodoVO>> listTodo(
            @RequestParam String assignee,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String processName,
            @RequestParam(required = false) String initiator,
            @RequestParam(required = false) String createTimeStart,
            @RequestParam(required = false) String createTimeEnd) {

        TaskTodoFilter filter = new TaskTodoFilter(processName, initiator, createTimeStart, createTimeEnd);
        Page<TaskTodoVO> result = taskService.listTodoTasksVO(assignee, PageRequest.of(page, size), filter);

        PageResponse<TaskTodoVO> response = new PageResponse<>(
                result.getContent(),
                result.getNumber(),
                result.getSize(),
                result.getTotalElements()
        );

        return R.ok(response);
    }

    @GetMapping("/historic")
    public R<PageResponse<TaskDoneVO>> listHistoric(
            @RequestParam String userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String processName,
            @RequestParam(required = false) String initiator,
            @RequestParam(required = false) String endTimeStart,
            @RequestParam(required = false) String endTimeEnd,
            @RequestParam(required = false) String approveResult) {

        TaskDoneFilter filter = new TaskDoneFilter(processName, initiator, endTimeStart, endTimeEnd, approveResult);
        Page<TaskDoneVO> result = taskService.listHistoricTasksVO(userId, PageRequest.of(page, size), filter);

        PageResponse<TaskDoneVO> response = new PageResponse<>(
                result.getContent(),
                result.getNumber(),
                result.getSize(),
                result.getTotalElements()
        );

        return R.ok(response);
    }

    @GetMapping("/{id}")
    public R<TaskDetailVO> get(@PathVariable String id) {
        return taskService.getTaskDetail(id)
                .map(R::ok)
                .orElse(R.fail(404, "Task not found"));
    }

    @PostMapping("/{id}/claim")
    public R<Void> claim(@PathVariable String id, @RequestParam String userId) {
        taskService.claimTask(id, userId);
        return R.ok();
    }

    @PostMapping("/{id}/complete")
    public R<CompleteTaskResponse> complete(@PathVariable String id, @RequestBody(required = false) CompleteTaskRequest request) {
        Map<String, Object> variables = request != null && request.getVariables() != null
                ? request.getVariables()
                : new HashMap<>();
        return R.ok(taskService.completeTaskWithResponse(id, variables));
    }

    @PostMapping("/{id}/reject")
    public R<Void> reject(@PathVariable String id, @RequestBody(required = false) RejectRequest request) {
        String userId = request != null ? request.getUserId() : null;
        String reason = request != null ? request.getReason() : null;
        rejectService.reject(id, userId, reason);
        return R.ok();
    }

    @PostMapping("/{id}/transfer")
    public R<Void> transfer(@PathVariable String id, @RequestBody(required = false) TransferRequest request) {
        String fromUser = request != null ? request.getFromUser() : null;
        String toUser = request != null ? request.getToUser() : null;
        String reason = request != null ? request.getReason() : null;
        transferService.transfer(id, fromUser, toUser, reason);
        return R.ok();
    }

    @PostMapping("/{id}/delegate")
    public R<Void> delegate(@PathVariable String id, @RequestBody DelegateRequest request) {
        taskService.delegateTask(id, request.getDelegateTo());
        return R.ok();
    }

    @PostMapping("/{id}/add-sign")
    public R<Void> addSign(@PathVariable String id, @RequestBody AddSignRequest request) {
        addSignService.addSign(id, request.getUsers());
        return R.ok();
    }

    @PostMapping("/{id}/forward-sign")
    public R<Void> forwardSign(@PathVariable String id, @RequestBody ForwardSignRequest request) {
        forwardSignService.forwardSign(id, request.getToUser());
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