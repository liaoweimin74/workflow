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
    private final com.workflow.engine.logicflow.service.LogicFlowApprovalTrigger logicFlowApprovalTrigger;

    public TaskController(WorkflowTaskService taskService, RejectService rejectService,
                          TransferService transferService, AddSignService addSignService,
                          ForwardSignService forwardSignService,
                          ProcessInstanceService processInstanceService,
                          TaskService flowableTaskService,
                          com.workflow.engine.logicflow.service.LogicFlowApprovalTrigger logicFlowApprovalTrigger) {
        this.taskService = taskService;
        this.rejectService = rejectService;
        this.transferService = transferService;
        this.addSignService = addSignService;
        this.forwardSignService = forwardSignService;
        this.processInstanceService = processInstanceService;
        this.flowableTaskService = flowableTaskService;
        this.logicFlowApprovalTrigger = logicFlowApprovalTrigger;
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
        // 手写签名 dataURL（signature.required 节点必填校验在门禁内；V41 随 approve 意见落库）
        String signature = request != null ? request.getSignature() : null;
        return R.ok(taskService.completeTaskWithResponse(id, variables, userId, comment, signature));
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

        // Task 61/65 拒绝门禁：allowRefuse/allowReject 权限 + 办理节点无拒绝语义 + 意见必填
        taskService.validateRefuseGate(id, reason);

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

        // 拒绝终止后触发逻辑编排（AFTER_TASK_REJECT；失败语义由绑定 executionMode 决定）
        logicFlowApprovalTrigger.onTaskRefused(processInstanceId, id, userId, reason);
        return R.ok();
    }

    /**
     * 审批召回（Task 69，对齐 NodeJS POST /api/v1/tasks/:taskId/approve-recall）：
     * 审批人撤回自己已办理的审批，流程回到该节点重新处理。
     *
     * <p>门禁在服务层（approveRecall 开关/已办/本人/下节点未审批/非发起节点/非会签）。
     * ⚠️ 失败统一 HTTP 200 + body code 400（对齐 NodeJS 控制器的 try/catch 宽松形态）。
     */
    @PostMapping("/{taskId}/approve-recall")
    public R<Void> approveRecall(@PathVariable String taskId) {
        String userId = getCurrentUserId();
        try {
            taskService.recallApproval(taskId, userId);
        } catch (Exception e) {
            return R.fail(400, e.getMessage());
        }
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
