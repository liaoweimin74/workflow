package com.workflow.engine.datasource.scope;

import com.workflow.common.exception.BusinessException;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.system.domain.entity.SysOrganization;
import com.workflow.system.repository.SysOrganizationRepository;
import org.springframework.stereotype.Component;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 数据范围取值的变量求值：把「当前用户 / 所属部门 / 部门及下级」从配置值变为运行时取值。
 *
 * <p>协议只有一种写法——{@code {变量名}}，出现在取值里就地替换，可以与字面量拼接
 * （例如 LIKE 配 {@code {orgId}/%}）。例外是<b>集合变量</b>{@link #ORG_ID_SUBTREE}：
 * 它展开成一批 id，只能独占一个取值项并由 {@code in} 运算符承载，
 * 拼接语义（"前缀{orgIdSubtree}"）没有对应的 SQL 形状，一律拒绝而不是静默取首个 id。
 *
 * <p>展开出的 id 一律是字符串：{@code created_by} 是 VARCHAR(50)，且 MySQL 对「VARCHAR 列 = 数字」
 * 会把列转成数字比较，导致索引失效。
 */
@Component
public class DataScopeVariables {

    /** 标量变量：当前用户 id / 用户名 / 所属部门 id。 */
    public static final String USER_ID = "userId";
    public static final String USERNAME = "username";
    public static final String ORG_ID = "orgId";

    /** 集合变量：当前用户所属部门及其全部下级部门 id，只能配 {@code in}。 */
    public static final String ORG_ID_SUBTREE = "orgIdSubtree";

    /** 变量白名单（保存与解析两侧共用，未知变量一律拒绝，避免「存得进去、跑起来才炸」）。 */
    public static final Set<String> KNOWN = Set.of(USER_ID, USERNAME, ORG_ID, ORG_ID_SUBTREE);

    /** 展开为一批 id 的变量；{@code in} 之外的运算符用它属于配置错误。 */
    public static final Set<String> LIST = Set.of(ORG_ID_SUBTREE);

    /** 子树展开上限：超出即拒绝，绝不截断——截断后的 in 列表会静默少看一批部门。 */
    public static final int SUBTREE_LIMIT = 500;

    private final SysOrganizationRepository organizationRepository;

    public DataScopeVariables(SysOrganizationRepository organizationRepository) {
        this.organizationRepository = organizationRepository;
    }

    /** 该变量是否集合变量（只能独占一个取值项、配 in）。 */
    public static boolean isListVariable(String name) {
        return LIST.contains(name);
    }

    /**
     * 求值：标量变量返回 String，集合变量返回 {@code List<String>}。
     * 无身份、无组织、子树超限一律快速失败，绝不降级为空值——空值等于范围失效。
     */
    public Object resolve(String name, LoginUser user) {
        return switch (name) {
            case USER_ID -> requireUserId(user);
            case USERNAME -> requireUsername(user);
            case ORG_ID -> String.valueOf(requireOrgId(user));
            case ORG_ID_SUBTREE -> subtreeOf(requireOrgId(user));
            default -> throw new BusinessException(400, "数据范围取值使用了未知变量: {" + name + "}");
        };
    }

    private String requireUserId(LoginUser user) {
        if (user == null || user.getUserId() == null) {
            throw new BusinessException(403, "数据范围需要登录用户身份");
        }
        return String.valueOf(user.getUserId());
    }

    private String requireUsername(LoginUser user) {
        if (user == null || user.getUsername() == null || user.getUsername().isBlank()) {
            throw new BusinessException(400, "数据范围变量 {username} 当前用户无取值，请改用其他列或调整配置");
        }
        return user.getUsername();
    }

    private Long requireOrgId(LoginUser user) {
        if (user == null) {
            throw new BusinessException(403, "数据范围需要登录用户身份");
        }
        if (user.getOrgId() == null) {
            throw new BusinessException(400, "当前用户未归属任何组织，无法解析 {orgIdSubtree} / {orgId}，请改用其他列或调整配置");
        }
        return user.getOrgId();
    }

    /** 含本部门的子树 id（BFS，跳过已删除组织）。 */
    private List<String> subtreeOf(Long rootId) {
        List<String> ids = new ArrayList<>();
        Set<Long> visited = new HashSet<>();
        Deque<Long> queue = new ArrayDeque<>();
        queue.add(rootId);
        visited.add(rootId);
        while (!queue.isEmpty()) {
            Long current = queue.poll();
            ids.add(String.valueOf(current));
            if (ids.size() > SUBTREE_LIMIT) {
                throw new BusinessException(400,
                        "当前用户所在组织及下级超过 " + SUBTREE_LIMIT + " 个，无法用于数据范围（{orgIdSubtree}）");
            }
            for (SysOrganization child : organizationRepository.findByParentIdOrderBySortOrder(current)) {
                if (child.getId() != null && !Integer.valueOf(1).equals(child.getIsDeleted())
                        && visited.add(child.getId())) {
                    queue.add(child.getId());
                }
            }
        }
        return ids;
    }
}
