package com.workflow.engine.datasource.scope;

/**
 * 数据范围类型（角色 × 数据源）。
 *
 * <p>宽度递减：{@link #ALL} 不限制 &gt; {@link #CUSTOM} 按业务列等值 &gt; {@link #SELF} 仅本人创建。
 * 多角色命中时取最宽的一条（任一角色放行即放行）。
 */
public enum DataScopeType {

    /** 全部数据（等价于未配置）。 */
    ALL,

    /** 仅当前用户创建的记录：注入 {@code created_by = 当前用户 id}。 */
    SELF,

    /** 自定义列等值：列名 + 值模板（{@code {userId}} / {@code {username}} / {@code {orgId}}）。 */
    CUSTOM
}
