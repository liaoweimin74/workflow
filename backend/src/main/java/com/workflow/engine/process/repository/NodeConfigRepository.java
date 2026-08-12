package com.workflow.engine.process.repository;

import com.workflow.engine.process.entity.NodeConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

public interface NodeConfigRepository extends JpaRepository<NodeConfig, String> {

    List<NodeConfig> findByProcessDefId(String processDefId);

    /** 按流程草稿 + 部署版本查询配置快照。 */
    List<NodeConfig> findByProcessDefIdAndProcessDefinitionId(String processDefId, String processDefinitionId);

    /** 按部署版本查询配置快照（运行时精确匹配，无需先查草稿）。 */
    List<NodeConfig> findByProcessDefinitionId(String processDefinitionId);

    /** 查询当前编辑中的配置（未绑定部署版本）。 */
    List<NodeConfig> findByProcessDefIdAndProcessDefinitionIdIsNull(String processDefId);

    /** 删除当前编辑中的配置（未绑定部署版本）。 */
    void deleteByProcessDefIdAndProcessDefinitionIdIsNull(String processDefId);

    /** 按草稿 + 部署版本删除（部署覆盖旧快照时用）。 */
    void deleteByProcessDefIdAndProcessDefinitionId(String processDefId, String processDefinitionId);

    @Transactional
    void deleteByProcessDefId(String processDefId);
}
