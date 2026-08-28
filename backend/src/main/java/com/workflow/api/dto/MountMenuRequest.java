package com.workflow.api.dto;

/**
 * 页面挂接菜单请求。
 * name 缺省使用页面 name；parentId 为空表示挂到根目录。
 */
public class MountMenuRequest {

    private String name;
    private Long parentId;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public Long getParentId() { return parentId; }
    public void setParentId(Long parentId) { this.parentId = parentId; }
}
