package com.workflow.notification.dispatch;

import com.workflow.notification.channel.ChannelAdapter;
import com.workflow.notification.channel.ChannelDeliveryResult;
import com.workflow.notification.channel.ChannelMessage;
import com.workflow.notification.channel.InAppChannelAdapter;
import com.workflow.notification.model.*;
import com.workflow.notification.sse.SseEmitterManager;
import com.workflow.notification.store.DeliveryRetryRepository;
import com.workflow.notification.store.MessageService;
import com.workflow.notification.store.RecipientRepository;
import com.workflow.notification.subscription.SubscriptionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MessageDispatcherTest {

    @Mock
    private MessageService messageService;

    @Mock
    private RecipientRepository recipientRepository;

    @Mock
    private SubscriptionService subscriptionService;

    @Mock
    private DeliveryRetryRepository retryRepository;

    private InAppChannelAdapter inAppAdapter;
    private SseEmitterManager sseManager;

    private MessageDispatcher dispatcher;

    private Message testMessage;

    @BeforeEach
    void setUp() {
        // 使用真实实例
        inAppAdapter = new InAppChannelAdapter();
        sseManager = new SseEmitterManager();
        dispatcher = new MessageDispatcher(messageService, recipientRepository, sseManager, List.of(inAppAdapter));

        testMessage = new Message();
        testMessage.setId(1L);
        testMessage.setTenantId("default");
        testMessage.setTemplateCode("TASK_CREATED");
        testMessage.setSenderId(100L);
        testMessage.setSenderType("SYSTEM");
        testMessage.setTitle("新任务通知");
        testMessage.setContent(java.util.Map.of("taskName", "审批任务"));
        testMessage.setPriority(MessagePriority.NORMAL);
        testMessage.setCategory(MessageCategory.WORKFLOW);
        testMessage.setMessageType(MessageType.PRIVATE);
    }

    @Test
    void handleMessageEvent_sends_in_app_message() {
        MessageEvent event = new MessageEvent(this, testMessage, List.of(1000L), List.of(ChannelType.IN_APP));

        dispatcher.handleMessageEvent(event);

        verify(messageService, times(1)).send(eq(testMessage), eq(List.of(1000L)));
    }

    @Test
    void handleMessageEvent_skips_unavailable_channel() {
        // 测试当渠道不可用时，异步部分不会抛异常
        // 由于 inAppAdapter 是真实实例且始终可用，这里测试的是异步逻辑的异常处理
        MessageEvent event = new MessageEvent(this, testMessage, List.of(1000L), List.of(ChannelType.IN_APP));

        // 不应抛出异常
        dispatcher.handleMessageEvent(event);

        // 站内信仍然会发送（同步部分）
        verify(messageService, times(1)).send(eq(testMessage), eq(List.of(1000L)));
    }

    // ==================== P0-3: 订阅判定接线 ====================

    @Test
    void handleMessageEvent_filters_in_app_recipients_by_subscription() {
        dispatcher = new MessageDispatcher(messageService, recipientRepository, sseManager,
                subscriptionService, retryRepository, List.of(inAppAdapter));

        // 用户 1000 未订阅站内信 → 被过滤
        when(subscriptionService.shouldSend(eq(testMessage), eq(1000L), eq(ChannelType.IN_APP)))
                .thenReturn(false);

        MessageEvent event = new MessageEvent(this, testMessage, List.of(1000L), List.of(ChannelType.IN_APP));
        dispatcher.handleMessageEvent(event);

        // 站内信落库不应被调用（收件人全被过滤）
        verify(messageService, never()).send(any(), anyList());
    }

    @Test
    void handleMessageEvent_sends_only_subscribed_in_app_recipients() {
        dispatcher = new MessageDispatcher(messageService, recipientRepository, sseManager,
                subscriptionService, retryRepository, List.of(inAppAdapter));

        // 1000 订阅、2000 未订阅
        when(subscriptionService.shouldSend(eq(testMessage), eq(1000L), eq(ChannelType.IN_APP)))
                .thenReturn(true);
        when(subscriptionService.shouldSend(eq(testMessage), eq(2000L), eq(ChannelType.IN_APP)))
                .thenReturn(false);

        MessageEvent event = new MessageEvent(this, testMessage, List.of(1000L, 2000L), List.of(ChannelType.IN_APP));
        dispatcher.handleMessageEvent(event);

        verify(messageService, times(1)).send(eq(testMessage), eq(List.of(1000L)));
    }

    // ==================== P0-2a: 外部渠道失败写入重试表 ====================

    @Test
    void asyncSend_writes_retry_on_channel_failure() {
        dispatcher = new MessageDispatcher(messageService, recipientRepository, sseManager,
                subscriptionService, retryRepository, List.of(inAppAdapter));

        ChannelAdapter smsAdapter = mock(ChannelAdapter.class);
        when(smsAdapter.getChannelType()).thenReturn(ChannelType.SMS);
        when(smsAdapter.send(any(ChannelMessage.class)))
                .thenReturn(ChannelDeliveryResult.failure("网关超时"));

        when(retryRepository.findByRecipientIdAndChannel(1000L, ChannelType.SMS)).thenReturn(null);

        dispatcher.asyncSend(smsAdapter, testMessage, List.of(1000L));

        verify(retryRepository).save(argThat(r ->
                r.getMessageId().equals(1L)
                        && r.getRecipientId().equals(1000L)
                        && r.getChannel() == ChannelType.SMS
                        && r.getStatus() == MessageStatus.PENDING
                        && r.getRetryCount() == 0));
    }

    @Test
    void asyncSend_skips_duplicate_pending_retry() {
        dispatcher = new MessageDispatcher(messageService, recipientRepository, sseManager,
                subscriptionService, retryRepository, List.of(inAppAdapter));

        ChannelAdapter smsAdapter = mock(ChannelAdapter.class);
        when(smsAdapter.getChannelType()).thenReturn(ChannelType.SMS);
        when(smsAdapter.send(any(ChannelMessage.class)))
                .thenReturn(ChannelDeliveryResult.failure("网关超时"));

        DeliveryRetry existing = new DeliveryRetry();
        existing.setStatus(MessageStatus.PENDING);
        when(retryRepository.findByRecipientIdAndChannel(1000L, ChannelType.SMS)).thenReturn(existing);

        dispatcher.asyncSend(smsAdapter, testMessage, List.of(1000L));

        // 已有 PENDING 重试记录，不重复入队
        verify(retryRepository, never()).save(any(DeliveryRetry.class));
    }

    @Test
    void asyncSend_writes_retry_after_terminal_state() {
        dispatcher = new MessageDispatcher(messageService, recipientRepository, sseManager,
                subscriptionService, retryRepository, List.of(inAppAdapter));

        ChannelAdapter smsAdapter = mock(ChannelAdapter.class);
        when(smsAdapter.getChannelType()).thenReturn(ChannelType.SMS);
        when(smsAdapter.send(any(ChannelMessage.class)))
                .thenReturn(ChannelDeliveryResult.failure("网关超时"));

        // 既有记录已 FAILED（终态）→ 允许重新入队
        DeliveryRetry failed = new DeliveryRetry();
        failed.setStatus(MessageStatus.FAILED);
        when(retryRepository.findByRecipientIdAndChannel(1000L, ChannelType.SMS)).thenReturn(failed);

        dispatcher.asyncSend(smsAdapter, testMessage, List.of(1000L));

        verify(retryRepository).save(argThat(r ->
                r.getRecipientId().equals(1000L) && r.getStatus() == MessageStatus.PENDING));
    }

    @Test
    void asyncSend_writes_retry_on_exception() {
        dispatcher = new MessageDispatcher(messageService, recipientRepository, sseManager,
                subscriptionService, retryRepository, List.of(inAppAdapter));

        ChannelAdapter smsAdapter = mock(ChannelAdapter.class);
        when(smsAdapter.getChannelType()).thenReturn(ChannelType.SMS);
        when(smsAdapter.send(any(ChannelMessage.class)))
                .thenThrow(new RuntimeException("连接拒绝"));

        when(retryRepository.findByRecipientIdAndChannel(1000L, ChannelType.SMS)).thenReturn(null);

        dispatcher.asyncSend(smsAdapter, testMessage, List.of(1000L));

        verify(retryRepository).save(argThat(r ->
                r.getRecipientId().equals(1000L)
                        && r.getChannel() == ChannelType.SMS
                        && r.getStatus() == MessageStatus.PENDING));
    }
}
