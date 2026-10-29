package com.workflow.api.dto;

import com.workflow.engine.datasource.scope.DataScopeAction;
import com.workflow.engine.datasource.scope.DataScopeSubject;
import com.workflow.engine.datasource.scope.DataScopeType;

/**
 * 数据范围规则保存请求（管理端）。
 */
public class DataScopeSaveRequest {

    private String dataSourceId;

    /** 约束的动作：READ 读 / WRITE 写；缺省 READ */
    private DataScopeAction action = DataScopeAction.READ;

    /** 主体类型：ROLE / USER / ORG / MEMBER_GROUP */
    private DataScopeSubject subjectType = DataScopeSubject.ROLE;

    /** 主体标识：角色 code / 用户 id / 组织 id / 成员组 id */
    private String subjectKey;

    private DataScopeType scopeType;

    /** scopeType=CUSTOM 时必填：过滤列（须为数据源声明列） */
    private String scopeColumn;

    /** scopeType=CUSTOM 时必填：值模板（{userId} / {username} / {orgId} 或字面量） */
    private String scopeValue;

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
