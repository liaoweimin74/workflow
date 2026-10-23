package com.workflow.api.dto;

/**
 * 客户端页面启用清单条目响应 VO（附带页面名称便于列表展示）。
 */
public class AppClientPageResponse {

    private String id;
    private String pageId;
    private String pageName;
    private Integer sort;
    private String navConfig;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getPageId() { return pageId; }
    public void setPageId(String pageId) { this.pageId = pageId; }

    public String getPageName() { return pageName; }
    public void setPageName(String pageName) { this.pageName = pageName; }

    public Integer getSort() { return sort; }
    public void setSort(Integer sort) { this.sort = sort; }

    public String getNavConfig() { return navConfig; }
    public void setNavConfig(String navConfig) { this.navConfig = navConfig; }
}
