package com.workflow.engine.logic.config;

import java.util.List;

/**
 * 后端业务逻辑 - 业务数据写入（DATA_UPSERT）节点子配置。
 *
 * <p>面向已发布 BUSINESS 表单记录的 upsert：引擎按 {@code (tenant_id, conflictKey)}
 * 物理唯一索引（表单发布时由唯一字段生成）执行原子
 * {@code INSERT ... ON DUPLICATE KEY UPDATE}——冲突键命中则更新、未命中则新增，
 * 无 check-then-act 竞态；tenant_id/created_by/version 等引擎管理列自动维护。
 *
 * <pre>{@code
 * {
 *   "formKey":     "warehouse",                 // 已发布 BUSINESS 表单 key → wf_biz_warehouse
 *   "conflictKey": "sku",                       // 冲突键：表单声明的唯一字段（须有 (tenant_id, sku) 唯一索引）
 *   "values": [                                 // 新增与更新共用的字段值（冲突键列必须包含）
 *     { "column": "sku", "value": "{{formData.sku}}" },
 *     { "column": "qty", "value": "{{formData.qty}}" }
 *   ],
 *   "onUpdate": [ { "column": "qty", "value": "{{formData.qty}}" } ]  // 可选：仅更新路径额外覆盖；缺省更新=全量 values
 * }
 * }</pre>
 *
 * <ul>
 *   <li>运行期校验：formKey 合法标识符且目标表存在；conflictKey 为表业务列且存在
 *       (tenant_id, conflictKey) 二列唯一索引（information_schema.STATISTICS 实查）；
 *       values/onUpdate 列须为业务列（引擎管理列 id/tenant_id/version/created_by/created_at/updated_at 禁写）；</li>
 *   <li>created_by：取上下文 {@code operator} 变量（表单触发注入当前登录人），缺省 logicflow；</li>
 *   <li>输出：{@code { result: "created"|"updated"|"unchanged", affected, id, table }}——
 *       MariaDB ODKU 受影响行数 1=新增 / 2=更新 / 0=无变化；id 恒反查回填（新增=本次生成，
 *       更新/无变化=按冲突键反查），下游可点路径取用（如 upsert_x1.id）；</li>
 *   <li>不走 BizDataHandler 钩子、不自动触发表单×逻辑编排绑定（与 DATA_UPDATE 一致，防自递归）；</li>
 *   <li>子表（tableForm/group）行级写入不支持，发布校验与运行期均不涉及子表。</li>
 * </ul>
 */
public class BackendDataUpsertConfig {

    /** 引擎管理列（INSERT 时引擎自动填充，禁止出现在 values/onUpdate）。 */
    public static final List<String> MANAGED_COLUMNS =
            List.of("id", "tenant_id", "version", "created_by", "created_at", "updated_at");

    /** 写入字段（values）条目数上限（防超长配置；引擎与发布校验共用）。 */
    public static final int MAX_VALUES = 50;

    private String formKey;
    private String conflictKey;
    private List<ValueOp> values;

    /** 可选：仅更新路径（ON DUPLICATE KEY UPDATE）额外覆盖的字段；缺省更新路径 = 全量 values。 */
    private List<ValueOp> onUpdate;

    public String getFormKey() { return formKey; }
    public void setFormKey(String formKey) { this.formKey = formKey; }

    public String getConflictKey() { return conflictKey; }
    public void setConflictKey(String conflictKey) { this.conflictKey = conflictKey; }

    public List<ValueOp> getValues() { return values; }
    public void setValues(List<ValueOp> values) { this.values = values; }

    public List<ValueOp> getOnUpdate() { return onUpdate; }
    public void setOnUpdate(List<ValueOp> onUpdate) { this.onUpdate = onUpdate; }

    /** 写值项（列名 + 取值表达式；{{var}} 点路径运行期解析，字面量直通）。 */
    public static class ValueOp {
        private String column;
        private String value;

        public String getColumn() { return column; }
        public void setColumn(String column) { this.column = column; }

        public String getValue() { return value; }
        public void setValue(String value) { this.value = value; }
    }
}
