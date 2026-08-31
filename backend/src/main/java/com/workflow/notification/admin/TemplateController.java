package com.workflow.notification.admin;

import com.workflow.common.domain.PageResult;
import com.workflow.common.domain.R;
import com.workflow.notification.model.MessageTemplate;
import com.workflow.notification.template.TemplateService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 管理端模板 API
 */
@RestController
@RequestMapping("/api/v1/admin/notification/templates")
@PreAuthorize("hasAnyRole('ADMIN', 'NOTIFICATION_MANAGER')")
public class TemplateController {

    private final TemplateService templateService;

    public TemplateController(TemplateService templateService) {
        this.templateService = templateService;
    }

    @GetMapping
    public R<List<MessageTemplate>> list(@RequestHeader("X-Tenant-Id") Long tenantId) {
        return R.ok(templateService.list(tenantId));
    }

    @PostMapping
    public R<MessageTemplate> create(@RequestHeader("X-Tenant-Id") Long tenantId,
                                     @RequestBody MessageTemplate template) {
        template.setTenantId(tenantId);
        return R.ok(templateService.create(template));
    }

    @PutMapping("/{id}")
    public R<MessageTemplate> update(@PathVariable Long id,
                                     @RequestBody MessageTemplate template) {
        return R.ok(templateService.update(id, template));
    }

    @PostMapping("/{id}/toggle")
    public R<Void> toggle(@PathVariable Long id) {
        templateService.toggle(id);
        return R.ok();
    }
}
