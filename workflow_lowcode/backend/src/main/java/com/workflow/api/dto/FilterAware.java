package com.workflow.api.dto;

/**
 * 携带 {@code filter}（JSON 字符串）的查询请求共同契约。
 *
 * <p>存在意义是让服务端注入（数据范围 DataScope）用一个入口覆盖列表与聚合两条链路，
 * 避免仪表盘聚合绕开范围限制。实现类：{@link BizDataQueryRequest}、{@link AggregateRequest}。
 */
public interface FilterAware {

    String getFilter();

    void setFilter(String filter);
}
