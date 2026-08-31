package com.workflow.notification.api;

import com.workflow.common.domain.R;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.ChannelType;
import com.workflow.notification.dispatch.MessageEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 内部 API（供其他模块调用）
 */
@RestController
@RequestMapping("/api/v1/internal/notifications")
public class InternalNotificationController {

    private final ApplicationEventPublisher eventPublisher;

    public InternalNotificationController(ApplicationEventPublisher eventPublisher) {
        this.eventPublisher = eventPublisher;
    }

    /**
     * 发送消息（内部调用）
     */
    @PostMapping("/send")
    public R<Void> send(@RequestBody Message message,
                        @RequestParam List<Long> recipientIds,
                        @RequestParam List<ChannelType> channels) {
        eventPublisher.publishEvent(new MessageEvent(this, message, recipientIds, channels));
        return R.ok();
    }
}
