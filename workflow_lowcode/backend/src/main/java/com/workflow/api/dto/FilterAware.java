package com.workflow.api.dto;

/**
 * 携带 {@code filter}（JSON 字符串）的查询请求共同契约。
 *
 * <p>存在意义是让服务端注入（数据范围 DataScope）用一个入口覆盖列表与聚合两条链路，
 * 避免仪表盘聚合绕开范围限制。实现类：{@link BizDataQueryRequest}、{@link AggregateRequest}。
 */
public interface FilterAware {

    /**
     * 保留键：服务端注入的行级可见集合（v3 白名单），值为「AND 组」的数组（组之间 OR、组内 AND）。
     *
     * <p>三态约定：键缺席 = 不受限；值为空数组 = 拒绝一切（生成器拼 {@code 1 = 0}，
     * 受控数据源上未授权的角色走这一态）；非空 = 条件组。
     *
     * <p>调用方 filter 的两种既有形态（map 等值 / 结构化 logic+conditions）都表达不了这层嵌套，
     * 所以范围条件随 filter 走独立通道，SQL 生成器把它作为独立 AND 段拼接。
     * 客户端传入的同名键一律被服务端丢弃。
     */
    String ROW_SCOPE_KEY = "__row_scope";

    String getFilter();

    void setFilter(String filter);
}
