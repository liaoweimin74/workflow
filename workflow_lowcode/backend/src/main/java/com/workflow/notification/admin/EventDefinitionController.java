package com.workflow.notification.admin;

import com.workflow.common.domain.PageResult;
import com.workflow.common.domain.R;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.notification.event.NotificationEventService;
import com.workflow.notification.model.NotificationEventDefinition;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** 消息业务事件管理 API。 */
@RestController
@RequestMapping("/api/v1/admin/notification/events")
public class EventDefinitionController {

    private final NotificationEventService service;
    private final TenantProvider tenantProvider;

    public EventDefinitionController(NotificationEventService service, TenantProvider tenantProvider) {
        this.service = service;
        this.tenantProvider = tenantProvider;
    }

    @GetMapping
    public R<PageResult<NotificationEventDefinition>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Boolean enabled) {
        NotificationAdminAuthorization.requireAdmin();
        return R.ok(service.list(tenantProvider.getTenantId(), page, size, keyword, enabled));
    }

    @PostMapping
    public R<NotificationEventDefinition> create(@RequestBody Map<String, String> body) {
        NotificationAdminAuthorization.requireAdmin();
        return R.ok(service.create(tenantProvider.getTenantId(), operator(), body.get("eventCode"),
                body.get("eventName"), body.get("description"), body.get("businessDomain")));
    }

    @PutMapping("/{id}")
    public R<NotificationEventDefinition> update(@PathVariable Long id, @RequestBody Map<String, String> body) {
        NotificationAdminAuthorization.requireAdmin();
        return R.ok(service.update(tenantProvider.getTenantId(), id, operator(), body.get("eventName"),
                body.get("description"), body.get("businessDomain")));
    }

    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        NotificationAdminAuthorization.requireAdmin();
        service.delete(tenantProvider.getTenantId(), id);
        return R.ok();
    }

    @PostMapping("/{id}/toggle")
    public R<Void> toggle(@PathVariable Long id) {
        NotificationAdminAuthorization.requireAdmin();
        service.toggle(tenantProvider.getTenantId(), id, operator());
        return R.ok();
    }

    private String operator() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof LoginUser user) return user.getUsername();
        return "system";
    }
}
