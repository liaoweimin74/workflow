package com.workflow.engine.process.repository;

import com.workflow.engine.process.entity.NodeConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface NodeConfigRepository extends JpaRepository<NodeConfig, String> {

    List<NodeConfig> findByProcessDefId(String processDefId);

    @Transactional
    void deleteByProcessDefId(String processDefId);
}
