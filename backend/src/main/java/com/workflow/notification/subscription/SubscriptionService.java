package com.workflow.notification.subscription;

import com.workflow.notification.model.ChannelType;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.MessagePriority;
import com.workflow.notification.model.UserSubscription;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 订阅服务
 */
@Service
public class SubscriptionService {

    private final UserSubscriptionRepository userSubscriptionRepository;

    public SubscriptionService(UserSubscriptionRepository userSubscriptionRepository) {
        this.userSubscriptionRepository = userSubscriptionRepository;
    }

    /**
     * 判断消息是否应该发送给用户
     * 
     * <p>规则：
     * 1. 紧急消息（URGENT）绕过所有订阅设置
     * 2. 用户间通信（PRIVATE）始终发送
     * 3. 系统公告始终发送
     * 4. 其他情况检查用户订阅偏好
     */
    public boolean shouldSend(Message message, Long userId, ChannelType channel) {
        // 紧急消息绕过
        if (message.getPriority() == MessagePriority.URGENT) {
            return true;
        }

        // 用户间通信始终发送
        if (message.getMessageType() == com.workflow.notification.model.MessageType.PRIVATE) {
            return true;
        }

        // 系统公告始终发送
        if (message.getCategory() == com.workflow.notification.model.MessageCategory.SYSTEM) {
            return true;
        }

        // 检查用户订阅偏好
        UserSubscription subscription = userSubscriptionRepository
                .findByTenantIdAndUserIdAndChannel(message.getTenantId(), userId, channel);

        // 默认订阅，无记录时发送
        if (subscription == null) {
            return true;
        }

        return subscription.getSubscribed();
    }

    /**
     * 获取用户订阅偏好
     */
    public List<UserSubscription> getUserPreferences(Long tenantId, Long userId) {
        return userSubscriptionRepository.findByTenantIdAndUserId(tenantId, userId);
    }

    /**
     * 更新用户订阅偏好
     */
    public void updatePreference(Long tenantId, Long userId, ChannelType channel, boolean subscribed) {
        UserSubscription existing = userSubscriptionRepository
                .findByTenantIdAndUserIdAndChannel(tenantId, userId, channel);

        if (existing == null) {
            existing = new UserSubscription();
            existing.setTenantId(tenantId);
            existing.setUserId(userId);
            existing.setUsername("user_" + userId);
            existing.setChannel(channel);
        }
        existing.setSubscribed(subscribed);
        userSubscriptionRepository.save(existing);
    }
}
