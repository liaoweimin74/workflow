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
     * 保存或更新当前表单数据（非快照，用于节点间传递）。
     * 同一 processInstanceId + formDefId 只保留一条当前数据。
     *
     * @param formDefId          表单定义 ID
     * @param processInstanceId  流程实例 ID
     * @param taskId             任务 ID（可选）
     * @param dataJson           表单数据 JSON
     * @return 创建或更新的表单数据记录
     */
    @Transactional
    public FormData save(String formDefId, String processInstanceId, String taskId, String dataJson) {
        String tenantId = tenantProvider.getTenantId();

        // 获取表单定义的当前版本作为快照
        FormDefinition formDef = formDefRepository.findByIdAndTenantId(formDefId, tenantId)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + formDefId));

        // 查找是否已有当前数据，有则更新，无则创建
        Optional<FormData> existing = formDataRepository
                .findByTenantIdAndProcessInstanceIdAndFormDefIdAndIsSnapshot(
                        tenantId, processInstanceId, formDefId, false);

        FormData formData;
        if (existing.isPresent()) {
            formData = existing.get();
            formData.setDataJson(dataJson);
            formData.setTaskId(taskId);
            formData.setFormVersion(formDef.getVersion());
        } else {
            formData = new FormData();
            formData.setId(UUID.randomUUID().toString().replace("-", ""));
            formData.setTenantId(tenantId);
            formData.setFormDefId(formDefId);
            formData.setFormVersion(formDef.getVersion());
            formData.setProcessInstanceId(processInstanceId);
            formData.setTaskId(taskId);
            formData.setDataJson(dataJson);
            formData.setIsSnapshot(false);
        }

        return formDataRepository.save(formData);
    }

    /**
     * 保存任务审批时的表单快照（每次创建新记录，不可变）。
     *
     * @param formDefId          表单定义 ID
     * @param processInstanceId  流程实例 ID
     * @param taskId             任务 ID
     * @param dataJson           表单数据 JSON
     * @return 创建的快照记录
     */
    @Transactional
    public FormData saveSnapshot(String formDefId, String processInstanceId, String taskId, String dataJson) {
        String tenantId = tenantProvider.getTenantId();

        FormDefinition formDef = formDefRepository.findByIdAndTenantId(formDefId, tenantId)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + formDefId));

        FormData snapshot = new FormData();
        snapshot.setId(UUID.randomUUID().toString().replace("-", ""));
        snapshot.setTenantId(tenantId);
        snapshot.setFormDefId(formDefId);
        snapshot.setFormVersion(formDef.getVersion());
        snapshot.setProcessInstanceId(processInstanceId);
        snapshot.setTaskId(taskId);
        snapshot.setDataJson(dataJson);
        snapshot.setIsSnapshot(true);

        return formDataRepository.save(snapshot);
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
     * 按流程实例和表单定义查询当前表单数据（非快照）。
     */
    public Optional<FormData> findByProcessInstance(String processInstanceId, String formDefId) {
        String tenantId = tenantProvider.getTenantId();
        return formDataRepository
                .findByTenantIdAndProcessInstanceIdAndFormDefIdAndIsSnapshot(
                        tenantId, processInstanceId, formDefId, false);
    }

    /**
     * 按 taskId 查询审批快照。
     */
    public Optional<FormData> findByTaskId(String taskId) {
        String tenantId = tenantProvider.getTenantId();
        return formDataRepository
                .findByTenantIdAndTaskIdAndIsSnapshotOrderByCreatedAtDesc(tenantId, taskId, true)
                .stream()
                .findFirst();
    }

    /**
     * 按流程实例查询所有表单数据（含快照）。
     */
    public List<FormData> findByProcessInstance(String processInstanceId) {
        String tenantId = tenantProvider.getTenantId();
        return formDataRepository
                .findByTenantIdAndProcessInstanceId(tenantId, processInstanceId);
    }

    /**
     * 按流程实例查询所有审批快照（按时间倒序）。
     */
    public List<FormData> findSnapshotsByProcessInstance(String processInstanceId) {
        String tenantId = tenantProvider.getTenantId();
        return formDataRepository
                .findByTenantIdAndProcessInstanceIdAndIsSnapshotOrderByCreatedAtDesc(
                        tenantId, processInstanceId, true);
    }

    /**
     * 更新当前表单数据（非快照）。
     */
    @Transactional
    public FormData update(String id, String dataJson) {
        String tenantId = tenantProvider.getTenantId();
        FormData formData = formDataRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Form data not found: " + id));

        formData.setDataJson(dataJson);

        return formDataRepository.save(formData);
    }

    /**
     * 保存发起页草稿（processInstanceId 为 null 的表单数据）。
     * 同一 formDefId 只保留一条草稿，再次保存为更新。
     *
     * @param formDefId 表单定义 ID
     * @param dataJson  表单数据 JSON
     * @return 保存的草稿记录
     */
    @Transactional
    public FormData saveDraft(String formDefId, String dataJson) {
        String tenantId = tenantProvider.getTenantId();

        FormDefinition formDef = formDefRepository.findByIdAndTenantId(formDefId, tenantId)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + formDefId));

        Optional<FormData> existing = formDataRepository
                .findByTenantIdAndFormDefIdAndProcessInstanceIdIsNullAndIsSnapshot(tenantId, formDefId, false);

        FormData formData;
        if (existing.isPresent()) {
            formData = existing.get();
            formData.setDataJson(dataJson);
            formData.setFormVersion(formDef.getVersion());
        } else {
            formData = new FormData();
            formData.setId(UUID.randomUUID().toString().replace("-", ""));
            formData.setTenantId(tenantId);
            formData.setFormDefId(formDefId);
            formData.setFormVersion(formDef.getVersion());
            formData.setProcessInstanceId(null);
            formData.setTaskId(null);
            formData.setDataJson(dataJson);
            formData.setIsSnapshot(false);
        }

        return formDataRepository.save(formData);
    }

    /**
     * 查询发起页草稿。
     *
     * @param formDefId 表单定义 ID
     * @return 草稿记录，无草稿返回 empty
     */
    public Optional<FormData> findDraft(String formDefId) {
        String tenantId = tenantProvider.getTenantId();
        return formDataRepository
                .findByTenantIdAndFormDefIdAndProcessInstanceIdIsNullAndIsSnapshot(tenantId, formDefId, false);
    }

    /**
     * 清除发起页草稿（发起成功后调用）。
     *
     * @param formDefId 表单定义 ID
     */
    @Transactional
    public void clearDraft(String formDefId) {
        String tenantId = tenantProvider.getTenantId();
        formDataRepository
                .findByTenantIdAndFormDefIdAndProcessInstanceIdIsNullAndIsSnapshot(tenantId, formDefId, false)
                .ifPresent(formDataRepository::delete);
    }
}
