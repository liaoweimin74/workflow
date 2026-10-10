package com.workflow.engine.logic.config;

import java.util.List;

/**
 * 后端业务逻辑 - 数据查询（DATA_QUERY）节点子配置。
 *
 * <p>纯配置化查询业务表数据（复用 BizDataSupport 通用查询，租户隔离内建）：
 *
 * <pre>{@code
 * {
 *   "formKey": "bill_test",
 *   "filter": [ {"column":"person_name", "value":"{{formData.person_name}}"} ],
 *   "keyword": "张",
 *   "keywordColumn": "person_name",
 *   "size": 50
 * }
 * }</pre>
 *
 * <ul>
 *   <li>formKey：业务表单 key（决定目标动态表，须已发布且已建表）；</li>
 *   <li>filter：等值筛选（AND 连接），value 支持 {@code {{var}}} 与点路径取值；</li>
 *   <li>keyword/keywordColumn：可选关键字模糊筛选（列须在最新 schema 白名单内）；</li>
 *   <li>size：单次返回行数上限（默认 50，硬上限 100，对齐 BizDataSupport 通用查询钳制）。</li>
 * </ul>
 *
 * <p>输出：{@code { total, rows: [ {id, version, ...业务列}, ... ] }}，
 * 未声明 results 时按隐式约定写入 {@code <节点id>}（下游如 dq_x1.rows、dq_x1.total）。
 */
public class BackendDataQueryConfig {

    /** 默认返回行数。 */
    public static final int DEFAULT_SIZE = 50;
    /** 行数硬上限（queryGeneric 内部对正数 size 亦有 100 钳制，此处显式约束语义）。 */
    public static final int MAX_SIZE = 100;

    private String formKey;
    private List<DataFilter> filter;
    private String keyword;
    private String keywordColumn;
    private Integer size;

    public String getFormKey() { return formKey; }
    public void setFormKey(String formKey) { this.formKey = formKey; }

    public List<DataFilter> getFilter() { return filter; }
    public void setFilter(List<DataFilter> filter) { this.filter = filter; }

    public String getKeyword() { return keyword; }
    public void setKeyword(String keyword) { this.keyword = keyword; }

    public String getKeywordColumn() { return keywordColumn; }
    public void setKeywordColumn(String keywordColumn) { this.keywordColumn = keywordColumn; }

    public Integer getSize() { return size; }
    public void setSize(Integer size) { this.size = size; }

    /** 等值筛选条件（AND 连接）。 */
    public static class DataFilter {
        private String column;
        private String value;

        public String getColumn() { return column; }
        public void setColumn(String column) { this.column = column; }

        public String getValue() { return value; }
        public void setValue(String value) { this.value = value; }
    }
}
