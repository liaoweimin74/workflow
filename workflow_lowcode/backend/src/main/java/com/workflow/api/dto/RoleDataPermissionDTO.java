package com.workflow.api.dto;

import java.util.List;
import java.util.Map;

/** 角色数据权限视图：一个权限对象在该角色上的读/写勾选。 */
public class RoleDataPermissionDTO {

    private Long permissionId;
    private String permissionName;
    private String remark;
    private List<Map<String, Object>> conditions;
    private List<String> dataSourceIds;
    private boolean read;
    private boolean write;

    public Long getPermissionId() { return permissionId; }
    public void setPermissionId(Long permissionId) { this.permissionId = permissionId; }
    public String getPermissionName() { return permissionName; }
    public void setPermissionName(String permissionName) { this.permissionName = permissionName; }
    public String getRemark() { return remark; }
    public void setRemark(String remark) { this.remark = remark; }
    public List<Map<String, Object>> getConditions() { return conditions; }
    public void setConditions(List<Map<String, Object>> conditions) { this.conditions = conditions; }
    public List<String> getDataSourceIds() { return dataSourceIds; }
    public void setDataSourceIds(List<String> dataSourceIds) { this.dataSourceIds = dataSourceIds; }
    public boolean isRead() { return read; }
    public void setRead(boolean read) { this.read = read; }
    public boolean isWrite() { return write; }
    public void setWrite(boolean write) { this.write = write; }
}
