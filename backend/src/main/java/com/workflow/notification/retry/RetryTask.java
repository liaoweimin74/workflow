package com.workflow.notification.retry;

import com.workflow.notification.channel.ChannelAdapter;
import com.workflow.notification.channel.ChannelDeliveryResult;
import com.workflow.notification.channel.ChannelMessage;
import com.workflow.notification.model.DeliveryRetry;
import com.workflow.notification.model.MessageStatus;
import com.workflow.notification.store.DeliveryRetryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 重试定时任务
 * 
 * <p>扫描失败的投递记录，按退避策略重试
 * 退避间隔：1min → 5min → 30min，最多3次
 */
@Component
public class RetryTask {

    private static final Logger log = LoggerFactory.getLogger(RetryTask.class);

    /** 退避间隔（分钟） */
    private static final long[] BACKOFF_MINUTES = {1, 5, 30};

    private final DeliveryRetryRepository retryRepository;
    private final Map<String, ChannelAdapter> adapters;

    public RetryTask(DeliveryRetryRepository retryRepository, List<ChannelAdapter> channelAdapters) {
        this.retryRepository = retryRepository;
        this.adapters = new java.util.concurrent.ConcurrentHashMap<>();
        for (ChannelAdapter adapter : channelAdapters) {
            adapters.put(adapter.getChannelType().name(), adapter);
        }
    }

    /**
     * 每分钟扫描一次需要重试的记录
     */
    @Scheduled(fixedDelay = 60000)
    public void run() {
        List<DeliveryRetry> retries = retryRepository.findByStatusAndNextRetryAtLessThanEqual(
                MessageStatus.PENDING, LocalDateTime.now());

        if (retries.isEmpty()) return;

        log.info("扫描到 {} 条需要重试的投递记录", retries.size());

        for (DeliveryRetry retry : retries) {
            processRetry(retry);
        }
    }

    private void processRetry(DeliveryRetry retry) {
        ChannelAdapter adapter = adapters.get(retry.getChannel().name());
        if (adapter == null || !adapter.isAvailable()) {
            log.warn("渠道不可用，跳过重试: channel={}", retry.getChannel());
            return;
        }

        try {
            // TODO: 从 Recipient 获取消息内容构建 ChannelMessage
            ChannelMessage message = new ChannelMessage();
            message.setMessageId(retry.getRecipientId());

            ChannelDeliveryResult result = adapter.send(message);

            if (result.isSuccess()) {
                retry.setStatus(MessageStatus.SENT);
                retryRepository.save(retry);
                log.info("重试成功: recipientId={}, channel={}", retry.getRecipientId(), retry.getChannel());
            } else {
                handleRetryFailure(retry, result.getError());
            }
        } catch (Exception e) {
            handleRetryFailure(retry, e.getMessage());
        }
    }

    private void handleRetryFailure(DeliveryRetry retry, String error) {
        int newCount = retry.getRetryCount() + 1;

        if (newCount >= retry.getMaxRetry()) {
            // 超过最大重试次数，标记失败
            retry.setRetryCount(newCount);
            retry.setStatus(MessageStatus.FAILED);
            retry.setLastError(error);
            retryRepository.save(retry);
            log.error("重试次数耗尽，标记失败: recipientId={}, retryCount={}", retry.getRecipientId(), newCount);
        } else {
            // 计算下次重试时间（退避）
            long backoffIndex = Math.min(newCount - 1, BACKOFF_MINUTES.length - 1);
            LocalDateTime nextRetry = LocalDateTime.now().plusMinutes(BACKOFF_MINUTES[(int) backoffIndex]);

            retry.setRetryCount(newCount);
            retry.setNextRetryAt(nextRetry);
            retry.setLastError(error);
            retryRepository.save(retry);
            log.info("重试失败，安排下次重试: recipientId={}, nextRetry={}", retry.getRecipientId(), nextRetry);
        }
    }
}
