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

    /**
     * 草稿箱列表（Task 130f 对齐 Node listDraftsByUser）：当前用户的全部
     * 发起页草稿（processInstanceId IS NULL、非快照、本人创建），按更新时间倒序。
     */
    @org.springframework.data.jpa.repository.Query(
            "SELECT d FROM FormData d WHERE d.tenantId = :tenantId " +
            "AND d.processInstanceId IS NULL AND d.isSnapshot = false " +
            "AND d.createdBy = :createdBy ORDER BY d.updatedAt DESC")
    List<FormData> listMyDrafts(@org.springframework.data.repository.query.Param("tenantId") String tenantId,
                                @org.springframework.data.repository.query.Param("createdBy") String createdBy);

    /** 表单字段发现采样：某表单定义最近 N 条非快照数据（只取结构，按更新时间倒序）。 */
    List<FormData> findTop10ByTenantIdAndFormDefIdAndIsSnapshotOrderByUpdatedAtDesc(
            String tenantId, String formDefId, Boolean isSnapshot);
}
