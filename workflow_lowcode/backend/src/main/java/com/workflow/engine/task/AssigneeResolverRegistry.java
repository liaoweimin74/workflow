package com.workflow.engine.task;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
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
 * <p>中文名（displayName）全局唯一：两个不同注册名声明同一中文名时启动失败
 * （设计器面板靠中文名区分函数，重复会造成歧义）。
 *
 * <p>约束（v1，与 NodeJS 端一致）：选人函数必须同步返回用户 ID 列表；
 * 未注册的注册名/返回空列表 → 视为解析不出，落到「找不到办理人」策略。
 */
@Component
public class AssigneeResolverRegistry {

    /** 选人函数元数据（面板展示用；对齐 NodeJS AssigneeResolverMeta）。 */
    public record ResolverMeta(
            String name,
            String displayName,
            String description,
            List<AssigneeParamDef> params) {
    }

    private final Map<String, AssigneeResolver> resolvers = new LinkedHashMap<>();

    /** 构造注入容器内全部 AssigneeResolver Bean，按 name() 建注册表（同名后注册覆盖）。 */
    public AssigneeResolverRegistry(List<AssigneeResolver> resolverBeans) {
        if (resolverBeans == null) {
            return;
        }
        Map<String, String> displayNameOwner = new HashMap<>();
        for (AssigneeResolver resolver : resolverBeans) {
            String name = resolver.name() == null ? "" : resolver.name().trim();
            if (name.isEmpty()) {
                continue; // 未提供注册名的实现不纳入（对齐 NodeJS 端注册名非空校验）
            }
            String displayName = resolver.displayName() == null || resolver.displayName().isBlank()
                    ? name : resolver.displayName().trim();
            // 中文名唯一性：允许同名覆盖（覆盖者与被覆盖者共用槽位），不允许抢占他人的中文名
            String owner = displayNameOwner.get(displayName);
            if (owner != null && !owner.equals(name)) {
                throw new IllegalStateException(
                        "选人函数中文名重复: \"" + displayName + "\" 已被 \"" + owner + "\" 使用");
            }
            displayNameOwner.put(displayName, name);
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

    /**
     * 已注册的选人函数元数据清单（设计器面板下拉数据源），按注册名排序。
     * 对齐 NodeJS GET /api/v1/assignee-resolvers 响应形状。
     */
    public List<ResolverMeta> metadata() {
        return resolvers.values().stream()
                .sorted(Comparator.comparing(AssigneeResolver::name))
                .map(r -> new ResolverMeta(
                        r.name(),
                        r.displayName() == null || r.displayName().isBlank() ? r.name() : r.displayName().trim(),
                        r.description(),
                        r.paramDefs() == null || r.paramDefs().isEmpty() ? null : r.paramDefs()))
                .toList();
    }
}
