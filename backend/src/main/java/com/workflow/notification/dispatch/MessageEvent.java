package com.workflow.notification.dispatch;

import com.workflow.notification.model.ChannelType;
import com.workflow.notification.model.Message;
import org.springframework.context.ApplicationEvent;

import java.util.List;

/**
 * 消息事件
 * 
 * <p>业务模块通过发布此事件触发消息发送
 */
public class MessageEvent extends ApplicationEvent {

    private final Message message;
    private final List<Long> recipientIds;
    private final List<ChannelType> channels;

    public MessageEvent(Object source, Message message, List<Long> recipientIds, List<ChannelType> channels) {
        super(source);
        this.message = message;
        this.recipientIds = recipientIds;
        this.channels = channels;
    }

    public Message getMessage() { return message; }
    public List<Long> getRecipientIds() { return recipientIds; }
    public List<ChannelType> getChannels() { return channels; }
}
