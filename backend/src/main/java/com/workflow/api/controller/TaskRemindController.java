package com.workflow.api.controller;

import com.workflow.common.domain.R;
import com.workflow.engine.task.TaskRemindService;
import org.springframework.web.bind.annotation.*;

/**
 * 任务催办 Controller。
 *
 * <p>提供 POST /api/v1/tasks/{taskId}/remind 端点，
 * 允许发起人对当前待办审批人发起催办。
 */
@RestController
@RequestMapping("/api/v1/tasks")
public class TaskRemindController {

    private final TaskRemindService taskRemindService;

    public TaskRemindController(TaskRemindService taskRemindService) {
        this.taskRemindService = taskRemindService;
    }

    /**
     * 对指定任务发起催办。
     *
     * @param taskId 任务 ID
     * @param from   催办发起人（查询参数，后续可从 SecurityContext 获取）
     * @return 操作结果
     */
    @PostMapping("/{taskId}/remind")
    public R<Void> remind(@PathVariable String taskId,
                          @RequestParam(required = false) String from) {
        taskRemindService.remind(taskId, from);
        return R.ok();
    }
}
