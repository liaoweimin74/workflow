package com.workflow.api.dto;

import com.workflow.engine.datasource.scope.DataScopeAction;

import java.util.List;

/** 角色数据权限保存请求：全量替换该角色的读/写勾选；空列表表示清空。 */
public class RoleDataPermissionSaveRequest {

    private List<Item> items;

    public List<Item> getItems() { return items; }
    public void setItems(List<Item> items) { this.items = items; }

    public static class Item {

        private Long permissionId;
        private List<DataScopeAction> actions;

        public Long getPermissionId() { return permissionId; }
        public void setPermissionId(Long permissionId) { this.permissionId = permissionId; }
        public List<DataScopeAction> getActions() { return actions; }
        public void setActions(List<DataScopeAction> actions) { this.actions = actions; }
    }
}
