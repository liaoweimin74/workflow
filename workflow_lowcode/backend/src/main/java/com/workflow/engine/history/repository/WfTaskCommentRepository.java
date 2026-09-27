package com.workflow.engine.history.repository;

import com.workflow.engine.history.entity.WfTaskComment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * 任务审批意见 Repository。
 */
public interface WfTaskCommentRepository extends JpaRepository<WfTaskComment, String> {

    /**
     * 按任务 ID 查询审批意见列表。
     */
    List<WfTaskComment> findByTaskId(String taskId);

    /**
     * 按流程实例 ID 查询审批意见列表。
     */
    List<WfTaskComment> findByProcessInstanceId(String processInstanceId);

    /**
     * 按流程实例 ID 查询，按创建时间正序排列。
     */
    List<WfTaskComment> findByProcessInstanceIdOrderByCreatedAtAsc(String processInstanceId);

    /**
     * 按操作人 ID 查询审批意见列表。
     */
    List<WfTaskComment> findByUserId(String userId);

    /**
     * 查用户最近一条带手写签名的通过意见
     * （signature.useLast=true 时 getTaskDetail 回填用；V41 signature 列）。
     */
    Optional<WfTaskComment> findFirstByTenantIdAndUserIdAndActionAndSignatureIsNotNullOrderByCreatedAtDesc(
            String tenantId, String userId, String action);

    /**
     * 查用户最近一条带手写签名的通过意见（不限租户，租户过滤由调用方保证时使用）。
     */
    Optional<WfTaskComment> findFirstByUserIdAndActionAndSignatureIsNotNullOrderByCreatedAtDesc(
            String userId, String action);
}
