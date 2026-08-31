package com.workflow.notification.store;

import com.workflow.common.domain.PageResult;
import com.workflow.notification.cache.NotificationCache;
import com.workflow.notification.model.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MessageServiceTest {

    @Mock
    private MessageRepository messageRepository;

    @Mock
    private RecipientRepository recipientRepository;

    @Mock
    private NotificationCache notificationCache;

    @InjectMocks
    private com.workflow.notification.store.impl.MessageServiceImpl messageService;

    private Message testMessage;
    private Recipient testRecipient;

    @BeforeEach
    void setUp() {
        testMessage = new Message();
        testMessage.setId(1L);
        testMessage.setTenantId("default");
        testMessage.setTemplateCode("TASK_CREATED");
        testMessage.setSenderId(100L);
        testMessage.setSenderType("SYSTEM");
        testMessage.setTitle("新任务通知");
        testMessage.setContent(Map.of("taskName", "审批任务"));
        testMessage.setPriority(MessagePriority.NORMAL);
        testMessage.setCategory(MessageCategory.WORKFLOW);
        testMessage.setMessageType(MessageType.PRIVATE);

        testRecipient = new Recipient();
        testRecipient.setId(1L);
        testRecipient.setTenantId("default");
        testRecipient.setMessageId(1L);
        testRecipient.setUserId(1000L);
        testRecipient.setUsername("test_user");
        testRecipient.setChannel(ChannelType.IN_APP);
        testRecipient.setStatus(MessageStatus.PENDING);
    }

    @Test
    void send_creates_message_and_recipients() {
        when(messageRepository.save(any(Message.class))).thenReturn(testMessage);
        when(recipientRepository.save(any(Recipient.class))).thenReturn(testRecipient);

        Message result = messageService.send(testMessage, List.of(1000L, 2001L));

        assertThat(result).isNotNull();
        assertThat(result.getStatus()).isEqualTo(MessageStatus.SENT);
        verify(messageRepository, times(1)).save(any(Message.class));
        verify(recipientRepository, times(2)).save(any(Recipient.class));
    }

    @Test
    void getById_returns_message_when_authorized() {
        when(messageRepository.findById(1L)).thenReturn(Optional.of(testMessage));
        when(recipientRepository.findByMessageId(1L)).thenReturn(List.of(testRecipient));

        Message result = messageService.getById(1L, 1000L);

        assertThat(result).isNotNull();
        assertThat(result.getId()).isEqualTo(1L);
    }

    @Test
    void getById_throws_when_unauthorized() {
        when(messageRepository.findById(1L)).thenReturn(Optional.of(testMessage));
        when(recipientRepository.findByMessageId(1L)).thenReturn(List.of(testRecipient));

        assertThatThrownBy(() -> messageService.getById(1L, 9999L))
                .isInstanceOf(com.workflow.common.exception.BusinessException.class);
    }

    @Test
    void markAsRead_updates_recipient_status() {
        when(recipientRepository.markAsRead(eq(1L), eq(1000L), any(LocalDateTime.class))).thenReturn(1);

        messageService.markAsRead(1L, 1000L);

        verify(recipientRepository).markAsRead(eq(1L), eq(1000L), any(LocalDateTime.class));
    }

    @Test
    void markAllAsRead_updates_all_recipients() {
        when(recipientRepository.markAllAsRead(eq(1000L), any(LocalDateTime.class))).thenReturn(5);

        messageService.markAllAsRead(1000L);

        verify(recipientRepository).markAllAsRead(eq(1000L), any(LocalDateTime.class));
    }

    @Test
    void getUnreadCount_returns_number() {
        // 缓存未命中，返回 null
        when(notificationCache.getUnreadCount(1000L)).thenReturn(null);
        when(recipientRepository.findByUserIdAndStatus(1000L, MessageStatus.PENDING))
                .thenReturn(List.of(testRecipient));

        long count = messageService.getUnreadCount(1000L);

        assertThat(count).isEqualTo(1);
        // 验证回填缓存
        verify(notificationCache).setUnreadCount(1000L, 1);
    }

    @Test
    void listByUserId_returns_empty_when_no_messages() {
        when(recipientRepository.findByUserId(1000L)).thenReturn(Collections.emptyList());

        PageResult<Message> result = messageService.listByUserId(1000L, 0, 10, null, null, null, null, null);

        assertThat(result.getTotal()).isEqualTo(0);
        assertThat(result.getRows()).isEmpty();
    }

    @Test
    void listByUserId_filters_by_unread_status() {
        when(recipientRepository.findByUserIdAndStatus(1000L, MessageStatus.PENDING))
                .thenReturn(List.of(testRecipient));
        when(messageRepository.findAll(any(org.springframework.data.jpa.domain.Specification.class),
                any(org.springframework.data.domain.PageRequest.class)))
                .thenReturn(new org.springframework.data.domain.PageImpl<>(Collections.emptyList()));

        PageResult<Message> result = messageService.listByUserId(1000L, 0, 10, null, null, true, null, null);

        assertThat(result.getTotal()).isEqualTo(0); // 无消息匹配
        verify(recipientRepository).findByUserIdAndStatus(1000L, MessageStatus.PENDING);
    }

    @Test
    void batchMarkAsRead_updates_recipients_and_invalidates_cache() {
        when(recipientRepository.markBatchAsRead(eq(1000L), eq(List.of(1L, 2L)), any(LocalDateTime.class)))
                .thenReturn(2);

        messageService.batchMarkAsRead(List.of(1L, 2L), 1000L);

        verify(recipientRepository).markBatchAsRead(eq(1000L), eq(List.of(1L, 2L)), any(LocalDateTime.class));
        verify(notificationCache).invalidateUnread(1000L);
    }

    @Test
    void batchMarkAsRead_empty_list_is_noop() {
        messageService.batchMarkAsRead(Collections.emptyList(), 1000L);

        verify(recipientRepository, never()).markBatchAsRead(any(), any(), any());
    }
}
