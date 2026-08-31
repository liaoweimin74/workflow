package com.workflow.notification.template;

import com.workflow.common.exception.BusinessException;
import com.workflow.notification.model.MessageTemplate;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * 模板 Repository
 */
public interface MessageTemplateRepository extends JpaRepository<MessageTemplate, Long> {

    Optional<MessageTemplate> findByTemplateCodeAndTenantId(String templateCode, Long tenantId);

    boolean existsByTemplateCodeAndTenantId(String templateCode, Long tenantId);
}
