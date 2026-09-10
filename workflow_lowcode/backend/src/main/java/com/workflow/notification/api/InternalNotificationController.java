package com.workflow.notification.api;

import com.workflow.common.domain.R;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.ChannelType;
import com.workflow.notification.dispatch.MessageEvent;
import com.workflow.notification.dispatch.MessageSender;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 内部 API（供其他模块调用）
 */
@RestController
@RequestMapping("/api/v1/internal/notifications")
public class InternalNotificationController {

    private final ApplicationEventPublisher eventPublisher;
    private final MessageSender messageSender;

    public InternalNotificationController(ApplicationEventPublisher eventPublisher,
                                          MessageSender messageSender) {
        this.eventPublisher = eventPublisher;
        this.messageSender = messageSender;
    }

    /**
     * 发送消息（内部调用）：自由内容，调用方提供已填充好的 Message
     */
    @PostMapping("/send")
    public R<Void> send(@RequestBody Message message,
                        @RequestParam List<Long> recipientIds,
                        @RequestParam List<ChannelType> channels) {
        eventPublisher.publishEvent(new MessageEvent(this, message, recipientIds, channels));
        return R.ok();
    }

    /**
     * 按模板发送消息（内部调用）：只需提供模板代码与变量，
     * 内部加载模板、校验必填变量并渲染标题（见 {@link MessageSender#sendByTemplate}）。
     */
    @PostMapping("/send-by-template")
    public R<Void> sendByTemplate(@RequestBody TemplateSendRequest request,
                                  @RequestParam List<Long> recipientIds,
                                  @RequestParam List<ChannelType> channels) {
        var messageType = request.getMessageType() != null
                ? request.getMessageType() : com.workflow.notification.model.MessageType.PRIVATE;
        if (request.getEventCode() != null && !request.getEventCode().isBlank()) {
            messageSender.sendByTemplate(request.getSenderId(), request.getTemplateCode(), request.getVariables(),
                    messageType, recipientIds, channels, request.getEventCode());
        } else {
            messageSender.sendByTemplate(request.getSenderId(), request.getTemplateCode(), request.getVariables(),
                    messageType, recipientIds, channels);
        }
        return R.ok();
    }
}
