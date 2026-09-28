package com.workflow.engine.task;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 业务系统自定义选人函数注册表（对齐 NodeJS 引擎 assignee-resolver-registry）。
 *
 * <p>业务系统实现 {@link AssigneeResolver} 接口并注册为 Spring Bean 即自动纳入注册表
 * （Spring 构造注入收集全部实现）；节点配置 approval.type='external' +
 * approval.external.resolver='<注册名>' 时，引擎运行时按名查找并调用选人。
 *
 * <p>约束（v1，与 NodeJS 端一致）：选人函数必须同步返回用户 ID 列表；
 * 未注册的注册名/返回空列表 → 视为解析不出，落到「找不到办理人」策略。
 */
@Component
public class AssigneeResolverRegistry {

    private final Map<String, AssigneeResolver> resolvers = new LinkedHashMap<>();

    /** 构造注入容器内全部 AssigneeResolver Bean，按 name() 建注册表（同名后注册覆盖）。 */
    public AssigneeResolverRegistry(List<AssigneeResolver> resolverBeans) {
        if (resolverBeans == null) {
            return;
        }
        for (AssigneeResolver resolver : resolverBeans) {
            String name = resolver.name() == null ? "" : resolver.name().trim();
            if (name.isEmpty()) {
                continue; // 未提供注册名的实现不纳入（对齐 NodeJS 端注册名非空校验）
            }
            resolvers.put(name, resolver);
        }
    }

    /** 按注册名查找选人函数；未注册/注册名为空返回 empty。 */
    public Optional<AssigneeResolver> find(String name) {
        if (name == null) {
            return Optional.empty();
        }
        String key = name.trim();
        if (key.isEmpty()) {
            return Optional.empty();
        }
        return Optional.ofNullable(resolvers.get(key));
    }

    /** 已注册的选人函数名清单（诊断/运维接口用）。 */
    public List<String> registeredNames() {
        return new ArrayList<>(resolvers.keySet());
    }
}
