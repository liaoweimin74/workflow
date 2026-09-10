package com.workflow.api.dto;

/**
 * 已办任务查询过滤参数。
 */
public record TaskDoneFilter(
        String processName,
        String initiator,
        String endTimeStart,
        String endTimeEnd,
        String approveResult) {

    public static TaskDoneFilter empty() {
        return new TaskDoneFilter(null, null, null, null, null);
    }
}
