package com.workflow.engine.datasource.scope;

import com.workflow.common.domain.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * 数据范围配置（主体 × 数据源 × 动作）。
 *
 * <p>与数据源 {@code params} 分离存放：params 会被数据源编辑表单整包回写，
 * 范围规则若混在里面会在管理员改别的配置时被静默抹掉——权限配置不能被无关表单覆盖。
 */
@Entity
@Table(name = "wf_data_scope",
       uniqueConstraints = @UniqueConstraint(name = "uk_data_scope_subject",
               columnNames = {"tenant_id", "data_source_id", "scope_action", "subject_type", "subject_key"}))
public class WfDataScope extends BaseEntity {

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "data_source_id", length = 64, nullable = false)
    private String dataSourceId;

    /** 读/写：同一条规则只约束一类动作，分开设是因为「能看」与「能改」通常不同。 */
    @Enumerated(EnumType.STRING)
    @Column(name = "scope_action", length = 10, nullable = false)
    private DataScopeAction action = DataScopeAction.READ;

    @Enumerated(EnumType.STRING)
    @Column(name = "subject_type", length = 20, nullable = false)
    private DataScopeSubject subjectType = DataScopeSubject.ROLE;

    /** 主体标识：角色 code / 用户 id / 组织 id / 成员组 id（一律字符串化存储）。 */
    @Column(name = "subject_key", length = 64, nullable = false)
    private String subjectKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "scope_type", length = 20, nullable = false)
    private DataScopeType scopeType = DataScopeType.ALL;

    /** CUSTOM 的业务列名（须是数据源声明列）；SELF 固定用内置 created_by，ALL 为空。 */
    @Column(name = "scope_column", length = 100)
    private String scopeColumn;

    /** CUSTOM 的值模板：{@code {userId}} / {@code {username}} / {@code {orgId}}，也可是字面量。 */
    @Column(name = "scope_value", length = 200)
    private String scopeValue;

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }
    public String getDataSourceId() { return dataSourceId; }
    public void setDataSourceId(String dataSourceId) { this.dataSourceId = dataSourceId; }
    public DataScopeAction getAction() { return action; }
    public void setAction(DataScopeAction action) { this.action = action; }
    public DataScopeSubject getSubjectType() { return subjectType; }
    public void setSubjectType(DataScopeSubject subjectType) { this.subjectType = subjectType; }
    public String getSubjectKey() { return subjectKey; }
    public void setSubjectKey(String subjectKey) { this.subjectKey = subjectKey; }
    public DataScopeType getScopeType() { return scopeType; }
    public void setScopeType(DataScopeType scopeType) { this.scopeType = scopeType; }
    public String getScopeColumn() { return scopeColumn; }
    public void setScopeColumn(String scopeColumn) { this.scopeColumn = scopeColumn; }
    public String getScopeValue() { return scopeValue; }
    public void setScopeValue(String scopeValue) { this.scopeValue = scopeValue; }

    /** 与 {@link DataScopeSubjectResolver} 产出的主体标识同格式（{@code TYPE:key}）。 */
    public String subjectRef() {
        return subjectType == null || subjectKey == null ? "" : subjectType.name() + ":" + subjectKey;
    }
}
