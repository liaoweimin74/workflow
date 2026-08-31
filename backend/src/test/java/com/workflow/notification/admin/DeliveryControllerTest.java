package com.workflow.notification.admin;

import com.workflow.common.domain.R;
import com.workflow.notification.model.ChannelType;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.MessageStatus;
import com.workflow.notification.model.Recipient;
import com.workflow.notification.store.MessageRepository;
import com.workflow.notification.store.RecipientRepository;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * DeliveryController 发送记录聚合逻辑验证
 *
 * <p>发送记录应从 msg_message + msg_recipient 聚合，
 * 每次发送（含渠道测试消息）都会写入这两个表，因此发送记录不应为空。
 */
class DeliveryControllerTest {

    private final MessageRepository messageRepository = mock(MessageRepository.class);
    private final RecipientRepository recipientRepository = mock(RecipientRepository.class);
    private final DeliveryController controller =
            new DeliveryController(messageRepository, recipientRepository);

    private Message message(long id, String title, LocalDateTime createdAt) {
        Message m = new Message();
        m.setId(id);
        m.setTitle(title);
        m.setCreatedAt(createdAt);
        m.setStatus(MessageStatus.SENT);
        return m;
    }

    private Recipient recipient(long userId, String username) {
        Recipient r = new Recipient();
        r.setUserId(userId);
        r.setUsername(username);
        r.setChannel(ChannelType.IN_APP);
        r.setStatus(MessageStatus.PENDING);
        return r;
    }

    @Test
    void list_returns_aggregated_records_including_test_message() {
        LocalDateTime now = LocalDateTime.of(2026, 9, 1, 10, 0);
        Message testMessage = message(1L, "【渠道测试】站内信连通性测试", now);
        when(messageRepository.findAll(any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(testMessage), PageRequest.of(0, 20), 1));
        when(recipientRepository.findByMessageId(1L)).thenReturn(List.of(recipient(100L, "admin")));

        R<Map<String, Object>> res = controller.list(0, 20);

        assertThat(res.getCode()).isEqualTo(200);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) res.getData().get("rows");
        assertThat(rows).hasSize(1);
        Map<String, Object> row = rows.get(0);
        assertThat(row.get("title")).isEqualTo("【渠道测试】站内信连通性测试");
        assertThat(row.get("recipientCount")).isEqualTo(1);
        assertThat(row.get("channel")).isEqualTo("IN_APP");
        assertThat(row.get("status")).isEqualTo("SENT");
        assertThat(row.get("createdAt")).isEqualTo(now);
        assertThat(res.getData().get("total")).isEqualTo(1L);
    }

    @Test
    void list_returns_empty_when_no_messages() {
        when(messageRepository.findAll(any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        R<Map<String, Object>> res = controller.list(0, 20);

        assertThat(res.getCode()).isEqualTo(200);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) res.getData().get("rows");
        assertThat(rows).isEmpty();
        assertThat(res.getData().get("total")).isEqualTo(0L);
    }
}
