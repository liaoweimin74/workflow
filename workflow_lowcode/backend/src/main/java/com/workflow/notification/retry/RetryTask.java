package com.workflow.notification.retry;

import com.workflow.notification.channel.ChannelAdapter;
import com.workflow.notification.channel.ChannelDeliveryResult;
import com.workflow.notification.channel.ChannelMessage;
import com.workflow.notification.model.DeliveryRetry;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.MessageStatus;
import com.workflow.notification.store.DeliveryRetryRepository;
import com.workflow.notification.store.MessageRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 重试定时任务
 * 
 * <p>扫描失败的投递记录，按退避策略重试。
 * 退避间隔：1min → 5min → 30min，最多3次。
 * 重试时按 {@code DeliveryRetry.messageId} 从库加载原消息，
 * 重建 {@link ChannelMessage} 后真实调用渠道适配器重发。
 */
@Component
public class RetryTask {

    private static final Logger log = LoggerFactory.getLogger(RetryTask.class);

    /** 退避间隔（分钟） */
    private static final long[] BACKOFF_MINUTES = {1, 5, 30};

    private final DeliveryRetryRepository retryRepository;
    private final MessageRepository messageRepository;
    private final Map<String, ChannelAdapter> adapters;

    public RetryTask(DeliveryRetryRepository retryRepository, List<ChannelAdapter> channelAdapters) {
        this(retryRepository, null, channelAdapters);
    }

    @Autowired
    public RetryTask(DeliveryRetryRepository retryRepository,
                     MessageRepository messageRepository,
                     List<ChannelAdapter> channelAdapters) {
        this.retryRepository = retryRepository;
        this.messageRepository = messageRepository;
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

        // 从库加载原消息，重建渠道消息内容（修正：messageId 来自重试记录，recipientId 是收件人而非消息ID）
        if (messageRepository == null) {
            log.warn("消息仓库未注入，无法重建消息内容，跳过重试: recipientId={}", retry.getRecipientId());
            return;
        }
        Message message = messageRepository.findById(retry.getMessageId()).orElse(null);
        if (message == null) {
            log.warn("原消息不存在，无法重试: messageId={}", retry.getMessageId());
            return;
        }

        try {
            ChannelMessage channelMessage = new ChannelMessage();
            channelMessage.setMessageId(message.getId());
            channelMessage.setTenantId(message.getTenantId());
            channelMessage.setRecipientUserId(retry.getRecipientId());
            channelMessage.setTitle(message.getTitle());
            channelMessage.setContent(message.getContent() != null ? message.getContent().toString() : "");
            channelMessage.setTemplateData(message.getContent());
            channelMessage.setLinkTemplate(message.getLinkJson());

            ChannelDeliveryResult result = adapter.send(channelMessage);

            if (result.isSuccess()) {
                retry.setStatus(MessageStatus.SENT);
                retryRepository.save(retry);
                log.info("重试成功: recipientId={}, channel={}, messageId={}",
                        retry.getRecipientId(), retry.getChannel(), retry.getMessageId());
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
