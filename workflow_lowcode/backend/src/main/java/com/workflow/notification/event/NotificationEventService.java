package com.workflow.notification.event;

import com.workflow.common.domain.PageResult;
import com.workflow.common.exception.BusinessException;
import com.workflow.notification.model.NotificationEventDefinition;
import com.workflow.notification.store.NotificationEventDefinitionRepository;
import com.workflow.notification.subscription.SubscriptionRuleRepository;
import com.workflow.notification.template.MessageTemplateRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;

/** 管理员维护的业务消息事件服务。 */
@Service
public class NotificationEventService {

    private static final String CODE_REGEX = "^[A-Z][A-Z0-9_]{0,63}$";

    private final NotificationEventDefinitionRepository repository;
    private final MessageTemplateRepository templateRepository;
    private final SubscriptionRuleRepository ruleRepository;

    public NotificationEventService(NotificationEventDefinitionRepository repository,
                                    MessageTemplateRepository templateRepository,
                                    SubscriptionRuleRepository ruleRepository) {
        this.repository = repository;
        this.templateRepository = templateRepository;
        this.ruleRepository = ruleRepository;
    }

    public PageResult<NotificationEventDefinition> list(String tenantId, int page, int size,
                                                         String keyword, Boolean enabled) {
        int normalizedPage = Math.max(page, 1);
        int normalizedSize = Math.max(size, 1);
        PageRequest request = PageRequest.of(normalizedPage - 1, normalizedSize,
                Sort.by(Sort.Direction.DESC, "createdAt"));
        Specification<NotificationEventDefinition> specification = (root, query, cb) -> {
            var predicates = new java.util.ArrayList<jakarta.persistence.criteria.Predicate>();
            predicates.add(cb.equal(root.get("tenantId"), tenantId));
            if (enabled != null) predicates.add(cb.equal(root.get("enabled"), enabled));
            if (keyword != null && !keyword.isBlank()) {
                String pattern = "%" + keyword.trim() + "%";
                predicates.add(cb.or(cb.like(root.get("eventCode"), pattern),
                        cb.like(root.get("eventName"), pattern)));
            }
            return cb.and(predicates.toArray(new jakarta.persistence.criteria.Predicate[0]));
        };
        var result = repository.findAll(specification, request);
        return new PageResult<>(result.getTotalElements(), normalizedPage, normalizedSize, result.getContent());
    }

    @Transactional
    public NotificationEventDefinition create(String tenantId, String operator, String eventCode,
                                              String eventName, String description, String businessDomain) {
        validateCode(eventCode);
        if (eventName == null || eventName.isBlank()) throw new BusinessException("事件名称不能为空");
        if (repository.existsByTenantIdAndEventCode(tenantId, eventCode)) {
            throw new BusinessException(409, "事件代码已存在: " + eventCode);
        }
        NotificationEventDefinition event = new NotificationEventDefinition();
        event.setTenantId(tenantId);
        event.setEventCode(eventCode);
        event.setEventName(eventName);
        event.setDescription(description);
        event.setBusinessDomain(businessDomain);
        event.setEnabled(true);
        event.setCreatedBy(operator);
        event.setUpdatedBy(operator);
        return repository.save(event);
    }

    @Transactional
    public NotificationEventDefinition update(String tenantId, Long id, String operator,
                                              String eventName, String description, String businessDomain) {
        NotificationEventDefinition event = repository.findById(id)
                .filter(e -> tenantId.equals(e.getTenantId()))
                .orElseThrow(() -> new BusinessException(404, "事件不存在: " + id));
        if (eventName == null || eventName.isBlank()) throw new BusinessException("事件名称不能为空");
        event.setEventName(eventName);
        event.setDescription(description);
        event.setBusinessDomain(businessDomain);
        event.setUpdatedBy(operator);
        return repository.save(event);
    }

    @Transactional
    public void delete(String tenantId, Long id) {
        NotificationEventDefinition event = repository.findById(id)
                .filter(e -> tenantId.equals(e.getTenantId()))
                .orElseThrow(() -> new BusinessException(404, "事件不存在: " + id));
        if (templateRepository.existsByTenantIdAndEventCode(tenantId, event.getEventCode())
                || ruleRepository.existsByTenantIdAndEventCode(tenantId, event.getEventCode())) {
            throw new BusinessException(409, "事件已被模板或订阅规则引用，不能删除");
        }
        repository.delete(event);
    }

    @Transactional
    public void toggle(String tenantId, Long id, String operator) {
        NotificationEventDefinition event = repository.findById(id)
                .filter(e -> tenantId.equals(e.getTenantId()))
                .orElseThrow(() -> new BusinessException(404, "事件不存在: " + id));
        event.setEnabled(!Boolean.TRUE.equals(event.getEnabled()));
        event.setUpdatedBy(operator);
        repository.save(event);
    }

    public NotificationEventDefinition requireEnabled(String tenantId, String eventCode) {
        return repository.findByTenantIdAndEventCode(tenantId, eventCode)
                .filter(e -> Boolean.TRUE.equals(e.getEnabled()))
                .orElseThrow(() -> new BusinessException(400, "事件不存在或已停用: " + eventCode));
    }

    private void validateCode(String code) {
        if (code == null || !code.matches(CODE_REGEX)) {
            throw new BusinessException(400, "事件代码必须为大写字母、数字和下划线，且首字符为大写字母");
        }
    }
}
