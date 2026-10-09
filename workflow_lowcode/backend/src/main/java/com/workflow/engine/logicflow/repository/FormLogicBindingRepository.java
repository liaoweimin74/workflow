package com.workflow.engine.logicflow.repository;

import com.workflow.engine.logicflow.entity.FormLogicBinding;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FormLogicBindingRepository extends JpaRepository<FormLogicBinding, String> {

    /** 某表单全部绑定（绑定管理页展示，创建时间升序）。 */
    List<FormLogicBinding> findByTenantIdAndFormTypeAndFormKeyOrderByCreatedAtAsc(
            String tenantId, String formType, String formKey);

    /** 某触发点的启用绑定（调度入口，创建时间升序 = 执行顺序）。 */
    List<FormLogicBinding> findByTenantIdAndFormTypeAndFormKeyAndTriggerTypeAndEnabledTrueOrderByCreatedAtAsc(
            String tenantId, String formType, String formKey, String triggerType);

    /** 唯一性校验：同租户同表单同触发点同流只允许一条。 */
    boolean existsByTenantIdAndFormTypeAndFormKeyAndTriggerTypeAndFlowKey(
            String tenantId, String formType, String formKey, String triggerType, String flowKey);

    /** 某逻辑流全部启用绑定（设计期表单字段发现，创建时间升序）。 */
    List<FormLogicBinding> findByTenantIdAndFlowKeyAndEnabledTrueOrderByCreatedAtAsc(
            String tenantId, String flowKey);
}
