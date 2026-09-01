package com.workflow.notification.admin;

import com.workflow.common.domain.R;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.notification.model.ChannelType;
import com.workflow.notification.model.MessagePriority;
import com.workflow.notification.model.SubscriptionRule;
import com.workflow.notification.subscription.SubscriptionRuleRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import jakarta.persistence.criteria.Predicate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 管理端订阅规则 API（对应 {@code msg_subscription_rule} 表）。
 *
 * <p>支持订阅场景规则的增删改查与按事件代码过滤，供管理端订阅规则页面（/admin/notification/subscriptions）
 * 使用。规则以「事件代码 × 渠道 × 优先级 × 启用」组织，条件表达式描述适用范围。
 */
@RestController
@RequestMapping("/api/v1/admin/notification/subscriptions")
public class SubscriptionController {

    private final SubscriptionRuleRepository repository;

    public SubscriptionController(SubscriptionRuleRepository repository) {
        this.repository = repository;
    }

    /**
     * 订阅规则列表（可按事件代码模糊过滤，按创建时间倒序）
     */
    @GetMapping
    public R<Map<String, Object>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String eventCode) {

        PageRequest pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Specification<SubscriptionRule> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (eventCode != null && !eventCode.isBlank()) {
                predicates.add(cb.like(root.get("eventCode"), "%" + eventCode.trim() + "%"));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
        Page<SubscriptionRule> rules = repository.findAll(spec, pageable);

        List<Map<String, Object>> rows = new ArrayList<>();
        for (SubscriptionRule r : rules.getContent()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", r.getId());
            row.put("eventCode", r.getEventCode());
            row.put("channel", r.getChannel());
            row.put("priority", r.getPriority());
            row.put("enable", r.getEnable());
            row.put("condition", r.getConditionExpr());
            row.put("createdBy", r.getCreatedBy());
            row.put("createdAt", r.getCreatedAt());
            rows.add(row);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", rows);
        result.put("total", rules.getTotalElements());
        return R.ok(result);
    }

    /**
     * 创建订阅规则
     */
    @PostMapping
    public R<Void> create(@RequestBody Map<String, Object> rule) {
        SubscriptionRule entity = new SubscriptionRule();
        entity.setTenantId("default");
        entity.setCreatedBy(currentUsername());
        applyFields(entity, rule);
        repository.save(entity);
        return R.ok();
    }

    /**
     * 更新订阅规则
     */
    @PutMapping("/{id}")
    public R<Void> update(@PathVariable Long id, @RequestBody Map<String, Object> rule) {
        SubscriptionRule entity = repository.findById(id)
                .orElseThrow(() -> new com.workflow.common.exception.BusinessException("订阅规则不存在: " + id));
        applyFields(entity, rule);
        repository.save(entity);
        return R.ok();
    }

    private void applyFields(SubscriptionRule entity, Map<String, Object> rule) {
        if (rule.get("eventCode") != null) {
            entity.setEventCode(String.valueOf(rule.get("eventCode")));
        }
        if (rule.get("channel") != null) {
            entity.setChannel(ChannelType.valueOf(String.valueOf(rule.get("channel"))));
        }
        if (rule.get("priority") != null) {
            entity.setPriority(MessagePriority.valueOf(String.valueOf(rule.get("priority"))));
        }
        if (rule.get("enable") != null) {
            entity.setEnable(Boolean.valueOf(String.valueOf(rule.get("enable"))));
        }
        if (rule.get("condition") != null) {
            entity.setConditionExpr(String.valueOf(rule.get("condition")));
        } else if (rule.get("conditionExpr") != null) {
            entity.setConditionExpr(String.valueOf(rule.get("conditionExpr")));
        }
    }

    private String currentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof LoginUser loginUser) {
            return loginUser.getUsername();
        }
        return "system";
    }
}
