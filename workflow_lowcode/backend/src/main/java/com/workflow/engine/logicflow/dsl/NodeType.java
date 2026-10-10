package com.workflow.engine.logicflow.dsl;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * 逻辑流节点类型。
 *
 * <p>DSL JSON 中的 {@code type} 字段；{@code @JsonCreator} 反序列化时大小写不敏感，
 * 未知类型抛 {@link IllegalArgumentException}（带原类型名）。
 */
public enum NodeType {

    /** 起点（多 START 取第一个）。 */
    START,
    /** 终点（到达即结束）。 */
    END,
    /** HTTP 调用（复用 HttpLogicExecutor）。 */
    HTTP,
    /** 本系统 Bean 方法调用（复用 BackendBeanRegistry 白名单）。 */
    BEAN,
    /** Groovy 脚本（复用 GroovyScriptLogic 沙箱）。 */
    SCRIPT,
    /** 条件分叉（按 branch=true/false 选出边）。 */
    CONDITION,
    /** 批处理循环（遍历集合并对每项执行内嵌动作，聚合结果列表）。 */
    BATCH,
    /** 子流程调用（调用另一条已发布的逻辑流，输出写回 resultVar）。 */
    SUBFLOW,
    /** 数据更新（纯配置 UPDATE 动态表：SET/ADD/SUB + WHERE，参数绑定防注入，受影响行数写回 resultVar）。 */
    DATA_UPDATE,
    /**
     * 业务数据写入（表单记录 upsert）：面向已发布 BUSINESS 表单的 wf_biz_&lt;formKey&gt; 物理表，
     * 以 (tenant_id, conflictKey) 唯一索引为冲突判定执行原子
     * {@code INSERT ... ON DUPLICATE KEY UPDATE}——存在则更新、不存在则新增；
     * 输出 { result: created|updated|unchanged, affected, id, table }。
     */
    DATA_UPSERT,
    /** SQL 批处理（多条 SQL 按 ; 顺序执行，{{var}} 占位符编译为 JDBC ? 参数绑定，返回执行汇总 Map）。 */
    SQL_SCRIPT,
    /** 数据查询（按 formKey 租户隔离查询业务表数据：等值筛选 + 关键字，返回分页结果 Map）。 */
    DATA_QUERY,
    /** 数据新增（按 formKey 向业务表插入一行，值支持 {{var}} 取上下文，返回含 id 的新行）。 */
    DATA_INSERT,
    /** 数据删除（按 id 精确删或按条件删，条件形态自动附加租户过滤，返回删除行数）。 */
    DATA_DELETE,
    /** 消息通知（按模板代码发送站内信/短信，模板变量支持 {{var}} 取上下文）。 */
    NOTIFY,
    /** 延时（同步等待指定毫秒，1~60000 硬上限，返回实际等待时长）。 */
    DELAY,
    /** 数据映射（JSON 模板 {{var.path}} 占位符编译为新对象：值位占位符注入原始值、字符串内插值）。 */
    TRANSFORM,
    /** 聚合（对集合做 SUM/AVG/COUNT/MIN/MAX，可按 groupBy 分组，输出汇总 Map 或分组列表）。 */
    AGGREGATE,
    /** 大模型调用（平台内置 LLM：prompt/system 支持 {{var}} 插值，返回模型文本）。 */
    LLM;

    @JsonCreator
    public static NodeType fromJson(String value) {
        if (value != null) {
            for (NodeType type : values()) {
                if (type.name().equalsIgnoreCase(value.trim())) {
                    return type;
                }
            }
        }
        throw new IllegalArgumentException("UNKNOWN_NODE_TYPE: " + value);
    }

    @JsonValue
    public String toJson() {
        return name();
    }
}
