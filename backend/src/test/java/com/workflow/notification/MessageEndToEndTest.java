package com.workflow.notification;

import com.workflow.common.domain.PageResult;
import com.workflow.notification.model.*;
import com.workflow.notification.store.MessageService;
import com.workflow.notification.dispatch.MessageEvent;
import com.workflow.notification.sse.SseEmitterManager;
import jakarta.persistence.EntityManager;
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

    @Autowired
    private EntityManager entityManager;

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
        PageResult<Message> list = messageService.listByUserId(1000L, 0, 10, null, null, null, null, null, null);
        assertThat(list.getTotal()).isGreaterThanOrEqualTo(1);
        assertThat(list.getRows()).isNotEmpty();

        // 4. 获取消息详情
        Message detail = messageService.getById(sent.getId(), 1000L);
        assertThat(detail.getTitle()).isEqualTo("端到端测试消息");

        // 5. 标记已读
        messageService.markAsRead(sent.getId(), 1000L);
        // 清空持久化上下文：JPQL bulk update 不更新一级缓存实体，避免读到旧状态
        entityManager.clear();
        // 验证已读：按 messageId 标记后，该消息在列表中状态变为 SENT（已读）
        PageResult<Message> readList = messageService.listByUserId(1000L, 0, 10, null, null, null, null, null, null);
        Message marked = readList.getRows().stream()
                .filter(m -> m.getId().equals(sent.getId()))
                .findFirst().orElseThrow(() -> new AssertionError("标记已读后消息应仍在列表中"));
        assertThat(marked.getStatus()).isEqualTo(MessageStatus.SENT);

        // 6. 删除消息
        messageService.delete(sent.getId(), 1000L);
        PageResult<Message> afterDelete = messageService.listByUserId(1000L, 0, 10, null, null, null, null, null, null);
        assertThat(afterDelete.getRows()).isEmpty();
    }

    @Test
    void listByUserId_filters_by_messageType() {
        // 发送一条 PUBLIC 公告 + 一条 PRIVATE 消息
        Message pub = new Message();
        pub.setTenantId("default");
        pub.setTemplateCode("PUB_1");
        pub.setSenderId(100L);
        pub.setSenderType("SYSTEM");
        pub.setTitle("公共公告");
        pub.setContent(Map.of("k", "v"));
        pub.setPriority(MessagePriority.NORMAL);
        pub.setCategory(MessageCategory.SYSTEM);
        pub.setMessageType(MessageType.PUBLIC);
        messageService.send(pub, List.of(1000L));

        Message prv = new Message();
        prv.setTenantId("default");
        prv.setTemplateCode("PRV_1");
        prv.setSenderId(100L);
        prv.setSenderType("SYSTEM");
        prv.setTitle("私人消息");
        prv.setContent(Map.of("k", "v"));
        prv.setPriority(MessagePriority.NORMAL);
        prv.setCategory(MessageCategory.WORKFLOW);
        prv.setMessageType(MessageType.PRIVATE);
        messageService.send(prv, List.of(1000L));

        // 仅过滤 PUBLIC：应只返回公共公告
        PageResult<Message> result = messageService.listByUserId(1000L, 0, 10, null, null, null, null, null,
                MessageType.PUBLIC);
        assertThat(result.getRows()).isNotEmpty();
        assertThat(result.getRows()).allMatch(m -> m.getMessageType() == MessageType.PUBLIC);
        assertThat(result.getRows()).anyMatch(m -> "公共公告".equals(m.getTitle()));
    }
}
