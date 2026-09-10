package com.workflow.api.controller;

import com.workflow.api.dto.*;
import com.workflow.common.domain.R;
import com.workflow.engine.process.ProcessInstanceService;
import com.workflow.engine.task.AddSignService;
import com.workflow.engine.task.ForwardSignService;
import com.workflow.engine.task.RejectService;
import com.workflow.engine.task.TransferService;
import com.workflow.engine.task.WorkflowTaskService;
import com.workflow.framework.security.domain.LoginUser;
import org.flowable.engine.TaskService;
import org.flowable.task.api.Task;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
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
    private final ProcessInstanceService processInstanceService;
    private final TaskService flowableTaskService;

    public TaskController(WorkflowTaskService taskService, RejectService rejectService,
                          TransferService transferService, AddSignService addSignService,
                          ForwardSignService forwardSignService,
                          ProcessInstanceService processInstanceService,
                          TaskService flowableTaskService) {
        this.taskService = taskService;
        this.rejectService = rejectService;
        this.transferService = transferService;
        this.addSignService = addSignService;
        this.forwardSignService = forwardSignService;
        this.processInstanceService = processInstanceService;
        this.flowableTaskService = flowableTaskService;
    }

    @GetMapping
    public R<PageResponse<TaskTodoVO>> listTodo(
            @RequestParam String assignee,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String processName,
            @RequestParam(required = false) String initiator,
            @RequestParam(required = false) String createTimeStart,
            @RequestParam(required = false) String createTimeEnd) {

        TaskTodoFilter filter = new TaskTodoFilter(processName, initiator, createTimeStart, createTimeEnd);
        int normalizedPage = Math.max(page, 1);
        Page<TaskTodoVO> result = taskService.listTodoTasksVO(assignee, PageRequest.of(normalizedPage - 1, size), filter);

        PageResponse<TaskTodoVO> response = new PageResponse<>(
                result.getContent(),
                result.getNumber() + 1,
                result.getSize(),
                result.getTotalElements()
        );

        return R.ok(response);
    }

    @GetMapping("/historic")
    public R<PageResponse<TaskDoneVO>> listHistoric(
            @RequestParam String userId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String processName,
            @RequestParam(required = false) String initiator,
            @RequestParam(required = false) String endTimeStart,
            @RequestParam(required = false) String endTimeEnd,
            @RequestParam(required = false) String approveResult) {

        TaskDoneFilter filter = new TaskDoneFilter(processName, initiator, endTimeStart, endTimeEnd, approveResult);
        int normalizedPage = Math.max(page, 1);
        Page<TaskDoneVO> result = taskService.listHistoricTasksVO(userId, PageRequest.of(normalizedPage - 1, size), filter);

        PageResponse<TaskDoneVO> response = new PageResponse<>(
                result.getContent(),
                result.getNumber() + 1,
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
        // 从 SecurityContext 获取操作人（不依赖前端传 userId）
        String userId = getCurrentUserId();
        String comment = request != null ? request.getComment() : null;
        return R.ok(taskService.completeTaskWithResponse(id, variables, userId, comment));
    }

    @PostMapping("/{id}/reject")
    public R<Void> reject(@PathVariable String id, @RequestBody(required = false) RejectRequest request) {
        String userId = getCurrentUserId();
        String reason = request != null ? request.getReason() : null;
        rejectService.reject(id, userId, reason);
        return R.ok();
    }

    /**
     * 拒绝：不同意并终止整个流程。
     * 与驳回不同：驳回将任务退回给发起人重新填写，拒绝直接终止流程。
     */
    @PostMapping("/{id}/refuse")
    public R<Void> refuse(@PathVariable String id, @RequestBody(required = false) RejectRequest request) {
        // 从 SecurityContext 获取操作人
        String userId = getCurrentUserId();
        String reason = request != null ? request.getReason() : null;

        // 查 task 获取 processInstanceId
        Task task = flowableTaskService.createTaskQuery().taskId(id).singleResult();
        if (task == null) {
            throw new IllegalStateException("Task not found: " + id);
        }
        String processInstanceId = task.getProcessInstanceId();

        // 写入审批意见（action=refuse）
        taskService.saveTaskComment(id, processInstanceId, userId, "refuse", reason);

        // 终止流程
        processInstanceService.terminateProcessInstance(processInstanceId,
                reason != null ? reason : "审批拒绝，流程终止");
        return R.ok();
    }

    @PostMapping("/{id}/transfer")
    public R<Void> transfer(@PathVariable String id, @RequestBody(required = false) TransferRequest request) {
        String fromUser = resolveCurrentUserId(request != null ? request.getFromUser() : null);
        String toUser = request != null ? request.getToUser() : null;
        String reason = request != null ? request.getReason() : null;
        transferService.transfer(id, fromUser, toUser, reason);
        return R.ok();
    }

    @PostMapping("/{id}/delegate")
    public R<Void> delegate(@PathVariable String id, @RequestBody DelegateRequest request) {
        String fromUser = resolveCurrentUserId(request.getFromUser());
        taskService.delegateTaskWithComment(id, request.getDelegateTo(), fromUser, request.getComment());
        return R.ok();
    }

    @PostMapping("/{id}/add-sign")
    public R<Void> addSign(@PathVariable String id, @RequestBody AddSignRequest request) {
        String userId = resolveCurrentUserId(request.getUserId());
        addSignService.addSign(id, request.getUsers(), userId, request.getComment());
        return R.ok();
    }

    @PostMapping("/{id}/forward-sign")
    public R<Void> forwardSign(@PathVariable String id, @RequestBody ForwardSignRequest request) {
        String userId = resolveCurrentUserId(request.getUserId());
        forwardSignService.forwardSign(id, request.getToUser(), userId, request.getComment());
        return R.ok();
    }

    /**
     * 解析当前操作人 ID：优先请求体传入，否则从 SecurityContext 获取。
     */
    private String resolveCurrentUserId(String requestUserId) {
        if (requestUserId != null && !requestUserId.isBlank()) {
            return requestUserId;
        }
        return getCurrentUserId();
    }

    /**
     * 从 SecurityContext 获取当前登录用户 ID。
     */
    private String getCurrentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof LoginUser loginUser) {
            return String.valueOf(loginUser.getUserId());
        }
        return null;
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
