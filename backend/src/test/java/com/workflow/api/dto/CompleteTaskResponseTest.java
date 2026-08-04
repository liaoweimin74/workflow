package com.workflow.api.dto;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * CompleteTaskResponse DTO 测试。
 *
 * <p>验证：complete 返回值包含下一个任务、流程结束标志、流程实例 ID。
 */
class CompleteTaskResponseTest {

    @Test
    void builder_setsAllFields() {
        CompleteTaskResponse response = CompleteTaskResponse.builder()
                .processInstanceId("pi-001")
                .processFinished(false)
                .nextTaskId("task-002")
                .nextTaskName("经理审批")
                .nextTaskAssignee("bob")
                .nextTaskDefinitionKey("managerApproval")
                .build();

        assertThat(response.getProcessInstanceId()).isEqualTo("pi-001");
        assertThat(response.isProcessFinished()).isFalse();
        assertThat(response.getNextTaskId()).isEqualTo("task-002");
        assertThat(response.getNextTaskName()).isEqualTo("经理审批");
        assertThat(response.getNextTaskAssignee()).isEqualTo("bob");
        assertThat(response.getNextTaskDefinitionKey()).isEqualTo("managerApproval");
    }

    @Test
    void builder_processFinished_noNextTask() {
        CompleteTaskResponse response = CompleteTaskResponse.builder()
                .processInstanceId("pi-001")
                .processFinished(true)
                .nextTaskId(null)
                .nextTaskName(null)
                .nextTaskAssignee(null)
                .nextTaskDefinitionKey(null)
                .build();

        assertThat(response.isProcessFinished()).isTrue();
        assertThat(response.getNextTaskId()).isNull();
        assertThat(response.getNextTaskName()).isNull();
    }

    @Test
    void noArgConstructor_andSetters_work() {
        CompleteTaskResponse response = new CompleteTaskResponse();
        response.setProcessInstanceId("pi-002");
        response.setProcessFinished(true);
        response.setNextTaskId(null);

        assertThat(response.getProcessInstanceId()).isEqualTo("pi-002");
        assertThat(response.isProcessFinished()).isTrue();
    }
}
