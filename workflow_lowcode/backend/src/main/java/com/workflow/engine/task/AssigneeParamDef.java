package com.workflow.engine.task;

import java.util.List;

/**
 * 选人函数参数声明（对齐 NodeJS 引擎 AssigneeParamDef）。
 *
 * <p>业务系统实现 {@link AssigneeResolver#paramDefs()} 声明参数后，
 * 设计器面板「办理人/审批人设置 → 自定义选人函数」按此渲染参数配置表单，
 * 配置值随节点配置（approval.external.params）持久化，运行时经
 * {@link AssigneeResolver#resolve(AssigneeResolveContext, Map)} 第二参传入。
 *
 * @param key          参数键（保存进 approval.external.params；运行时按同名字段取值）
 * @param label        参数中文名（面板显示）
 * @param type         控件类型：string / number / boolean / select，缺省 string
 * @param required     是否必填（面板标红星；引擎不做强校验）
 * @param placeholder  输入占位提示
 * @param defaultValue 缺省值（面板首次配置时预填）
 * @param options      type=select 时的候选项
 * @param description  参数说明
 */
public record AssigneeParamDef(
        String key,
        String label,
        String type,
        Boolean required,
        String placeholder,
        Object defaultValue,
        List<Option> options,
        String description) {

    /** select 选项。 */
    public record Option(String label, String value) {
    }
}
