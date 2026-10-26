package com.workflow.api.dto;

import com.workflow.engine.datasource.scope.DataScopeSubject;

import java.util.List;
import java.util.Map;

/** 权限对象视图（对象视角）：条件 + 关联数据源 + 主体授权。 */
public class RowPermissionDTO {

    private Long id;
    private String name;
    private String remark;
    private List<Map<String, Object>> conditions;
    private List<String> dataSourceIds;
    private List<GrantDTO> grants;
    private List<Map<String, Object>> fieldPolicies;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getRemark() { return remark; }
    public void setRemark(String remark) { this.remark = remark; }
    public List<Map<String, Object>> getConditions() { return conditions; }
    public void setConditions(List<Map<String, Object>> conditions) { this.conditions = conditions; }
    public List<String> getDataSourceIds() { return dataSourceIds; }
    public void setDataSourceIds(List<String> dataSourceIds) { this.dataSourceIds = dataSourceIds; }
    public List<GrantDTO> getGrants() { return grants; }
    public void setGrants(List<GrantDTO> grants) { this.grants = grants; }
    public List<Map<String, Object>> getFieldPolicies() { return fieldPolicies; }
    public void setFieldPolicies(List<Map<String, Object>> fieldPolicies) { this.fieldPolicies = fieldPolicies; }

    public static class GrantDTO {

        private DataScopeSubject subjectType;
        private String subjectKey;

        public DataScopeSubject getSubjectType() { return subjectType; }
        public void setSubjectType(DataScopeSubject subjectType) { this.subjectType = subjectType; }
        public String getSubjectKey() { return subjectKey; }
        public void setSubjectKey(String subjectKey) { this.subjectKey = subjectKey; }
    }
}
