package com.workflow.engine.datasource.scope;

import com.workflow.common.exception.BusinessException;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.system.domain.entity.SysOrganization;
import com.workflow.system.repository.SysOrganizationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 取值变量：白名单、标量/集合形态、子树 BFS 与上限保护。 */
class DataScopeVariablesTest {

    private SysOrganizationRepository organizationRepository;
    private DataScopeVariables variables;

    @BeforeEach
    void setUp() {
        organizationRepository = mock(SysOrganizationRepository.class);
        variables = new DataScopeVariables(organizationRepository);
    }

    @Test
    void scalar_variables_resolve_to_strings() {
        assertEquals("200", variables.resolve(DataScopeVariables.USER_ID, user(200L, "u200", 77L)));
        assertEquals("u200", variables.resolve(DataScopeVariables.USERNAME, user(200L, "u200", 77L)));
        assertEquals("77", variables.resolve(DataScopeVariables.ORG_ID, user(200L, "u200", 77L)));
    }

    @Test
    void userId_requires_a_login_and_username_requires_a_name() {
        BusinessException noUser = assertThrows(BusinessException.class,
                () -> variables.resolve(DataScopeVariables.USER_ID, null));
        assertEquals(403, noUser.getCode());

        BusinessException noName = assertThrows(BusinessException.class,
                () -> variables.resolve(DataScopeVariables.USERNAME, user(200L, null, 77L)));
        assertEquals(400, noName.getCode());
        assertTrue(noName.getMessage().contains("无取值"), noName.getMessage());
    }

    @Test
    void org_variables_require_an_org_on_the_login_user() {
        BusinessException e = assertThrows(BusinessException.class,
                () -> variables.resolve(DataScopeVariables.ORG_ID, user(200L, "u200", null)));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("未归属任何组织"), e.getMessage());
    }

    @Test
    void subtree_includes_self_children_and_grandchildren_skipping_deleted() {
        when(organizationRepository.findByParentIdOrderBySortOrder(77L))
                .thenReturn(List.of(org(78L, 77L), org(79L, 77L), org(90L, 77L, 1)));
        when(organizationRepository.findByParentIdOrderBySortOrder(78L))
                .thenReturn(List.of(org(80L, 78L)));

        Object value = variables.resolve(DataScopeVariables.ORG_ID_SUBTREE, user(200L, "u200", 77L));

        assertEquals(List.of("77", "78", "79", "80"), value);
    }

    @Test
    void subtree_over_the_cap_fails_fast_instead_of_truncating() {
        List<SysOrganization> children = new ArrayList<>();
        for (long id = 1; id <= DataScopeVariables.SUBTREE_LIMIT; id++) {
            children.add(org(1000L + id, 77L));
        }
        when(organizationRepository.findByParentIdOrderBySortOrder(77L)).thenReturn(children);

        BusinessException e = assertThrows(BusinessException.class,
                () -> variables.resolve(DataScopeVariables.ORG_ID_SUBTREE, user(200L, "u200", 77L)));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains(String.valueOf(DataScopeVariables.SUBTREE_LIMIT)), e.getMessage());
    }

    @Test
    void only_the_subtree_variable_is_a_collection() {
        assertTrue(DataScopeVariables.isListVariable(DataScopeVariables.ORG_ID_SUBTREE));
        assertFalse(DataScopeVariables.isListVariable(DataScopeVariables.USER_ID));
        assertFalse(DataScopeVariables.isListVariable(DataScopeVariables.ORG_ID));
    }

    @Test
    void unknown_variable_fails_fast() {
        BusinessException e = assertThrows(BusinessException.class,
                () -> variables.resolve("tenantId", user(200L, "u200", 77L)));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("未知变量"), e.getMessage());
    }

    private LoginUser user(Long userId, String username, Long orgId) {
        LoginUser loginUser = new LoginUser(userId, username, null, List.of("clerk"), Set.of(), true);
        loginUser.setOrgId(orgId);
        return loginUser;
    }

    private SysOrganization org(Long id, Long parentId) {
        return org(id, parentId, 0);
    }

    private SysOrganization org(Long id, Long parentId, int deleted) {
        SysOrganization org = new SysOrganization();
        org.setId(id);
        org.setParentId(parentId);
        org.setOrgName("org-" + id);
        org.setOrgCode("code-" + id);
        org.setIsDeleted(deleted);
        return org;
    }
}
