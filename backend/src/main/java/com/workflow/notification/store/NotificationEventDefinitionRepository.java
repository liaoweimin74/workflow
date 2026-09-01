package com.workflow.notification.store;

import com.workflow.notification.model.NotificationEventDefinition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Optional;

/**
 * 业务消息事件定义 Repository。
 */
public interface NotificationEventDefinitionRepository
        extends JpaRepository<NotificationEventDefinition, Long>, JpaSpecificationExecutor<NotificationEventDefinition> {

    Optional<NotificationEventDefinition> findByTenantIdAndEventCode(String tenantId, String eventCode);

    boolean existsByTenantIdAndEventCode(String tenantId, String eventCode);

    Page<NotificationEventDefinition> findByTenantId(String tenantId, Pageable pageable);

    Page<NotificationEventDefinition> findByTenantIdAndEnabled(String tenantId, Boolean enabled, Pageable pageable);
}
