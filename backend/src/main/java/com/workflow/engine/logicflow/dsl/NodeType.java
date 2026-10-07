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
    CONDITION;

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
