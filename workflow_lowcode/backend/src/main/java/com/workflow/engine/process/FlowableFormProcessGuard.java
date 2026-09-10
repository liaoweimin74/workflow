package com.workflow.engine.process;

import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.FormDefinitionService;
import com.workflow.engine.form.bizdata.FormProcessGuard;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.HistoryService;
import org.flowable.engine.RuntimeService;
import org.springframework.stereotype.Service;

/**
 * 基于 flowable 流程实例的守卫实现。
 * appliesTo 依表单 process_key 绑定判定；更新拒绝存在运行中实例的数据；删除拒绝存在任意关联实例（含已结束）的数据。
 */
@Service
public class FlowableFormProcessGuard implements FormProcessGuard {

    private final RuntimeService runtimeService;
    private final HistoryService historyService;
    private final FormDefinitionService formDefService;
    private final TenantProvider tenantProvider;

    public FlowableFormProcessGuard(RuntimeService runtimeService,
                                    HistoryService historyService,
                                    FormDefinitionService formDefService,
                                    TenantProvider tenantProvider) {
        this.runtimeService = runtimeService;
        this.historyService = historyService;
        this.formDefService = formDefService;
        this.tenantProvider = tenantProvider;
    }

    @Override
    public boolean appliesTo(String formKey) {
        FormDefinition def = formDefService.getByKey(formKey);
        return def != null && def.getProcessKey() != null && !def.getProcessKey().isBlank();
    }

    @Override
    public void checkBeforeUpdate(String formKey, String id) {
        String tenantId = tenantProvider.getTenantId();
        boolean running = runtimeService.createProcessInstanceQuery()
                .processInstanceTenantId(tenantId)
                .processInstanceBusinessKey(id)
                .active()
                .count() > 0;
        if (running) {
            throw new BusinessException(409, "该数据存在运行中的流程实例，禁止修改");
        }
    }

    @Override
    public void checkBeforeDelete(String formKey, String id) {
        String tenantId = tenantProvider.getTenantId();
        boolean referenced = historyService.createHistoricProcessInstanceQuery()
                .processInstanceTenantId(tenantId)
                .processInstanceBusinessKey(id)
                .count() > 0;
        if (referenced) {
            throw new BusinessException(409, "该数据存在关联流程实例，禁止删除");
        }
    }
}