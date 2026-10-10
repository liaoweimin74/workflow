package com.workflow.engine.logic.config;

import java.util.List;

/**
 * 后端业务逻辑 - 数据删除（DATA_DELETE）节点子配置。
 *
 * <p>两种形态二选一（id 存在且非空时优先精确删除）：
 *
 * <pre>{@code
 * // 形态一：按 id 精确删除（复用 BizDataSupport.deleteGeneric，级联子表，行不存在报错）
 * { "formKey": "bill_test", "id": "{{rowId}}" }
 *
 * // 形态二：按条件删除（引擎自动追加 tenant_id = 当前租户 过滤；至少一个条件，防全表删）
 * { "formKey": "bill_test",
 *   "filter": [ {"column":"status", "op":"EQ", "value":"DRAFT"} ] }
 * }</pre>
 *
 * <ul>
 *   <li>filter.op：EQ | NE | GT | GTE | LT | LTE | IS_NULL | NOT_NULL（AND 连接）；</li>
 *   <li>value 支持 {@code {{var}}} 与点路径取值；</li>
 *   <li>条件形态列白名单 = 表单业务列 + id/version/tenant_id 系统列；</li>
 *   <li>条件形态仅删主表行（不级联子表），输出删除行数。</li>
 * </ul>
 *
 * <p>输出：{@code { deleted: N, mode: "id"|"filter" }}，
 * 未声明 results 时按隐式约定写入 {@code <节点id>}。
 */
public class BackendDataDeleteConfig {

    private String formKey;
    private String id;
    private List<DeleteCond> filter;

    public String getFormKey() { return formKey; }
    public void setFormKey(String formKey) { this.formKey = formKey; }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public List<DeleteCond> getFilter() { return filter; }
    public void setFilter(List<DeleteCond> filter) { this.filter = filter; }

    /** 删除条件项（AND 连接）。 */
    public static class DeleteCond {
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
