package com.workflow.system.service.impl;

import com.workflow.common.exception.BusinessException;
import com.workflow.framework.security.ClientCrypto;
import com.workflow.framework.security.jwt.JwtTokenProvider;
import com.workflow.system.domain.dto.ChangePasswordRequest;
import com.workflow.system.domain.entity.SysUser;
import com.workflow.system.repository.*;
import com.workflow.system.service.BindCodeService;
import com.workflow.system.service.WechatMiniprogramClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 本人改密单元测试。
 * 验证：旧密码必须验真、新旧不能相同、账号不存在/已禁用不改数据、成功时写入的是新密码的编码值。
 */
class AuthServiceImplChangePasswordTest {

    private static final Long USER_ID = 7L;
    private static final String OLD_HASH = "encoded-old";
    private static final String OLD_PASSWORD = "old-pass-1";
    private static final String NEW_PASSWORD = "new-pass-1";
    private static final String NEW_HASH = "encoded-new";
    private static final String TEST_KEY = "d29ya2Zsb3ctY2xpZW50LWNyeXB0by1kZXYta2V5MzI=";

    private SysUserRepository userRepository;
    private JwtTokenProvider jwtTokenProvider;
    private PasswordEncoder passwordEncoder;
    private AuthServiceImpl service;

    @BeforeEach
    void setUp() {
        userRepository = mock(SysUserRepository.class);
        SysRoleRepository roleRepository = mock(SysRoleRepository.class);
        SysMenuRepository menuRepository = mock(SysMenuRepository.class);
        SysUserRoleRepository userRoleRepository = mock(SysUserRoleRepository.class);
        SysRoleMenuRepository roleMenuRepository = mock(SysRoleMenuRepository.class);
        SysOrganizationRepository orgRepository = mock(SysOrganizationRepository.class);
        SysUserOpenidRepository openidRepository = mock(SysUserOpenidRepository.class);
        SysClientChannelRepository channelRepository = mock(SysClientChannelRepository.class);
        WechatMiniprogramClient miniprogramClient = mock(WechatMiniprogramClient.class);
        jwtTokenProvider = mock(JwtTokenProvider.class);
        passwordEncoder = mock(PasswordEncoder.class);
        service = new AuthServiceImpl(userRepository, roleRepository, menuRepository, userRoleRepository,
                roleMenuRepository, orgRepository, openidRepository, channelRepository,
                miniprogramClient, new ClientCrypto(TEST_KEY), mock(BindCodeService.class),
                jwtTokenProvider, passwordEncoder);

        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(activeUser()));
    }

    @Test
    void changePassword_writes_encoded_new_password() {
        when(passwordEncoder.matches(OLD_PASSWORD, OLD_HASH)).thenReturn(true);
        when(passwordEncoder.matches(NEW_PASSWORD, OLD_HASH)).thenReturn(false);
        when(passwordEncoder.encode(NEW_PASSWORD)).thenReturn(NEW_HASH);

        service.changePassword(USER_ID, new ChangePasswordRequest(OLD_PASSWORD, NEW_PASSWORD));

        ArgumentCaptor<SysUser> captor = ArgumentCaptor.forClass(SysUser.class);
        verify(userRepository).save(captor.capture());
        assertEquals(NEW_HASH, captor.getValue().getPassword());
    }

    @Test
    void changePassword_wrong_old_password_keeps_stored_hash() {
        when(passwordEncoder.matches("wrong", OLD_HASH)).thenReturn(false);

        BusinessException e = assertThrows(BusinessException.class, () ->
                service.changePassword(USER_ID, new ChangePasswordRequest("wrong", NEW_PASSWORD)));

        assertEquals(400, e.getCode());
        assertEquals("旧密码不正确", e.getMessage());
        verify(userRepository, never()).save(any());
    }

    @Test
    void changePassword_rejects_same_as_old_password() {
        when(passwordEncoder.matches(OLD_PASSWORD, OLD_HASH)).thenReturn(true);

        BusinessException e = assertThrows(BusinessException.class, () ->
                service.changePassword(USER_ID, new ChangePasswordRequest(OLD_PASSWORD, OLD_PASSWORD)));

        assertEquals(400, e.getCode());
        assertEquals("新密码不能与旧密码相同", e.getMessage());
        verify(userRepository, never()).save(any());
    }

    @Test
    void changePassword_missing_user_is_401() {
        when(userRepository.findById(99L)).thenReturn(Optional.empty());

        BusinessException e = assertThrows(BusinessException.class, () ->
                service.changePassword(99L, new ChangePasswordRequest(OLD_PASSWORD, NEW_PASSWORD)));

        assertEquals(401, e.getCode());
        verify(userRepository, never()).save(any());
    }

    @Test
    void changePassword_disabled_user_is_403() {
        SysUser disabled = activeUser();
        disabled.setStatus(0);
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(disabled));

        BusinessException e = assertThrows(BusinessException.class, () ->
                service.changePassword(USER_ID, new ChangePasswordRequest(OLD_PASSWORD, NEW_PASSWORD)));

        assertEquals(403, e.getCode());
        verify(userRepository, never()).save(any());
    }

    private SysUser activeUser() {
        SysUser user = new SysUser();
        user.setId(USER_ID);
        user.setUsername("zhangsan");
        user.setPassword(OLD_HASH);
        user.setStatus(1);
        return user;
    }
}
