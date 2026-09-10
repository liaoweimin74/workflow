package com.workflow.api.controller;

import com.workflow.common.domain.R;
import com.workflow.engine.task.TaskRemindService;
import com.workflow.framework.security.domain.LoginUser;
import org.flowable.engine.TaskService;
import org.flowable.task.api.Task;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 任务催办 Controller。
 *
 * <p>提供催办端点，允许发起人对当前待办审批人发起催办。
 * 支持按 taskId 催办，也支持按 processInstanceId 催办（自动找到当前活跃任务）。
 */
@RestController
@RequestMapping("/api/v1/tasks")
public class TaskRemindController {

    private final TaskRemindService taskRemindService;
    private final TaskService taskService;

    public TaskRemindController(TaskRemindService taskRemindService, TaskService taskService) {
        this.taskRemindService = taskRemindService;
        this.taskService = taskService;
    }

    /**
     * 对指定任务发起催办。催办发起人从 SecurityContext 自动获取。
     *
     * @param taskId 任务 ID
     * @return 操作结果
     */
    @PostMapping("/{taskId}/remind")
    public R<Void> remind(@PathVariable String taskId) {
        String from = getRemindFrom();
        taskRemindService.remind(taskId, from);
        return R.ok();
    }

    /**
     * 对指定流程实例的当前活跃任务发起催办。
     * 自动查找该流程实例下所有活跃的 userTask，逐个催办。
     *
     * @param processInstanceId 流程实例 ID
     * @return 操作结果
     */
    @PostMapping("/by-instance/{processInstanceId}/remind")
    public R<Void> remindByInstance(@PathVariable String processInstanceId) {
        String from = getRemindFrom();

        List<Task> tasks = taskService.createTaskQuery()
                .processInstanceId(processInstanceId)
                .active()
                .list();

        if (tasks.isEmpty()) {
            return R.fail(404, "当前没有待办任务，无需催办");
        }

        int reminded = 0;
        for (Task task : tasks) {
            try {
                taskRemindService.remind(task.getId(), from);
                reminded++;
            } catch (IllegalStateException e) {
                // 跳过频率限制或无 assignee 的任务
            }
        }
        if (reminded == 0) {
            return R.fail(429, "催办失败：24小时内已催办过或无有效办理人");
        }
        return R.ok();
    }

    private String getRemindFrom() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof LoginUser loginUser) {
            return String.valueOf(loginUser.getUserId());
        }
        return null;
    }
}
