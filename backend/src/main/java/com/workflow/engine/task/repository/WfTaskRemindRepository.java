package com.workflow.engine.task.repository;

import com.workflow.engine.task.entity.WfTaskRemind;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

/**
 * 任务催办记录 Repository。
 */
public interface WfTaskRemindRepository extends JpaRepository<WfTaskRemind, String> {

    /**
     * 按任务 ID 查询催办记录，按催办时间倒序排列（最新在前）。
     */
    List<WfTaskRemind> findByTaskIdOrderByRemindTimeDesc(String taskId);

    /**
     * 按任务 ID 查询催办记录列表。
     */
    List<WfTaskRemind> findByTaskId(String taskId);

    /**
     * 按任务 ID 集合批量查询催办记录（避免 N+1）。
     */
    List<WfTaskRemind> findByTaskIdIn(Collection<String> taskIds);
}
