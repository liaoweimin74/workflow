package com.workflow.notification.subscription;

import com.workflow.notification.model.ChannelType;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.MessagePriority;
import com.workflow.notification.model.UserSubscription;
import com.workflow.notification.model.SubscriptionRule;
import com.workflow.notification.model.SubscriptionRuleAction;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;

/**
 * 订阅服务
 */
@Service
public class SubscriptionService {

    private final SubscriptionRuleRepository subscriptionRuleRepository;

    public SubscriptionService(SubscriptionRuleRepository subscriptionRuleRepository) {
        this.subscriptionRuleRepository = subscriptionRuleRepository;
    }

    /**
     * 判断消息是否应该发送给用户
     * 
     * <p>规则：
     * 1. FORCE 规则允许投递
     * 2. DENY 规则禁止投递
     * 3. ALLOW 规则允许投递
     * 4. 没有规则时默认允许
     */
    public boolean shouldSend(Message message, Long userId, ChannelType channel) {
        if (subscriptionRuleRepository != null && message.getEventCode() != null
                && message.getPriority() != null) {
            SubscriptionRule rule = subscriptionRuleRepository
                    .findByTenantIdAndEventCodeAndChannelAndPriorityAndEnableTrue(
                            message.getTenantId(), message.getEventCode(), channel, message.getPriority())
                    .orElse(null);
            if (rule != null) {
                SubscriptionRuleAction action = rule.getAction() == null
                        ? SubscriptionRuleAction.ALLOW : rule.getAction();
                if (action == SubscriptionRuleAction.FORCE) return true;
                if (action == SubscriptionRuleAction.DENY) return false;
                if (action == SubscriptionRuleAction.ALLOW) return true;
            }
        }
        return true;
    }
}
