package com.workflow.engine.datasource.scope;

import com.workflow.framework.security.domain.LoginUser;
import com.workflow.system.domain.entity.SysMemberGroupMember;
import com.workflow.system.repository.SysMemberGroupMemberRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 主体摊平：一个用户 = 角色 + 本人 + 组织 + 成员组的标识集合。
 */
class DataScopeSubjectResolverTest {

    private SysMemberGroupMemberRepository memberRepository;
    private DataScopeSubjectResolver resolver;

    @BeforeEach
    void setUp() {
        memberRepository = mock(SysMemberGroupMemberRepository.class);
        resolver = new DataScopeSubjectResolver(memberRepository);
    }

    private LoginUser user(Long userId, List<String> roles, Long orgId) {
        LoginUser loginUser = new LoginUser(userId, "u" + userId, null, roles, Set.of(), true);
        loginUser.setOrgId(orgId);
        return loginUser;
    }

    private SysMemberGroupMember memberOf(Long groupId) {
        SysMemberGroupMember member = new SysMemberGroupMember();
        member.setGroupId(groupId);
        return member;
    }

    @Test
    void flattens_all_four_subject_axes() {
        when(memberRepository.findByUserIdAndIsDeleted(200L, 0))
                .thenReturn(List.of(memberOf(9L), memberOf(10L), memberOf(9L)));

        Set<String> subjects = resolver.subjectsOf(user(200L, List.of("clerk", "auditor"), 77L));

        assertEquals(Set.of("ROLE:clerk", "ROLE:auditor", "USER:200", "ORG:77",
                "MEMBER_GROUP:9", "MEMBER_GROUP:10"), subjects);
    }

    @Test
    void skips_missing_axes_instead_of_emitting_null_keys() {
        when(memberRepository.findByUserIdAndIsDeleted(200L, 0)).thenReturn(List.of());

        Set<String> subjects = resolver.subjectsOf(user(200L, List.of(" ", "clerk"), null));

        assertEquals(Set.of("ROLE:clerk", "USER:200"), subjects);
    }

    @Test
    void null_user_yields_no_subjects() {
        assertTrue(resolver.subjectsOf(null).isEmpty());
    }

    @Test
    void member_group_lookup_failure_does_not_widen_or_break_subjects() {
        when(memberRepository.findByUserIdAndIsDeleted(200L, 0)).thenThrow(new RuntimeException("db down"));

        Set<String> subjects = resolver.subjectsOf(user(200L, List.of("clerk"), null));

        assertEquals(Set.of("ROLE:clerk", "USER:200"), subjects);
    }

    @Test
    void no_user_id_skips_member_group_query() {
        Set<String> subjects = resolver.subjectsOf(new LoginUser(null, "anonymous", null, List.of(), Set.of(), true));

        assertTrue(subjects.isEmpty());
    }
}
