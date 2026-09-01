package com.workflow.notification.dispatch;

import com.workflow.notification.channel.ChannelAdapter;
import com.workflow.notification.channel.ChannelDeliveryResult;
import com.workflow.notification.channel.ChannelMessage;
import com.workflow.notification.model.ChannelType;
import com.workflow.notification.model.DeliveryRetry;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.MessageStatus;
import com.workflow.notification.model.Recipient;
import com.workflow.notification.sse.SseEmitterManager;
import com.workflow.notification.store.DeliveryRetryRepository;
import com.workflow.notification.store.MessageService;
import com.workflow.notification.store.RecipientRepository;
import com.workflow.notification.subscription.SubscriptionService;
import com.workflow.notification.subscription.ChannelConfigService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 消息分发协调器
 * 
 * <p>监听 MessageEvent，同步写入站内信，异步发送外部渠道。
 * 新消息创建渠道投递时会检查管理员渠道启用状态和业务订阅规则；
 * 已创建的投递记录由发送/重试链路继续处理，不受后续渠道状态变化影响。
 * 外部渠道投递失败/异常时会写入 {@link DeliveryRetry} 重试表，交由 {@code RetryTask} 按退避策略重发。
 */
@Component
public class MessageDispatcher {

    private static final Logger log = LoggerFactory.getLogger(MessageDispatcher.class);

    private final MessageService messageService;
    private final RecipientRepository recipientRepository;
    private final SseEmitterManager sseManager;
    private final SubscriptionService subscriptionService;
    private final ChannelConfigService channelConfigService;
    private final DeliveryRetryRepository retryRepository;
    private final Map<ChannelType, ChannelAdapter> adapters;

    public MessageDispatcher(MessageService messageService,
                             RecipientRepository recipientRepository,
                             SseEmitterManager sseManager,
                             List<ChannelAdapter> channelAdapters) {
        this(messageService, recipientRepository, sseManager, null, null, null, channelAdapters);
    }

    public MessageDispatcher(MessageService messageService,
                             RecipientRepository recipientRepository,
                             SseEmitterManager sseManager,
                             SubscriptionService subscriptionService,
                             DeliveryRetryRepository retryRepository,
                             List<ChannelAdapter> channelAdapters) {
        this(messageService, recipientRepository, sseManager, subscriptionService, retryRepository, null, channelAdapters);
    }

    @Autowired
    public MessageDispatcher(MessageService messageService,
                             RecipientRepository recipientRepository,
                             SseEmitterManager sseManager,
                             SubscriptionService subscriptionService,
                             DeliveryRetryRepository retryRepository,
                             ChannelConfigService channelConfigService,
                              List<ChannelAdapter> channelAdapters) {
        this.messageService = messageService;
        this.recipientRepository = recipientRepository;
        this.sseManager = sseManager;
        this.subscriptionService = subscriptionService;
        this.retryRepository = retryRepository;
        this.channelConfigService = channelConfigService;
        this.adapters = new ConcurrentHashMap<>();
        for (ChannelAdapter adapter : channelAdapters) {
            adapters.put(adapter.getChannelType(), adapter);
        }
    }

    /**
     * 过滤出业务规则允许接收该渠道消息的收件人。
     * 未注入 SubscriptionService（如纯单元测试）时不过滤，保持向后兼容。
     */
    private List<Long> eligibleRecipients(Message message, List<Long> recipientIds, ChannelType channel) {
        if (subscriptionService == null) {
            return recipientIds;
        }
        return recipientIds.stream()
                .filter(userId -> subscriptionService.shouldSend(message, userId, channel))
                .toList();
    }

