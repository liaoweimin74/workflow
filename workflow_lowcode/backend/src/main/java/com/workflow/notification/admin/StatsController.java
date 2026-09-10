package com.workflow.notification.admin;

import com.workflow.common.domain.R;
import com.workflow.notification.store.DeliveryRetryRepository;
import com.workflow.notification.store.MessageRepository;
import com.workflow.notification.store.RecipientRepository;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 管理端统计 API
 */
@RestController
@RequestMapping("/api/v1/admin/notification/stats")
public class StatsController {

    private final MessageRepository messageRepository;
    private final RecipientRepository recipientRepository;
    private final DeliveryRetryRepository deliveryRetryRepository;

    public StatsController(MessageRepository messageRepository,
                           RecipientRepository recipientRepository,
                           DeliveryRetryRepository deliveryRetryRepository) {
        this.messageRepository = messageRepository;
        this.recipientRepository = recipientRepository;
        this.deliveryRetryRepository = deliveryRetryRepository;
    }

    /**
     * 获取消息统计概览
     */
    @GetMapping("/overview")
    public R<Map<String, Object>> overview() {
        NotificationAdminAuthorization.requireAdmin();
        long totalMessages = messageRepository.count();
        long totalRecipients = recipientRepository.count();
        long failedRetries = deliveryRetryRepository.count();

        return R.ok(Map.of(
                "totalMessages", totalMessages,
                "totalRecipients", totalRecipients,
                "failedRetries", failedRetries
        ));
    }

}
