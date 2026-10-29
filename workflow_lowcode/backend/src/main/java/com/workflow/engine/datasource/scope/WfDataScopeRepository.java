package com.workflow.engine.datasource.scope;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface WfDataScopeRepository extends JpaRepository<WfDataScope, Long> {

    /**
     * 取某数据源某动作下的全部规则（主体匹配在服务层做）。
     * <p>按数据源而非按主体集合查：一个数据源上的规则条数量级是个位数，
     * 换取「配置是否生效」可解释、可预览，且避免多列 IN 的方言差异。
     */
    List<WfDataScope> findByTenantIdAndDataSourceIdAndAction(
            String tenantId, String dataSourceId, DataScopeAction action);

    List<WfDataScope> findByTenantIdAndDataSourceIdOrderBySubjectTypeAscSubjectKeyAsc(String tenantId, String dataSourceId);

    Optional<WfDataScope> findByTenantIdAndDataSourceIdAndActionAndSubjectTypeAndSubjectKey(
            String tenantId, String dataSourceId, DataScopeAction action,
            DataScopeSubject subjectType, String subjectKey);
}
