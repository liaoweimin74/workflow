package com.workflow.api.dto;

import java.util.List;

/** 角色数据权限保存请求：全量替换该角色被授权的权限对象；空列表表示清空。 */
public class RoleDataPermissionSaveRequest {

    private List<Item> items;

    public List<Item> getItems() { return items; }
    public void setItems(List<Item> items) { this.items = items; }

    public static class Item {

        private Long permissionId;

        public Long getPermissionId() { return permissionId; }
        public void setPermissionId(Long permissionId) { this.permissionId = permissionId; }
    }
}
