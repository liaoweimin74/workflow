package com.workflow.engine.logic.config;

import java.util.List;

/**
 * 后端业务逻辑 - 数据新增（DATA_INSERT）节点子配置。
 *
 * <p>纯配置化向业务表插入一行（复用 BizDataSupport.createGeneric：
 * 必填校验 / JSON 列序列化 / 日期归一 / data-picker 冗余文本，租户隔离内建）：
 *
 * <pre>{@code
 * {
 *   "formKey": "bill_test",
 *   "data": [
 *     {"column":"person_name", "value":"{{formData.person_name}}"},
 *     {"column":"leave_days", "value":"3"}
 *   ]
 * }
 * }</pre>
 *
 * <ul>
 *   <li>formKey：业务表单 key（须已发布且已建表）；</li>
 *   <li>data：列值对；value 支持 {@code {{var}}} 与点路径取值（保留原始类型）或字面量；</li>
 *   <li>主键 id/version/tenant_id 等托管列由平台自动生成，不可配置。</li>
 * </ul>
 *
 * <p>输出：新行对象 {@code { id, version, data: {...业务列} }}，
 * 未声明 results 时按隐式约定写入 {@code <节点id>}（下游如 di_x1.id）。
 */
public class BackendDataInsertConfig {

    private String formKey;
    private List<DataField> data;

    public String getFormKey() { return formKey; }
    public void setFormKey(String formKey) { this.formKey = formKey; }

    public List<DataField> getData() { return data; }
    public void setData(List<DataField> data) { this.data = data; }

    /** 新增列值对。 */
    public static class DataField {
        private String column;
        private String value;

        public String getColumn() { return column; }
        public void setColumn(String column) { this.column = column; }

        public String getValue() { return value; }
        public void setValue(String value) { this.value = value; }
    }
}
