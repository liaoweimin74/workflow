package com.workflow.engine.task;

import java.util.List;
import java.util.Map;

/**
 * 业务系统自定义选人函数扩展点（对齐 NodeJS 引擎 AssigneeResolveFn）。
 *
 * <p>实现本接口并注册为 Spring Bean 即自动纳入 {@link AssigneeResolverRegistry}；
 * 节点配置 approval.type='external' + approval.external.resolver='<name()>'
 * 时，引擎运行时按名查找并调用选人。
 *
 * <p>中文名（{@link #displayName()}）显示在设计器面板下拉里，全局唯一（启动时校验）；
 * 参数声明（{@link #paramDefs()}）决定面板渲染的参数配置表单，配置值随节点配置持久化，
 * 运行时经 {@code resolve(ctx, params)} 第二参传入 —— 同一函数可被不同节点以不同参数复用。
 *
 * <p>约束（v1，与 NodeJS 端一致）：实现必须<b>同步</b>返回用户 ID 列表；
 * 返回空列表视为解析不出，落到节点「找不到办理人」策略。
 */
public interface AssigneeResolver {

    /** 选人函数注册名（对应 approval.external.resolver 配置值，需全局唯一）。 */
    String name();

    /**
     * 按上下文与节点参数解析办理/审批人。
     *
     * @param ctx    节点/发起人/流程变量上下文（variables 为快照，业务系统修改无效）
     * @param params 节点配置的参数值表（approval.external.params；未配置时为空 Map）
     * @return 用户 ID 列表；抛出异常视为解析不出（调用方吞掉，落「找不到办理人」策略）
     */
    List<String> resolve(AssigneeResolveContext ctx, Map<String, Object> params);

    /** 选人函数中文名（面板展示；缺省取注册名；全局唯一，重复时启动失败）。 */
    default String displayName() {
        return name();
    }

    /** 功能说明（面板灰色提示；缺省无）。 */
    default String description() {
        return null;
    }

    /** 参数声明（面板渲染参数配置表单；缺省无参数）。 */
    default List<AssigneeParamDef> paramDefs() {
        return List.of();
    }
}
