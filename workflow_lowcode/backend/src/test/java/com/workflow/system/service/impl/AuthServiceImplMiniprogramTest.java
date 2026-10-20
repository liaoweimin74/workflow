package com.workflow.system.service.impl;

import com.workflow.common.exception.BusinessException;
import com.workflow.framework.security.jwt.JwtTokenProvider;
import com.workflow.system.domain.entity.SysUser;
import com.workflow.system.domain.entity.SysUserOpenid;
import com.workflow.system.domain.vo.LoginResponse;
import com.workflow.system.repository.*;
import com.workflow.system.service.WechatMiniprogramClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AuthServiceImplMiniprogramTest {

    private static final String APP_ID = "wx-app";
    private static final String OPENID = "openid-1";
    private static final String CODE = "CODE-1";

    private SysUserRepository userRepository;
    private SysRoleRepository roleRepository;
    private SysMenuRepository menuRepository;
    private SysUserRoleRepository userRoleRepository;
    private SysRoleMenuRepository roleMenuRepository;
    private SysOrganizationRepository orgRepository;
    private SysUserOpenidRepository openidRepository;
    private WechatMiniprogramClient miniprogramClient;
    private JwtTokenProvider jwtTokenProvider;
    private PasswordEncoder passwordEncoder;
    private AuthServiceImpl service;

    @BeforeEach
    void setUp() {
        userRepository = mock(SysUserRepository.class);
        roleRepository = mock(SysRoleRepository.class);
        menuRepository = mock(SysMenuRepository.class);
        userRoleRepository = mock(SysUserRoleRepository.class);
        roleMenuRepository = mock(SysRoleMenuRepository.class);
        orgRepository = mock(SysOrganizationRepository.class);
        openidRepository = mock(SysUserOpenidRepository.class);
        miniprogramClient = mock(WechatMiniprogramClient.class);
        jwtTokenProvider = mock(JwtTokenProvider.class);
        passwordEncoder = mock(PasswordEncoder.class);
        service = new AuthServiceImpl(userRepository, roleRepository, menuRepository, userRoleRepository,
                roleMenuRepository, orgRepository, openidRepository, miniprogramClient,
                jwtTokenProvider, passwordEncoder);

        when(miniprogramClient.code2Session(CODE))
                .thenReturn(new WechatMiniprogramClient.SessionInfo(APP_ID, OPENID, "union-1"));
        when(userRoleRepository.findByUserId(any())).thenReturn(List.of());
        when(roleRepository.findAllById(any())).thenReturn(List.of());
        when(roleMenuRepository.findByRoleIdIn(any())).thenReturn(List.of());
        when(menuRepository.findAllById(any())).thenReturn(List.of());
        when(jwtTokenProvider.createAccessToken(any(), any())).thenReturn("access-token");
        when(jwtTokenProvider.createRefreshToken(any(), any())).thenReturn("refresh-token");
    }

    @Test
    void loginByMiniprogram_issues_tokens_for_bound_active_user() {
        when(openidRepository.findByAppIdAndOpenidAndIsDeleted(APP_ID, OPENID, 0))
                .thenReturn(Optional.of(binding(7L)));
        when(userRepository.findById(7L)).thenReturn(Optional.of(user(7L, "customer", 1)));

        LoginResponse response = service.loginByMiniprogram(CODE);

        assertEquals("access-token", response.accessToken());
        assertEquals("refresh-token", response.refreshToken());
        assertEquals(7L, response.user().id());
        assertEquals("customer", response.user().username());
    }

    @Test
    void loginByMiniprogram_unbound_openid_is_401() {
        when(openidRepository.findByAppIdAndOpenidAndIsDeleted(APP_ID, OPENID, 0)).thenReturn(Optional.empty());

        BusinessException e = assertThrows(BusinessException.class, () -> service.loginByMiniprogram(CODE));

        assertEquals(401, e.getCode());
        assertEquals("该微信未绑定平台账号，请先使用账号密码绑定", e.getMessage());
        verify(userRepository, never()).findById(any());
    }

    @Test
    void loginByMiniprogram_disabled_user_is_403() {
        when(openidRepository.findByAppIdAndOpenidAndIsDeleted(APP_ID, OPENID, 0))
                .thenReturn(Optional.of(binding(7L)));
        when(userRepository.findById(7L)).thenReturn(Optional.of(user(7L, "customer", 0)));

        BusinessException e = assertThrows(BusinessException.class, () -> service.loginByMiniprogram(CODE));

        assertEquals(403, e.getCode());
    }

    @Test
    void bindMiniprogram_creates_binding_and_returns_tokens() {
        SysUser user = user(7L, "customer", 1);
        when(userRepository.findByUsername("customer")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("secret", "encoded")).thenReturn(true);
        when(openidRepository.findByAppIdAndOpenidAndIsDeleted(APP_ID, OPENID, 0)).thenReturn(Optional.empty());
        when(openidRepository.findByAppIdAndUserIdAndIsDeleted(APP_ID, 7L, 0)).thenReturn(Optional.empty());
        when(openidRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        LoginResponse response = service.bindMiniprogram(CODE, "customer", "secret");

        assertEquals("access-token", response.accessToken());
        assertEquals(7L, response.user().id());
        ArgumentCaptor<SysUserOpenid> captor = ArgumentCaptor.forClass(SysUserOpenid.class);
        verify(openidRepository).save(captor.capture());
        assertEquals(7L, captor.getValue().getUserId());
        assertEquals(APP_ID, captor.getValue().getAppId());
        assertEquals(OPENID, captor.getValue().getOpenid());
        assertEquals("union-1", captor.getValue().getUnionid());
    }

    @Test
    void bindMiniprogram_wrong_password_does_not_create_binding() {
        when(userRepository.findByUsername("customer")).thenReturn(Optional.of(user(7L, "customer", 1)));
        when(passwordEncoder.matches("wrong", "encoded")).thenReturn(false);

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.bindMiniprogram(CODE, "customer", "wrong"));

        assertEquals(401, e.getCode());
        verify(openidRepository, never()).save(any());
    }

    @Test
    void bindMiniprogram_rejects_openid_bound_to_another_user() {
        when(userRepository.findByUsername("customer")).thenReturn(Optional.of(user(7L, "customer", 1)));
        when(passwordEncoder.matches("secret", "encoded")).thenReturn(true);
        when(openidRepository.findByAppIdAndOpenidAndIsDeleted(APP_ID, OPENID, 0))
                .thenReturn(Optional.of(binding(8L)));

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.bindMiniprogram(CODE, "customer", "secret"));

        assertEquals(409, e.getCode());
        verify(openidRepository, never()).save(any());
    }

    @Test
    void bindMiniprogram_rejects_user_bound_to_another_openid() {
        when(userRepository.findByUsername("customer")).thenReturn(Optional.of(user(7L, "customer", 1)));
        when(passwordEncoder.matches("secret", "encoded")).thenReturn(true);
        when(openidRepository.findByAppIdAndOpenidAndIsDeleted(APP_ID, OPENID, 0)).thenReturn(Optional.empty());
        SysUserOpenid other = binding(7L);
        other.setOpenid("openid-old");
        when(openidRepository.findByAppIdAndUserIdAndIsDeleted(APP_ID, 7L, 0)).thenReturn(Optional.of(other));

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.bindMiniprogram(CODE, "customer", "secret"));

        assertEquals(409, e.getCode());
        verify(openidRepository, never()).save(any());
    }

    @Test
    void bindMiniprogram_is_idempotent_for_same_user() {
        when(userRepository.findByUsername("customer")).thenReturn(Optional.of(user(7L, "customer", 1)));
        when(passwordEncoder.matches("secret", "encoded")).thenReturn(true);
        when(openidRepository.findByAppIdAndOpenidAndIsDeleted(APP_ID, OPENID, 0))
                .thenReturn(Optional.of(binding(7L)));

        LoginResponse response = service.bindMiniprogram(CODE, "customer", "secret");

        assertNotNull(response.accessToken());
        verify(openidRepository, never()).save(any());
    }

    private SysUser user(Long id, String username, int status) {
        SysUser user = new SysUser();
        user.setId(id);
        user.setUsername(username);
        user.setNickname("客户A");
        user.setPassword("encoded");
        user.setStatus(status);
        return user;
    }

    private SysUserOpenid binding(Long userId) {
        SysUserOpenid binding = new SysUserOpenid();
        binding.setUserId(userId);
        binding.setAppId(APP_ID);
        binding.setOpenid(OPENID);
        return binding;
    }
}
