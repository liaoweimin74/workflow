package com.workflow.notification.model;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class MessageTemplateTest {

    @Test
    void template_creation_with_all_fields() {
        MessageTemplate template = new MessageTemplate();
        template.setTenantId("default");
        template.setTemplateCode("TASK_CREATED");
        template.setName("任务创建通知");
        template.setTitle("新任务：${taskName}");
        template.setContent("您有一个新任务：${taskName}，请尽快处理。");
        template.setChannel(ChannelType.SMS);
        template.setPriority(MessagePriority.NORMAL);
        template.setCategory(MessageCategory.WORKFLOW);
        template.setIsSystem(false);
        template.setCreatedAt(LocalDateTime.now());

        assertThat(template.getTenantId()).isEqualTo("default");
        assertThat(template.getTemplateCode()).isEqualTo("TASK_CREATED");
        assertThat(template.getName()).isEqualTo("任务创建通知");
        assertThat(template.getChannel()).isEqualTo(ChannelType.SMS);
    }
}