package com.workflow.api.dto;

/**
 * 客户端页面启用清单条目（PUT 请求体）。
 */
public class AppClientPageItem {

    private String pageId;
    private Integer sort;
    private String navConfig;

    public String getPageId() { return pageId; }
    public void setPageId(String pageId) { this.pageId = pageId; }

    public Integer getSort() { return sort; }
    public void setSort(Integer sort) { this.sort = sort; }

    public String getNavConfig() { return navConfig; }
    public void setNavConfig(String navConfig) { this.navConfig = navConfig; }
}
