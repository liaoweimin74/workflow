package com.workflow.engine.task.repository;

import com.workflow.engine.task.entity.WfTaskTransfer;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface WfTaskTransferRepository extends JpaRepository<WfTaskTransfer, String> {

    List<WfTaskTransfer> findByTaskId(String taskId);

    List<WfTaskTransfer> findByProcessInstanceId(String processInstanceId);
}
