package com.workflow.system.service;

import com.workflow.common.domain.PageResult;
import com.workflow.system.domain.dto.UserQueryRequest;
import com.workflow.system.domain.entity.SysUser;
import com.workflow.system.domain.vo.UserVO;
import com.workflow.system.repository.SysOrganizationRepository;
import com.workflow.system.repository.SysUserRepository;
import com.workflow.system.repository.SysUserRoleRepository;
import com.workflow.system.service.impl.UserServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserServiceQueryTest {

    @Mock
    SysUserRepository userRepository;
    @Mock
    SysUserRoleRepository userRoleRepository;
    @Mock
    SysOrganizationRepository orgRepository;
    @Mock
    PasswordEncoder passwordEncoder;

    @InjectMocks
    UserServiceImpl userService;

    @Test
    void list_byOrgIds_returnsUsersInThoseOrgs() {
        SysUser u1 = new SysUser();
        u1.setId(1L);
        u1.setOrgId(10L);
        Page<SysUser> page = new PageImpl<>(List.of(u1));
        when(userRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(page);
        when(userRoleRepository.findByUserId(1L)).thenReturn(List.of());

        UserQueryRequest req = new UserQueryRequest(null, null, null, List.of(10L, 20L), null, 1, 10);
        PageResult<UserVO> result = userService.list(req);

        assertThat(result.getRows()).hasSize(1);
        assertThat(result.getRows().get(0).id()).isEqualTo(1L);
    }

    @Test
    void list_byRoleIds_returnsUsersWithThoseRoles() {
        SysUser u1 = new SysUser();
        u1.setId(1L);
        Page<SysUser> page = new PageImpl<>(List.of(u1));
        when(userRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(page);
        when(userRoleRepository.findByUserId(1L)).thenReturn(List.of());

        UserQueryRequest req = new UserQueryRequest(null, null, null, null, List.of(5L), 1, 10);
        PageResult<UserVO> result = userService.list(req);

        assertThat(result.getRows()).hasSize(1);
    }

    @Test
    void list_orgIdsAndRoleIds_bothNull_behavesAsBefore() {
        SysUser u1 = new SysUser();
        u1.setId(1L);
        Page<SysUser> page = new PageImpl<>(List.of(u1));
        when(userRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(page);
        when(userRoleRepository.findByUserId(1L)).thenReturn(List.of());

        UserQueryRequest req = new UserQueryRequest(null, null, null, null, null, 1, 10);
        PageResult<UserVO> result = userService.list(req);

        assertThat(result.getRows()).hasSize(1);
    }

    @Test
    void list_orgIdsAndRoleIds_bothPresent_appliesOrLogic() {
        SysUser u1 = new SysUser();
        u1.setId(1L);
        u1.setOrgId(10L);
        SysUser u2 = new SysUser();
        u2.setId(2L);
        Page<SysUser> page = new PageImpl<>(List.of(u1, u2));
        when(userRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(page);
        when(userRoleRepository.findByUserId(anyLong())).thenReturn(List.of());

        UserQueryRequest req = new UserQueryRequest(null, null, null, List.of(10L), List.of(5L), 1, 10);
        PageResult<UserVO> result = userService.list(req);

        assertThat(result.getRows()).hasSize(2);
    }
}
