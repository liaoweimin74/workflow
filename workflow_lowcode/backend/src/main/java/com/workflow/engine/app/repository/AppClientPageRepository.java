package com.workflow.engine.app.repository;

import com.workflow.engine.app.entity.AppClientPage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AppClientPageRepository extends JpaRepository<AppClientPage, String> {

    List<AppClientPage> findByTenantIdAndClientIdOrderBySortAsc(String tenantId, String clientId);

    boolean existsByClientIdAndPageId(String clientId, String pageId);

    long countByTenantIdAndClientId(String tenantId, String clientId);

    /**
     * 全量替换启用清单用：事务内先删后插（派生删除，需调用方开启事务）。
     */
    void deleteByTenantIdAndClientId(String tenantId, String clientId);
}
