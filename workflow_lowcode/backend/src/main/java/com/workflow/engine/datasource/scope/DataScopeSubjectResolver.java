package com.workflow.engine.datasource.scope;

import com.workflow.framework.security.domain.LoginUser;
import com.workflow.system.domain.entity.SysMemberGroupMember;
import com.workflow.system.repository.SysMemberGroupMemberRepository;
import org.springframework.stereotype.Component;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/**
 * 把登录主体摊平成数据范围可匹配的主体标识集合（{@code TYPE:key}）。
 *
 * <p>一个用户可以同时命中多条规则（角色 + 本人 + 组织 + 成员组），
 * 命中集合由 {@code DataScopeService} 取最宽的一条生效。
 */
@Component
public class DataScopeSubjectResolver {

    private final SysMemberGroupMemberRepository memberRepository;

    public DataScopeSubjectResolver(SysMemberGroupMemberRepository memberRepository) {
        this.memberRepository = memberRepository;
    }

    public Set<String> subjectsOf(LoginUser user) {
        Set<String> out = new LinkedHashSet<>();
        if (user == null) {
            return out;
        }
        if (user.getRoles() != null) {
            for (String role : user.getRoles()) {
                if (role != null && !role.isBlank()) {
                    out.add(DataScopeSubject.ROLE.name() + ":" + role);
                }
            }
        }
        if (user.getUserId() != null) {
            out.add(DataScopeSubject.USER.name() + ":" + user.getUserId());
        }
        if (user.getOrgId() != null) {
            out.add(DataScopeSubject.ORG.name() + ":" + user.getOrgId());
        }
        for (String group : memberGroupKeysOf(user.getUserId())) {
            out.add(DataScopeSubject.MEMBER_GROUP.name() + ":" + group);
        }
        return out;
    }

    /** 用户所属的有效成员组 id。 */
    private List<String> memberGroupKeysOf(Long userId) {
        if (userId == null) {
            return List.of();
        }
        try {
            return memberRepository.findByUserIdAndIsDeleted(userId, 0).stream()
                    .map(SysMemberGroupMember::getGroupId)
                    .filter(Objects::nonNull)
                    .map(String::valueOf)
                    .distinct()
                    .toList();
        } catch (Exception e) {
            // 与 RoleMembershipResolver 口径一致：查询失败只少一个可命中主体，不放大权限
            return List.of();
        }
    }
}
