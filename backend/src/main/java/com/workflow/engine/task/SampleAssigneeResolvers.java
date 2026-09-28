package com.workflow.engine.task;

import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 示例选人函数（业务系统接入参考实现，与 NodeJS 引擎 assignee-resolver-samples 对齐）。
 *
 * <p>真实业务系统应在本工程之外定义自己的 {@link AssigneeResolver} Bean；本类提供
 * 三个<b>开箱可用</b>的内置样例：演示元数据注册方式（中文名 / 描述 / 参数声明）、
 * 让设计器面板「自定义选人函数」下拉有真实数据可选、覆盖三种参数类型（string/number/select）。
 * 样例均同步、零外部依赖（只读流程变量与配置参数）。
 */
public final class SampleAssigneeResolvers {

    private SampleAssigneeResolvers() {
    }

    /** 逗号分隔用户串 → 归一列表（去空白去空项）。 */
    private static List<String> splitUsers(String raw) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
    }

    /** 变量取字符串（缺值返回 null）。 */
    private static String variableAsString(Map<String, Object> variables, String key) {
        Object v = variables == null ? null : variables.get(key);
        if (v instanceof String s && !s.isBlank()) {
            return s.trim();
        }
        if (v instanceof Number n) {
            return String.valueOf(n);
        }
        return null;
    }

    /** 样例 1：项目负责人 —— 从流程变量解析（变量名可作为节点参数配置）。 */
    @Component("projectLeaderAssigneeResolver")
    public static class ProjectLeaderResolver implements AssigneeResolver {
        @Override
        public String name() {
            return "project_leader_resolver";
        }

        @Override
        public String displayName() {
            return "项目负责人";
        }

        @Override
        public String description() {
            return "从流程变量中解析项目负责人；变量名可在下方参数中调整（缺省 project_manager_id）";
        }

        @Override
        public List<AssigneeParamDef> paramDefs() {
            return List.of(new AssigneeParamDef(
                    "variableName", "流程变量名", "string", true,
                    "如：project_manager_id", "project_manager_id", null,
                    "存放项目负责人用户 ID 的流程变量（发起表单字段名或服务预置变量名）"));
        }

        @Override
        public List<String> resolve(AssigneeResolveContext ctx, Map<String, Object> params) {
            String variableName = params == null || params.get("variableName") == null
                    || String.valueOf(params.get("variableName")).isBlank()
                    ? "project_manager_id" : String.valueOf(params.get("variableName")).trim();
            String leader = variableAsString(ctx.variables(), variableName);
            return leader == null ? List.of() : List.of(leader);
        }
    }

    /** 样例 2：固定用户组 —— 按参数返回固定用户（演示 string + select 参数）。 */
    @Component("fixedUserGroupAssigneeResolver")
    public static class FixedUserGroupResolver implements AssigneeResolver {
        @Override
        public String name() {
            return "fixed_user_group";
        }

        @Override
        public String displayName() {
            return "固定用户组";
        }

        @Override
        public String description() {
            return "返回参数中配置的固定用户（英文逗号分隔），适合演示参数化选人与兜底场景";
        }

        @Override
        public List<AssigneeParamDef> paramDefs() {
            return List.of(
                    new AssigneeParamDef(
                            "userIds", "用户 ID 列表", "string", true,
                            "如：1,2,3", null, null, "英文逗号分隔的用户 ID"),
                    new AssigneeParamDef(
                            "returnMode", "返回模式", "select", null,
                            null, "all",
                            List.of(new AssigneeParamDef.Option("全部用户（或签/会签）", "all"),
                                    new AssigneeParamDef.Option("仅第一个用户", "first")),
                            null));
        }

        @Override
        public List<String> resolve(AssigneeResolveContext ctx, Map<String, Object> params) {
            String raw = params == null || params.get("userIds") == null
                    ? null : String.valueOf(params.get("userIds"));
            List<String> users = splitUsers(raw);
            if (users.isEmpty()) {
                return List.of();
            }
            String mode = params == null || params.get("returnMode") == null
                    ? "all" : String.valueOf(params.get("returnMode"));
            return "first".equalsIgnoreCase(mode) ? users.subList(0, 1) : users;
        }
    }

    /** 样例 3：顺序轮选 —— 从候选列表按序号取一人（演示 number 参数）。 */
    @Component("roundRobinAssigneeResolver")
    public static class RoundRobinResolver implements AssigneeResolver {
        @Override
        public String name() {
            return "round_robin_picker";
        }

        @Override
        public String displayName() {
            return "顺序轮选";
        }

        @Override
        public String description() {
            return "在候选用户列表中按序号取一人（超过列表长度时取模轮回），可做简单分流";
        }

        @Override
        public List<AssigneeParamDef> paramDefs() {
            return List.of(
                    new AssigneeParamDef(
                            "userIds", "候选用户列表", "string", true,
                            "如：101,102,103", null, null, "英文逗号分隔的用户 ID"),
                    new AssigneeParamDef(
                            "startIndex", "起始序号", "number", null,
                            "从 1 开始", 1, null, "取列表中第 N 个用户（超出长度自动取模）"));
        }

        @Override
        public List<String> resolve(AssigneeResolveContext ctx, Map<String, Object> params) {
            String raw = params == null || params.get("userIds") == null
                    ? null : String.valueOf(params.get("userIds"));
            List<String> users = splitUsers(raw);
            if (users.isEmpty()) {
                return List.of();
            }
            int start = 1;
            if (params != null && params.get("startIndex") instanceof Number n) {
                start = (int) n.longValue();
            } else if (params != null && params.get("startIndex") instanceof String s) {
                try {
                    start = Integer.parseInt(s.trim());
                } catch (NumberFormatException e) {
                    start = 1;
                }
            }
            if (start < 1) {
                start = 1;
            }
            return List.of(users.get((start - 1) % users.size()));
        }
    }
}
