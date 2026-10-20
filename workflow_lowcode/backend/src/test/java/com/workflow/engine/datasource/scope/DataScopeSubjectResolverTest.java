package com.workflow.engine.datasource.scope;

import com.workflow.framework.security.domain.LoginUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 主体摊平：当前只按角色收紧行权限，一个用户 = 他所拥有角色的标识集合。
 */
class DataScopeSubjectResolverTest {

    private DataScopeSubjectResolver resolver;

    @BeforeEach
    void setUp() {
        resolver = new DataScopeSubjectResolver();
    }

    private LoginUser user(Long userId, List<String> roles, Long orgId) {
        LoginUser loginUser = new LoginUser(userId, "u" + userId, null, roles, Set.of(), true);
        loginUser.setOrgId(orgId);
        return loginUser;
    }

    @Test
    void flattens_roles_and_deduplicates() {
        Set<String> subjects = resolver.subjectsOf(
                user(200L, List.of("clerk", "auditor", "clerk"), 77L));

        assertEquals(Set.of("ROLE:clerk", "ROLE:auditor"), subjects);
    }

    @Test
    void skips_blank_roles_instead_of_emitting_null_keys() {
        Set<String> subjects = resolver.subjectsOf(user(200L, List.of(" ", "clerk"), null));

        assertEquals(Set.of("ROLE:clerk"), subjects);
    }

    @Test
    void id_and_org_are_not_subjects_anymore() {
        Set<String> subjects = resolver.subjectsOf(user(200L, List.of(), 77L));

        assertTrue(subjects.isEmpty());
    }

    @Test
    void null_user_yields_no_subjects() {
        assertTrue(resolver.subjectsOf(null).isEmpty());
    }

    @Test
    void missing_role_list_yields_no_subjects() {
        LoginUser loginUser = new LoginUser(200L, "u200", null, null, Set.of(), true);

        assertTrue(resolver.subjectsOf(loginUser).isEmpty());
    }
}
