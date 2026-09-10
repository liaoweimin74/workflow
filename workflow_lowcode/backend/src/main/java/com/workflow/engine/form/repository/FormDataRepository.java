package com.workflow.engine.form.repository;

import com.workflow.engine.form.entity.FormData;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FormDataRepository extends JpaRepository<FormData, String> {

    Optional<FormData> findByIdAndTenantId(String id, String tenantId);

    /** 查询流程实例下指定表单的当前数据（非快照）。 */
    Optional<FormData> findByTenantIdAndProcessInstanceIdAndFormDefIdAndIsSnapshot(
            String tenantId, String processInstanceId, String formDefId, Boolean isSnapshot);

    /** 按 taskId 查询快照（可能多条，取最新）。 */
    List<FormData> findByTenantIdAndTaskIdAndIsSnapshotOrderByCreatedAtDesc(
            String tenantId, String taskId, Boolean isSnapshot);

    /** 查询发起页草稿（processInstanceId IS NULL，非快照）。 */
    Optional<FormData> findByTenantIdAndFormDefIdAndProcessInstanceIdIsNullAndIsSnapshot(
            String tenantId, String formDefId, Boolean isSnapshot);

    List<FormData> findByTenantIdAndProcessInstanceId(String tenantId, String processInstanceId);

    List<FormData> findByTenantIdAndProcessInstanceIdAndIsSnapshotOrderByCreatedAtDesc(
            String tenantId, String processInstanceId, Boolean isSnapshot);
}
