package com.workflow.engine.task;

import java.util.List;

/**
 * 业务系统自定义选人函数扩展点（对齐 NodeJS 引擎 AssigneeResolveFn）。
 *
 * <p>实现本接口并注册为 Spring Bean 即自动纳入 {@link AssigneeResolverRegistry}；
 * 节点配置 approval.type='external' + approval.external.resolver='<name()>'
 * 时，引擎运行时按名查找并调用选人。
 *
 * <p>约束（v1，与 NodeJS 端一致）：实现必须<b>同步</b>返回用户 ID 列表；
 * 返回空列表视为解析不出，落到节点「找不到办理人」策略。
 */
public interface AssigneeResolver {

    /** 选人函数注册名（对应 approval.external.resolver 配置值，需全局唯一）。 */
    String name();

    /**
     * 按上下文解析办理/审批人。
     *
     * @param ctx 节点/发起人/流程变量上下文（variables 为快照，业务系统修改无效）
     * @return 用户 ID 列表；抛出异常视为解析不出（调用方吞掉，落「找不到办理人」策略）
     */
    List<String> resolve(AssigneeResolveContext ctx);
}
