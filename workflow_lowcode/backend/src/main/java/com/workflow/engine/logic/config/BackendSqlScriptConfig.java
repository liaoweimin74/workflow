package com.workflow.engine.logic.config;

/**
 * 后端业务逻辑 - SQL 批处理（SQL_SCRIPT）节点子配置。
 *
 * <p>多条 SQL 顺序执行：{@code ;} 分隔（字符串字面量/注释内的 ; 不切分），
 * 语句中的 {@code {{var.path}}} 占位符编译为 JDBC {@code ?} 占位符并按序参数绑定（防注入，
 * 纯占位符保留原始类型）。返回执行汇总 Map 作为节点返回值（未声明 results 时按隐式
 * 约定整体写入以节点 id 命名的变量，如 sql_script_x1，下游点路径取子字段）。
 *
 * <pre>{@code
 * {
 *   "sql": "UPDATE wf_biz_warehouse SET qty = qty - 1 WHERE sku = {{sku}}; " +
 *          "SELECT * FROM wf_biz_warehouse WHERE sku = {{sku}};",
 *   "onError": "abort",
 *   "maxRows": 200
 * }
 * }</pre>
 *
 * <ul>
 *   <li>onError：abort（默认，单事务全有或全无——任一语句失败整体回滚，汇总标 aborted=true）
 *       | continue（自动提交逐条执行，失败记入 sN.error 继续）；</li>
 *   <li>maxRows：单条 SELECT 返回行数上限（默认 200，硬上限 1000，超出截断标 truncated）；</li>
 *   <li>语句类型白名单：SELECT/SHOW/DESC/DESCRIBE/EXPLAIN/WITH（查询）、INSERT/REPLACE
 *       （含自增键）、UPDATE/DELETE（受影响行数）；DDL/管理命令拒绝（隐式提交破坏事务原子性）；</li>
 *   <li>汇总结构：{ total, succeeded, failed, aborted?, durationMs, s0:{index,kind,sql,…}, s1:{…} }，
 *       语句别名注释 {@code -- name: xxx} 优先作为条目键（重名校验拒绝）。</li>
 * </ul>
 */
public class BackendSqlScriptConfig {

    /** 失败策略：单事务回滚（默认）。 */
    public static final String ON_ERROR_ABORT = "abort";
    /** 失败策略：自动提交逐条继续。 */
    public static final String ON_ERROR_CONTINUE = "continue";

    /** SQL 文本（多语句，; 分隔）。 */
    private String sql;
    /** 失败策略：abort（默认）| continue。 */
    private String onError;
    /** 单条 SELECT 行数上限（默认 200，1~1000）。 */
    private Integer maxRows;

    public String getSql() { return sql; }
    public void setSql(String sql) { this.sql = sql; }

    public String getOnError() { return onError; }
    public void setOnError(String onError) { this.onError = onError; }

    public Integer getMaxRows() { return maxRows; }
    public void setMaxRows(Integer maxRows) { this.maxRows = maxRows; }
}
