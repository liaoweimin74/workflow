package com.workflow.system.service;

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
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserServiceBatchTest {

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
    void findByIds_returnsExistingUsers_skipsMissing() {
        SysUser u1 = new SysUser();
        u1.setId(1L);
        u1.setUsername("user1");
        u1.setOrgId(10L);
        SysUser u2 = new SysUser();
        u2.setId(2L);
        u2.setUsername("user2");
        when(userRepository.findAllById(List.of(1L, 2L, 999L)))
                .thenReturn(List.of(u1, u2));
        when(userRoleRepository.findByUserId(anyLong())).thenReturn(List.of());

        List<UserVO> result = userService.findByIds(List.of(1L, 2L, 999L));

        assertThat(result).hasSize(2);
        assertThat(result).extracting(UserVO::id).containsExactlyInAnyOrder(1L, 2L);
    }

    @Test
    void findByIds_emptyList_returnsEmpty() {
        List<UserVO> result = userService.findByIds(List.of());

        assertThat(result).isEmpty();
    }

    @Test
    void findByIds_nullList_returnsEmpty() {
        List<UserVO> result = userService.findByIds(null);

        assertThat(result).isEmpty();
    }
}
