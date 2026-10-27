package com.workflow.api.dto;

import com.workflow.engine.datasource.scope.DataScopeAction;
import com.workflow.engine.datasource.scope.DataScopeSubject;
import com.workflow.engine.datasource.scope.DataScopeType;

/**
 * 数据范围规则视图（不暴露 tenantId 与审计字段）。
 */
public class DataScopeDTO {

    private Long id;
    private String dataSourceId;
    private DataScopeAction action;
    private DataScopeSubject subjectType;
    private String subjectKey;
    private DataScopeType scopeType;
    private String scopeColumn;
    private String scopeValue;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
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
}
