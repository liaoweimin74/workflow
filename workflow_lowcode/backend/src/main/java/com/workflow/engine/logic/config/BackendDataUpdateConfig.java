package com.workflow.engine.logic.config;

import java.util.List;

/**
 * 后端业务逻辑 - 数据更新（DATA_UPDATE）节点子配置。
 *
 * <p>纯配置化数据改写：无需写 Java/Groovy，由引擎按元数据校验后以
 * PreparedStatement 参数绑定执行 UPDATE（防注入）。
 *
 * <p>两种配置形态（二选一，{@code updates} 存在且非空时优先）：
 *
 * <pre>{@code
 * // 形态一：单表（存量，返回受影响行数 Integer）
 * {
 *   "table": "wf_biz_warehouse",
 *   "setOps":   [ {"column":"qty", "mode":"ADD", "value":"{{formData.qty}}"} ],
 *   "where":    [ {"column":"sku", "op":"EQ", "value":"{{formData.sku}}"} ]
 * }
 *
 * // 形态二：多表（单事务顺序执行，全有或全无；返回汇总 Map）
 * {
 *   "updates": [
 *     { "alias": "order", "table": "wf_biz_order",
 *       "setOps": [ {"column":"status", "mode":"SET", "value":"PAID"} ],
 *       "where":  [ {"column":"id", "op":"EQ", "value":"{{orderId}}"} ] },
 *     { "table": "wf_biz_stock",
 *       "setOps": [ {"column":"qty", "mode":"SUB", "value":"{{formData.qty}}"} ],
 *       "where":  [ {"column":"sku", "op":"EQ", "value":"{{formData.sku}}"} ] }
 *   ]
 * }
 * }</pre>
 *
 * <ul>
 *   <li>table：目标动态表名，运行期校验须存在（表名经标识符校验后拼接，值一律参数绑定防注入）；</li>
 *   <li>setOps.mode：SET（直接赋值）| ADD（col = col + ?）| SUB（col = col - ?），
 *       ADD/SUB 的 value 须为数值（字面量或 {{var}} 解析结果）；</li>
 *   <li>value：支持 {@code {{var}}} 与 {@code {{formData.xxx}}} 点路径取值，否则按字面量；</li>
 *   <li>where.op：EQ | NE | GT | GTE | LT | LTE | IS_NULL | NOT_NULL（AND 连接）；</li>
 *   <li>updates[].alias：可选输出别名（\w+，多表内唯一），缺省输出键为 t{序号}；</li>
 *   <li>多表形态输出：{@code { total, affected, <别名|t{i}>: {table, affected}, ... }}，
 *       未声明 results 时按隐式约定写入 {@code <节点id>} 变量（如 du_x1.t0.affected、du_x1.order.affected）；
 *       任一表失败整体回滚（节点抛错走 errorAction）。</li>
 * </ul>
 */
public class BackendDataUpdateConfig {

    /** SET/ADD/SUB 写值模式。 */
    public static final String MODE_SET = "SET";
    public static final String MODE_ADD = "ADD";
    public static final String MODE_SUB = "SUB";

    /** 多表更新（updates）条目数上限（防超长配置；引擎与发布校验共用）。 */
    public static final int MAX_UPDATES = 20;

    private String table;
    private List<SetOp> setOps;
    private List<WhereCond> where;

    /** 多表更新：存在且非空时按单事务顺序执行（优先于单表形态）。 */
    private List<TableUpdate> updates;

    public String getTable() { return table; }
    public void setTable(String table) { this.table = table; }

    public List<SetOp> getSetOps() { return setOps; }
    public void setSetOps(List<SetOp> setOps) { this.setOps = setOps; }

    public List<WhereCond> getWhere() { return where; }
    public void setWhere(List<WhereCond> where) { this.where = where; }

    public List<TableUpdate> getUpdates() { return updates; }
    public void setUpdates(List<TableUpdate> updates) { this.updates = updates; }

    /** SET 赋值项。 */
    public static class SetOp {
        private String column;
        private String mode = MODE_SET;
        private String value;

        public String getColumn() { return column; }
        public void setColumn(String column) { this.column = column; }

        public String getMode() { return mode; }
        public void setMode(String mode) { this.mode = mode; }

        public String getValue() { return value; }
        public void setValue(String value) { this.value = value; }
    }

    /** WHERE 条件项（AND 连接）。 */
    public static class WhereCond {
        private String column;
        private String op;
        private String value;

        public String getColumn() { return column; }
        public void setColumn(String column) { this.column = column; }

        public String getOp() { return op; }
        public void setOp(String op) { this.op = op; }

        public String getValue() { return value; }
        public void setValue(String value) { this.value = value; }
    }

    /** 多表更新单表项（结构与单表形态一致 + 可选输出别名）。 */
    public static class TableUpdate {
        /** 可选输出别名（\w+，多表内唯一）；缺省输出键为 t{序号}。 */
        private String alias;
        private String table;
        private List<SetOp> setOps;
        private List<WhereCond> where;

        public String getAlias() { return alias; }
        public void setAlias(String alias) { this.alias = alias; }

        public String getTable() { return table; }
        public void setTable(String table) { this.table = table; }

        public List<SetOp> getSetOps() { return setOps; }
        public void setSetOps(List<SetOp> setOps) { this.setOps = setOps; }

        public List<WhereCond> getWhere() { return where; }
        public void setWhere(List<WhereCond> where) { this.where = where; }
    }
}
