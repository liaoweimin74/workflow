package com.workflow.notification.subscription;

import com.workflow.notification.model.ChannelType;
import com.workflow.notification.model.UserSubscription;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * 用户订阅 Repository
 */
public interface UserSubscriptionRepository extends JpaRepository<UserSubscription, Long> {

    UserSubscription findByTenantIdAndUserIdAndChannel(Long tenantId, Long userId, ChannelType channel);

    List<UserSubscription> findByTenantIdAndUserId(Long tenantId, Long userId);
}
