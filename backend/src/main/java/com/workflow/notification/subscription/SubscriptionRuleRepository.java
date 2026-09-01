package com.workflow.notification.subscription;

import com.workflow.notification.model.SubscriptionRule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

/**
 * 订阅规则 Repository（对应 {@code msg_subscription_rule} 表）。
 *
 * <p>继承 {@link JpaSpecificationExecutor} 以支持列表页按事件代码等条件动态过滤。
 */
public interface SubscriptionRuleRepository
        extends JpaRepository<SubscriptionRule, Long>, JpaSpecificationExecutor<SubscriptionRule> {
}
