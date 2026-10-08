package com.workflow.engine.logicflow.repository;

import com.workflow.engine.logicflow.entity.LogicFlowRun;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface LogicFlowRunRepository extends JpaRepository<LogicFlowRun, String> {

    /** 运行历史：按开始时间倒序取前 N 条（limit 由调用方经 Pageable 控制，默认 20 上限 100）。 */
    List<LogicFlowRun> findByFlowIdOrderByStartedAtDesc(String flowId, Pageable pageable);

    /** 删除编排时清理其运行历史（须在事务内调用）。 */
    @Modifying
    @Transactional
    void deleteByFlowId(String flowId);
}
