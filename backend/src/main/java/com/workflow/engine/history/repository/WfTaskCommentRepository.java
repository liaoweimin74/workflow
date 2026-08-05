package com.workflow.engine.history.repository;

import com.workflow.engine.history.entity.WfTaskComment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

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
}