    /**
     * 处理消息事件
     */
    @EventListener
    public void handleMessageEvent(MessageEvent event) {
        Message message = event.getMessage();
        List<Long> recipientIds = event.getRecipientIds();
        List<ChannelType> channels = event.getChannels();

        log.info("收到消息事件: templateCode={}, recipientCount={}, channels={}",
                message.getTemplateCode(), recipientIds.size(), channels);

        // 1. 同步写入站内信（站内信收件人经订阅判定过滤）
        if (channels.contains(ChannelType.IN_APP)
                && (channelConfigService == null || channelConfigService.isEnabled(ChannelType.IN_APP))) {
            List<Long> inAppRecipients = recipientIds;
            if (!inAppRecipients.isEmpty()) {
                messageService.send(message, inAppRecipients);
                log.info("站内信投递完成: messageId={}, recipients={}", message.getId(), inAppRecipients.size());

                // 2. 通过 SSE 推送给在线用户
                for (Long userId : inAppRecipients) {
                    sseManager.sendToUser(userId, "new-message", message);
                }
            } else {
                log.info("站内信收件人全部被订阅规则过滤，跳过投递: messageId={}", message.getId());
            }
        }

        // 2. 异步发送外部渠道（外部渠道收件人同样经订阅判定过滤）
        for (ChannelType channelType : channels) {
            if (channelType == ChannelType.IN_APP) continue;

            if (channelConfigService != null && !channelConfigService.isEnabled(channelType)) {
                log.info("渠道已禁用，跳过新消息投递: channel={}, messageId={}", channelType, message.getId());
                continue;
            }
            
            ChannelAdapter adapter = adapters.get(channelType);
            if (adapter == null || !adapter.isAvailable()) {
                log.warn("渠道不可用: {}", channelType);
                continue;
            }

            List<Long> channelRecipients = eligibleRecipients(message, recipientIds, channelType);
            if (channelRecipients.isEmpty()) {
                log.info("渠道收件人全部被订阅规则过滤，跳过投递: channel={}, messageId={}", channelType, message.getId());
                continue;
            }

            // 异步发送
            asyncSend(adapter, message, channelRecipients);
        }
    }

    /**
     * 异步发送消息到外部渠道
     *
     * <p>投递失败或异常时写入 {@link DeliveryRetry} 重试表（含 messageId/recipientId/channel），
     * 交由 {@code RetryTask} 按 1min→5min→30min 退避重发，最多 3 次。
     */
    @Async
    public void asyncSend(ChannelAdapter adapter, Message message, List<Long> recipientIds) {
        for (Long userId : recipientIds) {
            try {
                ChannelMessage channelMessage = new ChannelMessage();
                channelMessage.setMessageId(message.getId());
                channelMessage.setTenantId(message.getTenantId());
                channelMessage.setRecipientUserId(userId);
                channelMessage.setTitle(message.getTitle());
                channelMessage.setContent(message.getContent() != null ? message.getContent().toString() : "");
                channelMessage.setTemplateData(message.getContent());
                channelMessage.setLinkTemplate(message.getLinkJson());

                ChannelDeliveryResult result = adapter.send(channelMessage);
                if (result.isSuccess()) {
                    log.info("渠道投递成功: channel={}, userId={}, messageId={}",
                            adapter.getChannelType(), userId, message.getId());
                } else {
                    log.error("渠道投递失败: channel={}, userId={}, error={}",
                            adapter.getChannelType(), userId, result.getError());
                    saveRetry(message, userId, adapter.getChannelType(), result.getError());
                }
            } catch (Exception e) {
                log.error("渠道投递异常: channel={}, userId={}", adapter.getChannelType(), userId, e);
                saveRetry(message, userId, adapter.getChannelType(), e.getMessage());
            }
        }
    }

    /**
     * 写入重试记录（首次失败即 PENDING + nextRetryAt=now，由 RetryTask 立即拾取）。
     * 判重：仅当同一 (recipientId, channel) 已有 PENDING（仍在队列）记录时跳过；
     * 若既有记录已到终态（SENT/FAILED），允许重新入队，避免新消息投递失败被吞掉。
     */
    private void saveRetry(Message message, Long userId, ChannelType channel, String error) {
        if (retryRepository == null) {
            log.warn("重试仓库未注入，跳过重试入队: channel={}, userId={}", channel, userId);
            return;
        }
        DeliveryRetry existing = retryRepository.findByRecipientIdAndChannel(userId, channel);
        if (existing != null && existing.getStatus() == MessageStatus.PENDING) {
            log.debug("该投递已有待重试记录，跳过重复入队: recipientId={}, channel={}", userId, channel);
            return;
        }
        DeliveryRetry retry = new DeliveryRetry();
        retry.setTenantId(message.getTenantId());
        retry.setMessageId(message.getId());
        retry.setRecipientId(userId);
        retry.setChannel(channel);
        retry.setRetryCount(0);
        retry.setMaxRetry(3);
        retry.setStatus(MessageStatus.PENDING);
        retry.setLastError(error);
        retry.setNextRetryAt(LocalDateTime.now());
        retryRepository.save(retry);
        log.info("渠道投递失败已入重试队列: recipientId={}, channel={}, messageId={}", userId, channel, message.getId());
    }
}
