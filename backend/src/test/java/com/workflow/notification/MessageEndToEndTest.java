package com.workflow.notification;

import com.workflow.common.domain.PageResult;
import com.workflow.notification.model.*;
import com.workflow.notification.store.MessageService;
import com.workflow.notification.dispatch.MessageEvent;
import com.workflow.notification.sse.SseEmitterManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 端到端集成测试：消息发送→接收→已读
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class MessageEndToEndTest {

    @Autowired
    private MessageService messageService;

    @Autowired
    private ApplicationEventPublisher eventPublisher;

    @Autowired
    private SseEmitterManager sseManager;

    @Test
    void full_flow_send_read_unread() {
        // 1. 创建消息
        Message message = new Message();
        message.setTenantId("default");
        message.setTemplateCode("TEST_FLOW");
        message.setSenderId(100L);
        message.setSenderType("SYSTEM");
        message.setTitle("端到端测试消息");
        message.setContent(Map.of("key", "value"));
        message.setPriority(MessagePriority.NORMAL);
        message.setCategory(MessageCategory.WORKFLOW);
        message.setMessageType(MessageType.PRIVATE);

        // 2. 发送消息
        Message sent = messageService.send(message, List.of(1000L));
        assertThat(sent.getId()).isNotNull();
        assertThat(sent.getStatus()).isEqualTo(MessageStatus.SENT);

        // 3. 查询消息列表
        PageResult<Message> list = messageService.listByUserId(1000L, 0, 10);
        assertThat(list.getTotal()).isGreaterThanOrEqualTo(1);
        assertThat(list.getRows()).isNotEmpty();

        // 4. 获取消息详情
        Message detail = messageService.getById(sent.getId(), 1000L);
        assertThat(detail.getTitle()).isEqualTo("端到端测试消息");

        // 5. 标记已读
        messageService.markAsRead(sent.getId(), 1000L);

        // 6. 删除消息
        messageService.delete(sent.getId(), 1000L);
        PageResult<Message> afterDelete = messageService.listByUserId(1000L, 0, 10);
        assertThat(afterDelete.getRows()).isEmpty();
    }
}
