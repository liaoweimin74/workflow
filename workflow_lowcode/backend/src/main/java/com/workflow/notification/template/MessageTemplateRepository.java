package com.workflow.notification.template;

import com.workflow.common.exception.BusinessException;
import com.workflow.notification.model.MessageTemplate;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import com.workflow.notification.model.ChannelType;

/**
 * 模板 Repository
 */
public interface MessageTemplateRepository extends JpaRepository<MessageTemplate, Long> {

    Optional<MessageTemplate> findByTemplateCodeAndTenantId(String templateCode, String tenantId);

    boolean existsByTemplateCodeAndTenantId(String templateCode, String tenantId);

    boolean existsByTenantIdAndEventCode(String tenantId, String eventCode);

    Optional<MessageTemplate> findByTenantIdAndEventCodeAndChannelAndEnabled(
            String tenantId, String eventCode, ChannelType channel, Boolean enabled);

    boolean existsByTenantIdAndEventCodeAndChannelAndEnabled(
            String tenantId, String eventCode, ChannelType channel, Boolean enabled);

}
