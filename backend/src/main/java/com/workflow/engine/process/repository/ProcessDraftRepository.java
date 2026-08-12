package com.workflow.engine.process.repository;

import com.workflow.engine.process.entity.ProcessDraft;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ProcessDraftRepository extends JpaRepository<ProcessDraft, String> {

    Optional<ProcessDraft> findByIdAndTenantId(String id, String tenantId);

    Page<ProcessDraft> findByTenantIdOrderByUpdatedAtDesc(String tenantId, Pageable pageable);

    Page<ProcessDraft> findByTenantIdAndCategoryIdOrderByUpdatedAtDesc(String tenantId, String categoryId, Pageable pageable);

    Page<ProcessDraft> findByTenantIdAndNameContainingOrderByUpdatedAtDesc(String tenantId, String name, Pageable pageable);

    List<ProcessDraft> findByTenantIdAndKeyOrderByVersionDesc(String tenantId, String key);

    /**
     * 按流程 key 查询流程草稿。
     */
    Optional<ProcessDraft> findByTenantIdAndKey(String tenantId, String key);

    /**
     * 按已部署的 Flowable processDefinitionId 反查关联的流程草稿。
     * 用于运行时根据 processDefinitionId 定位 draftId，进而加载节点配置。
     */
    Optional<ProcessDraft> findByProcessDefinitionId(String processDefinitionId);
}
