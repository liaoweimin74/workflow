package com.workflow.notification.dispatch;

import com.workflow.notification.channel.ChannelAdapter;
import com.workflow.notification.channel.ChannelDeliveryResult;
import com.workflow.notification.channel.ChannelMessage;
import com.workflow.notification.model.ChannelType;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.Recipient;
import com.workflow.notification.sse.SseEmitterManager;
import com.workflow.notification.store.MessageService;
import com.workflow.notification.store.RecipientRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 消息分发协调器
 * 
 * <p>监听 MessageEvent，同步写入站内信，异步发送外部渠道
 */
@Component
public class MessageDispatcher {

    private static final Logger log = LoggerFactory.getLogger(MessageDispatcher.class);

    private final MessageService messageService;
    private final RecipientRepository recipientRepository;
    private final SseEmitterManager sseManager;
    private final Map<ChannelType, ChannelAdapter> adapters;

    public MessageDispatcher(MessageService messageService,
                             RecipientRepository recipientRepository,
                             SseEmitterManager sseManager,
                             List<ChannelAdapter> channelAdapters) {
        this.messageService = messageService;
        this.recipientRepository = recipientRepository;
        this.sseManager = sseManager;
        this.adapters = new ConcurrentHashMap<>();
        for (ChannelAdapter adapter : channelAdapters) {
            adapters.put(adapter.getChannelType(), adapter);
        }
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

        // 1. 同步写入站内信
        if (channels.contains(ChannelType.IN_APP)) {
            messageService.send(message, recipientIds);
            log.info("站内信投递完成: messageId={}", message.getId());

            // 2. 通过 SSE 推送给在线用户
            for (Long userId : recipientIds) {
                sseManager.sendToUser(userId, "new-message", message);
            }
        }

        // 2. 异步发送外部渠道
        for (ChannelType channelType : channels) {
            if (channelType == ChannelType.IN_APP) continue;
            
            ChannelAdapter adapter = adapters.get(channelType);
            if (adapter == null || !adapter.isAvailable()) {
                log.warn("渠道不可用: {}", channelType);
                continue;
            }

            // 异步发送
            asyncSend(adapter, message, recipientIds);
        }
    }

    /**
     * 异步发送消息到外部渠道
     */
    @Async
    public void asyncSend(ChannelAdapter adapter, Message message, List<Long> recipientIds) {
        for (Long userId : recipientIds) {
            try {
                ChannelMessage channelMessage = new ChannelMessage();
                channelMessage.setMessageId(message.getId());
                channelMessage.setTenantId(message.getTenantId());
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
                    // TODO: 写入重试表
                }
            } catch (Exception e) {
                log.error("渠道投递异常: channel={}, userId={}", adapter.getChannelType(), userId, e);
                // TODO: 写入重试表
            }
        }
    }
}
