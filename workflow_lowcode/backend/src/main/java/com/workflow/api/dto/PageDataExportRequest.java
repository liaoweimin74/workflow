package com.workflow.api.dto;

import java.util.List;

/**
 * 页面数据视图 Excel 导出请求。
 * 查询上下文与 {@link BizDataQueryRequest} 同构（filter 为 JSON 字符串，
 * 受页面 searchFields 白名单约束；sort 受 sortableFields 白名单约束），
 * 额外携带导出列子集与文件名。
 */
public class PageDataExportRequest {

    /** 字段筛选（JSON 字符串，格式同查询接口） */
    private String filter;

    /** 关键词（对 keywordColumn 做 LIKE） */
    private String keyword;

    /** 关键词匹配列（可选） */
    private String keywordColumn;

    /** 排序字段（可选，白名单） */
    private String sort;

    /** 排序方向（asc/desc，默认 desc） */
    private String order;

    /** 运行时查询参数（JSON 字符串，sql 模式数据源用） */
    private String params;

    /** 导出列 key 子集（可选；须为视图声明 columns 的 key，缺省=全部可见列） */
    private List<String> columns;

    /** 下载文件名（可选，缺省 = 页面名称.xlsx） */
    private String filename;

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

    public String getParams() { return params; }
    public void setParams(String params) { this.params = params; }

    public List<String> getColumns() { return columns; }
    public void setColumns(List<String> columns) { this.columns = columns; }

    public String getFilename() { return filename; }
    public void setFilename(String filename) { this.filename = filename; }
}
