package com.workflow.notification.model;

import com.workflow.notification.model.Message;
import com.workflow.notification.model.MessageCategory;
import com.workflow.notification.model.MessagePriority;
import com.workflow.notification.model.MessageStatus;
import com.workflow.notification.model.MessageType;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class MessageTest {

    @Test
    void message_creation_with_all_fields() {
        Message msg = new Message();
        msg.setTenantId("default");
        msg.setTemplateCode("TASK_CREATED");
        msg.setSenderId(100L);
        msg.setSenderType("SYSTEM");
        msg.setTitle("新任务通知");
        msg.setContent(Map.of("taskName", "审批任务"));
        msg.setPriority(MessagePriority.NORMAL);
        msg.setCategory(MessageCategory.WORKFLOW);
        msg.setMessageType(MessageType.PRIVATE);
        msg.setStatus(MessageStatus.SENT);

        assertThat(msg.getTenantId()).isEqualTo("default");
        assertThat(msg.getTemplateCode()).isEqualTo("TASK_CREATED");
        assertThat(msg.getSenderId()).isEqualTo(100L);
        assertThat(msg.getSenderType()).isEqualTo("SYSTEM");
        assertThat(msg.getTitle()).isEqualTo("新任务通知");
        assertThat(msg.getContent()).containsEntry("taskName", "审批任务");
        assertThat(msg.getPriority()).isEqualTo(MessagePriority.NORMAL);
        assertThat(msg.getCategory()).isEqualTo(MessageCategory.WORKFLOW);
        assertThat(msg.getMessageType()).isEqualTo(MessageType.PRIVATE);
        assertThat(msg.getStatus()).isEqualTo(MessageStatus.SENT);
    }

    @Test
    void message_pre_persist_sets_created_at() {
        Message msg = new Message();
        msg.setTenantId("default");
        msg.setTemplateCode("TEST");

        // 手动触发 prePersist
        msg.onCreate();

        assertThat(msg.getCreatedAt()).isNotNull();
    }
}