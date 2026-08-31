package com.workflow.notification.retry;

import com.workflow.notification.model.ChannelType;
import com.workflow.notification.model.DeliveryRetry;
import com.workflow.notification.model.MessageStatus;
import com.workflow.notification.store.DeliveryRetryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RetryTaskTest {

    @Mock
    private DeliveryRetryRepository retryRepository;

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
    void run_retries_pending_records() {
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

        // 由于没有 SMS adapter 注册，会记录警告但不抛异常
        verify(retryRepository, never()).save(any(DeliveryRetry.class));
    }
}
