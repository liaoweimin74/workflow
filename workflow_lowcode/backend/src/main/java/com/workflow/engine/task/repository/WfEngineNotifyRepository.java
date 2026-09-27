package com.workflow.engine.task.repository;

import com.workflow.engine.task.entity.WfEngineNotify;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 引擎外发通知记录 Repository。
 */
public interface WfEngineNotifyRepository extends JpaRepository<WfEngineNotify, String> {

    /**
     * 该任务是否已有指定类型的通知记录（超时调度幂等标记用）。
     */
    boolean existsByTaskIdAndNotifyType(String taskId, String notifyType);
}
