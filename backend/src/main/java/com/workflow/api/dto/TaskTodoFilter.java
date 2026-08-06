package com.workflow.api.dto;

/**
 * 待办任务查询过滤参数。
 */
public record TaskTodoFilter(
        String processName,
        String initiator,
        String createTimeStart,
        String createTimeEnd) {

    public static TaskTodoFilter empty() {
        return new TaskTodoFilter(null, null, null, null);
    }
}
