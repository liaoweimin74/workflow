package com.workflow.notification.admin;

import com.workflow.common.domain.R;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.notification.model.MessageTemplate;
import com.workflow.notification.template.TemplateService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 管理端模板 API
 * 
 * <p>当前租户从 {@link TenantProvider} 获取（String，与全系统一致），
 * 不依赖前端传递数字租户 ID
 */
@RestController
@RequestMapping("/api/v1/admin/notification/templates")
public class TemplateController {

    private final TemplateService templateService;
    private final TenantProvider tenantProvider;

    public TemplateController(TemplateService templateService, TenantProvider tenantProvider) {
        this.templateService = templateService;
        this.tenantProvider = tenantProvider;
    }

    @GetMapping
    public R<List<MessageTemplate>> list() {
        return R.ok(templateService.list(tenantProvider.getTenantId()));
    }

    @PostMapping
    public R<MessageTemplate> create(@RequestBody MessageTemplate template) {
        template.setTenantId(tenantProvider.getTenantId());
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
