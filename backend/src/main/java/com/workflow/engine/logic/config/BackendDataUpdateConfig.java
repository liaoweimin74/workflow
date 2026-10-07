package com.workflow.engine.logic.config;

import java.util.List;

/**
 * 后端业务逻辑 - 数据更新（DATA_UPDATE）节点子配置。
 *
 * <p>纯配置化数据改写：无需写 Java/Groovy，由引擎按元数据校验后以
 * PreparedStatement 参数绑定执行 UPDATE（防注入）。
 *
 * <pre>{@code
 * {
 *   "table": "wf_biz_warehouse",
 *   "setOps":   [ {"column":"qty", "mode":"ADD", "value":"{{formData.qty}}"} ],
 *   "where":    [ {"column":"sku", "op":"EQ", "value":"{{formData.sku}}"} ]
 * }
 * }</pre>
 *
 * <ul>
 *   <li>table：目标动态表名，运行期校验须存在且以 {@code wf_biz_} / {@code wf_form_data} 开头；</li>
 *   <li>setOps.mode：SET（直接赋值）| ADD（col = col + ?）| SUB（col = col - ?），
 *       ADD/SUB 的 value 须为数值（字面量或 {{var}} 解析结果）；</li>
 *   <li>value：支持 {@code {{var}}} 与 {@code {{formData.xxx}}} 点路径取值，否则按字面量；</li>
 *   <li>where.op：EQ | NE | GT | GTE | LT | LTE | IS_NULL | NOT_NULL（AND 连接）。受影响行数写回节点 resultVar。</li>
 * </ul>
 */
public class BackendDataUpdateConfig {

    /** SET/ADD/SUB 写值模式。 */
    public static final String MODE_SET = "SET";
    public static final String MODE_ADD = "ADD";
    public static final String MODE_SUB = "SUB";

    private String table;
    private List<SetOp> setOps;
    private List<WhereCond> where;

    public String getTable() { return table; }
    public void setTable(String table) { this.table = table; }

    public List<SetOp> getSetOps() { return setOps; }
    public void setSetOps(List<SetOp> setOps) { this.setOps = setOps; }

    public List<WhereCond> getWhere() { return where; }
    public void setWhere(List<WhereCond> where) { this.where = where; }

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
}
