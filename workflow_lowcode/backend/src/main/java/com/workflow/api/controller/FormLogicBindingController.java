package com.workflow.api.controller;

import com.workflow.common.domain.R;
import com.workflow.engine.logicflow.entity.FormLogicBinding;
import com.workflow.engine.logicflow.service.FormLogicBindingService;
import com.workflow.engine.tenant.TenantProvider;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 表单 × 逻辑编排绑定管理接口。
 *
 * <p>绑定声明「某表单在某个触发点自动运行某条已发布逻辑流」：
 * 业务表单（BUSINESS）支持增删改前后六类触发点，审批表单（WORKFLOW）支持快照保存后触发。
 */
@RestController
@RequestMapping("/api/v1/form-logic-bindings")
public class FormLogicBindingController {

    /** 创建/更新请求体。 */
    public record SaveReq(String formType, String formKey, String triggerType, String flowKey,
                          String executionMode, Boolean enabled, String description) {
    }

    /** 绑定视图（含触发点/模式明文，前端直接渲染）。 */
    public record BindingVO(String id, String formType, String formKey, String triggerType,
                            String flowKey, String executionMode, Boolean enabled,
                            String description, String createdAt) {
    }

    private final FormLogicBindingService service;
    private final TenantProvider tenantProvider;

    public FormLogicBindingController(FormLogicBindingService service, TenantProvider tenantProvider) {
        this.service = service;
        this.tenantProvider = tenantProvider;
    }

    /** 某表单全部绑定。 */
    @GetMapping
    public R<List<BindingVO>> list(@RequestParam String formType, @RequestParam String formKey) {
        List<BindingVO> vos = service.list(tenantProvider.getTenantId(), formType, formKey).stream()
                .map(FormLogicBindingController::toVO)
                .toList();
        return R.ok(vos);
    }

    /** 创建绑定。 */
    @PostMapping
    public R<BindingVO> create(@RequestBody SaveReq req) {
        FormLogicBinding binding = service.create(tenantProvider.getTenantId(),
                req.formType(), req.formKey(), req.triggerType(), req.flowKey(),
                req.executionMode(), req.enabled(), req.description());
        return R.ok(toVO(binding));
    }

    /** 更新绑定（触发点/流/模式/启停/描述；formType/formKey 不可变）。 */
    @PutMapping("/{id}")
    public R<BindingVO> update(@PathVariable String id, @RequestBody SaveReq req) {
        FormLogicBinding binding = service.update(tenantProvider.getTenantId(), id,
                req.triggerType(), req.flowKey(), req.executionMode(), req.enabled(), req.description());
        return R.ok(toVO(binding));
    }

    /** 删除绑定。 */
    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable String id) {
        service.delete(tenantProvider.getTenantId(), id);
        return R.ok(null);
    }

    private static BindingVO toVO(FormLogicBinding binding) {
        return new BindingVO(binding.getId(), binding.getFormType(), binding.getFormKey(),
                binding.getTriggerType(), binding.getFlowKey(), binding.getExecutionMode(),
                binding.getEnabled(), binding.getDescription(),
                binding.getCreatedAt() == null ? null : binding.getCreatedAt().toString());
    }
}
