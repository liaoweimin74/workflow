package com.workflow.engine.form;

import com.workflow.engine.form.entity.FormData;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDataRepository;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * 表单实例数据服务。
 * 管理流程实例关联的表单数据的保存和查询。
 *
 * 版本快照：保存时记录当前表单定义的版本号（form_version），
 * 保证旧数据与旧 schema 对应。
 */
@Service
public class FormDataService {

    private final FormDataRepository formDataRepository;
    private final FormDefinitionRepository formDefRepository;
    private final TenantProvider tenantProvider;

    public FormDataService(FormDataRepository formDataRepository,
                           FormDefinitionRepository formDefRepository,
                           TenantProvider tenantProvider) {
        this.formDataRepository = formDataRepository;
        this.formDefRepository = formDefRepository;
        this.tenantProvider = tenantProvider;
    }

    /**
     * 保存表单数据。
     * 记录当前表单定义的版本快照。
     *
     * @param formDefId          表单定义 ID
     * @param processInstanceId  流程实例 ID
     * @param taskId             任务 ID（可选）
     * @param dataJson           表单数据 JSON
     * @return 创建的表单数据记录
     */
    @Transactional
    public FormData save(String formDefId, String processInstanceId, String taskId, String dataJson) {
        String tenantId = tenantProvider.getTenantId();

        // 获取表单定义的当前版本作为快照
        FormDefinition formDef = formDefRepository.findByIdAndTenantId(formDefId, tenantId)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + formDefId));

        FormData formData = new FormData();
        formData.setId(UUID.randomUUID().toString().replace("-", ""));
        formData.setTenantId(tenantId);
        formData.setFormDefId(formDefId);
        formData.setFormVersion(formDef.getVersion());
        formData.setProcessInstanceId(processInstanceId);
        formData.setTaskId(taskId);
        formData.setDataJson(dataJson);

        return formDataRepository.save(formData);
    }

    /**
     * 获取单条表单数据。
     */
    public FormData getById(String id) {
        String tenantId = tenantProvider.getTenantId();
        return formDataRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Form data not found: " + id));
    }

    /**
     * 按流程实例和表单定义查询表单数据。
     */
    public Optional<FormData> findByProcessInstance(String processInstanceId, String formDefId) {
        String tenantId = tenantProvider.getTenantId();
        return formDataRepository.findByTenantIdAndProcessInstanceIdAndFormDefId(tenantId, processInstanceId, formDefId);
    }

    /**
     * 按流程实例查询所有表单数据。
     */
    public List<FormData> findByProcessInstance(String processInstanceId) {
        String tenantId = tenantProvider.getTenantId();
        return formDataRepository.findByTenantIdAndProcessInstanceId(tenantId, processInstanceId);
    }

    /**
     * 更新表单数据。
     */
    @Transactional
    public FormData update(String id, String dataJson) {
        String tenantId = tenantProvider.getTenantId();
        FormData formData = formDataRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Form data not found: " + id));

        formData.setDataJson(dataJson);

        return formDataRepository.save(formData);
    }
}
