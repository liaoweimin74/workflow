package com.workflow.api.dto;

import java.util.List;

/**
 * 页面挂接菜单列表响应。
 * items 为该页面（按 key 反查 path）的全部关联菜单。
 */
public class PageMenuResponse {

    private List<MenuItem> items;

    public PageMenuResponse() {
    }

    public PageMenuResponse(List<MenuItem> items) {
        this.items = items;
    }

    public List<MenuItem> getItems() { return items; }
    public void setItems(List<MenuItem> items) { this.items = items; }

    /**
     * 关联菜单项。
     */
    public static class MenuItem {
        private Long menuId;
        private String menuName;
        private String path;
        private Long parentId;
        private String permission;
        private Integer status;

        public Long getMenuId() { return menuId; }
        public void setMenuId(Long menuId) { this.menuId = menuId; }

        public String getMenuName() { return menuName; }
        public void setMenuName(String menuName) { this.menuName = menuName; }

        public String getPath() { return path; }
        public void setPath(String path) { this.path = path; }

        public Long getParentId() { return parentId; }
        public void setParentId(Long parentId) { this.parentId = parentId; }

        public String getPermission() { return permission; }
        public void setPermission(String permission) { this.permission = permission; }

        public Integer getStatus() { return status; }
        public void setStatus(Integer status) { this.status = status; }
    }
}
