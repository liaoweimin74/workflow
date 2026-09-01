package com.workflow.api.dto;

/**
 * 业务数据查询请求。
 */
public class BizDataQueryRequest {

    /** 字段筛选（JSON 字符串：{"column":"value"}，仅接受 column_config 中的字段） */
    private String filter;

    /** 关键词（对 keywordColumn 做 LIKE） */
    private String keyword;

    /** 关键词匹配列（可选） */
    private String keywordColumn;

    /** 排序字段（可选，白名单） */
    private String sort;

    /** 排序方向（asc/desc，默认 desc） */
    private String order;

    /** 页码（从 1 开始） */
    private int page = 1;

    /** 每页大小 */
    private int size = 20;

    public String getFilter() { return filter; }
    public void setFilter(String filter) { this.filter = filter; }

    public String getKeyword() { return keyword; }
    public void setKeyword(String keyword) { this.keyword = keyword; }

    public String getKeywordColumn() { return keywordColumn; }
    public void setKeywordColumn(String keywordColumn) { this.keywordColumn = keywordColumn; }

    public String getSort() { return sort; }
    public void setSort(String sort) { this.sort = sort; }

    public String getOrder() { return order; }
    public void setOrder(String order) { this.order = order; }

    public int getPage() { return page; }
    public void setPage(int page) { this.page = page; }

    public int getSize() { return size; }
    public void setSize(int size) { this.size = size; }
}
