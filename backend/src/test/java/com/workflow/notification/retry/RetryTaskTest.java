package com.workflow.notification.retry;

import com.workflow.notification.channel.ChannelAdapter;
import com.workflow.notification.channel.ChannelDeliveryResult;
import com.workflow.notification.model.ChannelType;
import com.workflow.notification.model.DeliveryRetry;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.MessageStatus;
import com.workflow.notification.store.DeliveryRetryRepository;
import com.workflow.notification.store.MessageRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RetryTaskTest {

    @Mock
    private DeliveryRetryRepository retryRepository;

    @Mock
    private MessageRepository messageRepository;

    private RetryTask retryTask;

    @BeforeEach
    void setUp() {
        retryTask = new RetryTask(retryRepository, Collections.emptyList());
    }

    @Test
    void run_does_nothing_when_no_retries() {
        when(retryRepository.findByStatusAndNextRetryAtLessThanEqual(
                eq(MessageStatus.PENDING), any(LocalDateTime.class)))
                .thenReturn(Collections.emptyList());

        retryTask.run();

        verify(retryRepository, never()).save(any(DeliveryRetry.class));
    }

    @Test
    void run_skips_when_adapter_not_registered() {
        DeliveryRetry retry = new DeliveryRetry();
        retry.setId(1L);
        retry.setRecipientId(100L);
        retry.setChannel(ChannelType.SMS);
        retry.setRetryCount(0);
        retry.setMaxRetry(3);
        retry.setStatus(MessageStatus.PENDING);

        when(retryRepository.findByStatusAndNextRetryAtLessThanEqual(
                eq(MessageStatus.PENDING), any(LocalDateTime.class)))
                .thenReturn(List.of(retry));

        retryTask.run();

        // 无 SMS adapter 注册，记录警告但不改变状态
        verify(retryRepository, never()).save(any(DeliveryRetry.class));
    }

    @Test
    void run_retries_and_marks_sent_on_success() {
        // 注册 SMS adapter（可用且发送成功）
        ChannelAdapter smsAdapter = mock(ChannelAdapter.class);
        when(smsAdapter.getChannelType()).thenReturn(ChannelType.SMS);
        when(smsAdapter.isAvailable()).thenReturn(true);
        when(smsAdapter.send(any())).thenReturn(ChannelDeliveryResult.success("sms_ok"));
        retryTask = new RetryTask(retryRepository, messageRepository, List.of(smsAdapter));

        Message message = new Message();
        message.setId(50L);
        message.setTenantId("default");
        message.setTitle("重试标题");
        message.setContent(java.util.Map.of("text", "重试内容"));
        when(messageRepository.findById(50L)).thenReturn(Optional.of(message));

        DeliveryRetry retry = new DeliveryRetry();
        retry.setId(1L);
        retry.setMessageId(50L);
        retry.setRecipientId(100L);
        retry.setChannel(ChannelType.SMS);
        retry.setRetryCount(0);
        retry.setMaxRetry(3);
        retry.setStatus(MessageStatus.PENDING);

        when(retryRepository.findByStatusAndNextRetryAtLessThanEqual(
                eq(MessageStatus.PENDING), any(LocalDateTime.class)))
                .thenReturn(List.of(retry));

        retryTask.run();

        verify(smsAdapter).send(argThat(cm ->
                cm.getMessageId().equals(50L) && cm.getRecipientUserId().equals(100L)));
        verify(retryRepository).save(argThat(r ->
                r.getId().equals(1L) && r.getStatus() == MessageStatus.SENT));
    }

    @Test
    void run_backs_off_on_failure_within_limit() {
        ChannelAdapter smsAdapter = mock(ChannelAdapter.class);
        when(smsAdapter.getChannelType()).thenReturn(ChannelType.SMS);
        when(smsAdapter.isAvailable()).thenReturn(true);
        when(smsAdapter.send(any())).thenReturn(ChannelDeliveryResult.failure("网关超时"));
        retryTask = new RetryTask(retryRepository, messageRepository, List.of(smsAdapter));

        Message message = new Message();
        message.setId(51L);
        message.setTenantId("default");
        message.setTitle("t");
        message.setContent(java.util.Map.of("text", "c"));
        when(messageRepository.findById(51L)).thenReturn(Optional.of(message));

        DeliveryRetry retry = new DeliveryRetry();
        retry.setId(2L);
        retry.setMessageId(51L);
        retry.setRecipientId(200L);
        retry.setChannel(ChannelType.SMS);
        retry.setRetryCount(0);
        retry.setMaxRetry(3);
        retry.setStatus(MessageStatus.PENDING);
        retry.setNextRetryAt(LocalDateTime.now());

        when(retryRepository.findByStatusAndNextRetryAtLessThanEqual(
                eq(MessageStatus.PENDING), any(LocalDateTime.class)))
                .thenReturn(List.of(retry));

        retryTask.run();

        verify(retryRepository).save(argThat(r ->
                r.getId().equals(2L)
                        && r.getRetryCount() == 1
                        && r.getStatus() == MessageStatus.PENDING
                        && r.getNextRetryAt() != null));
    }

    @Test
    void run_marks_failed_when_retry_count_exhausted() {
        ChannelAdapter smsAdapter = mock(ChannelAdapter.class);
        when(smsAdapter.getChannelType()).thenReturn(ChannelType.SMS);
        when(smsAdapter.isAvailable()).thenReturn(true);
        when(smsAdapter.send(any())).thenReturn(ChannelDeliveryResult.failure("持久失败"));
        retryTask = new RetryTask(retryRepository, messageRepository, List.of(smsAdapter));

        Message message = new Message();
        message.setId(52L);
        message.setTenantId("default");
        message.setTitle("t");
        message.setContent(java.util.Map.of("text", "c"));
        when(messageRepository.findById(52L)).thenReturn(Optional.of(message));

        DeliveryRetry retry = new DeliveryRetry();
        retry.setId(3L);
        retry.setMessageId(52L);
        retry.setRecipientId(300L);
        retry.setChannel(ChannelType.SMS);
        retry.setRetryCount(2);   // 已重试 2 次，本次为最后一次
        retry.setMaxRetry(3);
        retry.setStatus(MessageStatus.PENDING);

        when(retryRepository.findByStatusAndNextRetryAtLessThanEqual(
                eq(MessageStatus.PENDING), any(LocalDateTime.class)))
                .thenReturn(List.of(retry));

        retryTask.run();

        verify(retryRepository).save(argThat(r ->
                r.getId().equals(3L)
                        && r.getRetryCount() == 3
                        && r.getStatus() == MessageStatus.FAILED));
    }

    @Test
    void run_skips_when_message_not_found() {
        ChannelAdapter smsAdapter = mock(ChannelAdapter.class);
        when(smsAdapter.getChannelType()).thenReturn(ChannelType.SMS);
        when(smsAdapter.isAvailable()).thenReturn(true);
        retryTask = new RetryTask(retryRepository, messageRepository, List.of(smsAdapter));

        when(messageRepository.findById(99L)).thenReturn(Optional.empty());

        DeliveryRetry retry = new DeliveryRetry();
        retry.setId(4L);
        retry.setMessageId(99L);
        retry.setRecipientId(400L);
        retry.setChannel(ChannelType.SMS);
        retry.setRetryCount(0);
        retry.setMaxRetry(3);
        retry.setStatus(MessageStatus.PENDING);

        when(retryRepository.findByStatusAndNextRetryAtLessThanEqual(
                eq(MessageStatus.PENDING), any(LocalDateTime.class)))
                .thenReturn(List.of(retry));

        retryTask.run();

        // 消息不存在：不发送、不保存
        verify(smsAdapter, never()).send(any());
        verify(retryRepository, never()).save(any(DeliveryRetry.class));
    }
}
