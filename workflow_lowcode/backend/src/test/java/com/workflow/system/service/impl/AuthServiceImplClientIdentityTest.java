package com.workflow.system.service.impl;

import com.workflow.common.exception.BusinessException;
import com.workflow.framework.security.ClientCrypto;
import com.workflow.framework.security.jwt.JwtTokenProvider;
import com.workflow.system.domain.dto.ChangePasswordRequest;
import com.workflow.system.domain.dto.ClientBindRequest;
import com.workflow.system.domain.dto.ClientLoginRequest;
import com.workflow.system.domain.dto.ClientUnbindRequest;
import com.workflow.system.domain.dto.LoginRequest;
import com.workflow.system.domain.entity.SysClientChannel;
import com.workflow.system.domain.entity.SysUser;
import com.workflow.system.domain.entity.SysUserOpenid;
import com.workflow.system.domain.vo.LoginResponse;
import com.workflow.system.repository.*;
import com.workflow.system.service.BindCodeService;
import com.workflow.system.service.WechatMiniprogramClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 端身份登录泛化单元测试（J3，spec client-login-identity）。
 *
 * <p>演进自 AuthServiceImplMiniprogramTest（V64 单端链 9 例全部移植到 clientId 维度），
 * 并加超集钉：登录方式门禁（spec「未开通方式拒绝→不进入凭据校验」）、openid 跨端隔离、
 * 绑定码首绑、unbind、portal 存量兼容（config NULL 放行，ledger D3 裁定）。
 */
class AuthServiceImplClientIdentityTest {

    private static final String TEST_KEY = "d29ya2Zsb3ctY2xpZW50LWNyeXB0by1kZXYta2V5MzI=";
    private static final String CLIENT_ID = "wx-app-7";
    private static final String CLIENT_SECRET = "plain-secret-7";
    private static final String OPENID = "openid-1";
    private static final String CODE = "CODE-1";
    private static final Long CLIENT7 = 7L;

    private SysUserRepository userRepository;
    private SysRoleRepository roleRepository;
    private SysMenuRepository menuRepository;
    private SysUserRoleRepository userRoleRepository;
    private SysRoleMenuRepository roleMenuRepository;
    private SysUserOpenidRepository openidRepository;
    private SysClientChannelRepository channelRepository;
    private WechatMiniprogramClient miniprogramClient;
    private ClientCrypto crypto;
    private BindCodeService bindCodeService;
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
        SysOrganizationRepository orgRepository = mock(SysOrganizationRepository.class);
        openidRepository = mock(SysUserOpenidRepository.class);
        channelRepository = mock(SysClientChannelRepository.class);
        miniprogramClient = mock(WechatMiniprogramClient.class);
        crypto = new ClientCrypto(TEST_KEY);
        bindCodeService = mock(BindCodeService.class);
        jwtTokenProvider = mock(JwtTokenProvider.class);
        passwordEncoder = mock(PasswordEncoder.class);
        service = new AuthServiceImpl(userRepository, roleRepository, menuRepository, userRoleRepository,
                roleMenuRepository, orgRepository, openidRepository, channelRepository,
                miniprogramClient, crypto, bindCodeService, jwtTokenProvider, passwordEncoder);

        when(userRoleRepository.findByUserId(any())).thenReturn(List.of());
        when(roleRepository.findAllById(any())).thenReturn(List.of());
        when(roleMenuRepository.findByRoleIdIn(any())).thenReturn(List.of());
        when(menuRepository.findAllById(any())).thenReturn(List.of());
        when(jwtTokenProvider.createAccessToken(any(), any(), any(), any())).thenReturn("access-token");
        when(jwtTokenProvider.createRefreshToken(any(), any(), any(), any())).thenReturn("refresh-token");
    }

    // ------------------------------------------------------------ 工具

    private SysUser user(Long id, String username, int status) {
        SysUser user = new SysUser();
        user.setId(id);
        user.setUsername(username);
        user.setNickname("客户A");
        user.setPassword("encoded");
        user.setStatus(status);
        return user;
    }

    private SysUserOpenid binding(Long clientId, Long userId, String openid) {
        SysUserOpenid binding = new SysUserOpenid();
        binding.setClientId(clientId);
        binding.setUserId(userId);
        binding.setAppId(CLIENT_ID);
        binding.setOpenid(openid);
        return binding;
    }

    private SysClientChannel channel(Long clientId, String type, int enabled, String configJson) {
        SysClientChannel ch = new SysClientChannel();
        ch.setClientId(clientId);
        ch.setChannelType(type);
        ch.setEnabled(enabled);
        ch.setConfigJson(configJson);
        return ch;
    }

    /** MP 端渠道：开通 + openid 静默/绑定码方式 + appid + 密文 secret（J2 存储形态）。 */
    private SysClientChannel mpChannelEnabled(String loginMethodsJson) {
        String secret = crypto.encrypt(CLIENT_SECRET);
        String config = "{\"appid\":\"" + CLIENT_ID + "\",\"secret\":\"" + secret + "\""
                + (loginMethodsJson == null ? "" : ",\"loginMethods\":" + loginMethodsJson) + "}";
        return channel(CLIENT7, "MP", 1, config);
    }

    private void stubSession() {
        when(miniprogramClient.code2Session(CLIENT_ID, CLIENT_SECRET, CODE))
                .thenReturn(new WechatMiniprogramClient.SessionInfo(CLIENT_ID, OPENID, "union-1"));
    }

    // ------------------------------------------------------------ 账密登录门禁（D3：portal 存量兼容）

    @Test
    void login_portalWebChannelConfigNull_stillPasses() {
        // V71 seed：portal WEB 渠道行 enabled=1、config_json NULL → 缺省放行（存量零破坏）
        when(channelRepository.findByClientIdAndChannelType(1L, "WEB"))
                .thenReturn(Optional.of(channel(1L, "WEB", 1, null)));
        when(userRepository.findByUsername("admin")).thenReturn(Optional.of(user(1L, "admin", 1)));
        when(passwordEncoder.matches("pass", "encoded")).thenReturn(true);

        LoginResponse response = service.login(new LoginRequest("admin", "pass"));

        assertThat(response.accessToken()).isEqualTo("access-token");
    }

    @Test
    void login_portalWebLoginMethodsWithoutPwd_403_beforeCredentialCheck() {
        when(channelRepository.findByClientIdAndChannelType(1L, "WEB"))
                .thenReturn(Optional.of(channel(1L, "WEB", 1, "{\"loginMethods\":[\"SMS\"]}")));

        assertThatThrownBy(() -> service.login(new LoginRequest("admin", "pass")))
                .isInstanceOf(BusinessException.class)
                .hasMessage("该端未开通此登录方式")
                .extracting(e -> ((BusinessException) e).getCode()).isEqualTo(403);
        // 未开通不进入凭据校验（spec Scenario「未开通方式拒绝」）
        verify(userRepository, never()).findByUsername(anyString());
    }

    @Test
    void login_channelRowMissing_rejected() {
        when(channelRepository.findByClientIdAndChannelType(1L, "WEB")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.login(new LoginRequest("admin", "pass")))
                .isInstanceOf(BusinessException.class)
                .hasMessage("该端未开通此登录方式");
    }

    // ------------------------------------------------------------ clientLogin（MP openid 静默）

    @Test
    void clientLogin_methodNotEnabled_rejectedBeforeCodeExchange() {
        // MP 只勾 BIND_CODE，openid 静默未开通 → 拒绝且不换 session（不进入凭据校验）
        when(channelRepository.findByClientIdAndChannelType(CLIENT7, "MP"))
                .thenReturn(Optional.of(mpChannelEnabled("[\"BIND_CODE\"]")));

        assertThatThrownBy(() -> service.clientLogin(new ClientLoginRequest(CLIENT7, "MP", CODE)))
                .isInstanceOf(BusinessException.class)
                .hasMessage("该端未开通此登录方式")
                .extracting(e -> ((BusinessException) e).getCode()).isEqualTo(403);
        verify(miniprogramClient, never()).code2Session(anyString(), anyString(), anyString());
    }

    @Test
    void clientLogin_channelDisabled_rejected() {
        when(channelRepository.findByClientIdAndChannelType(CLIENT7, "MP"))
                .thenReturn(Optional.of(channel(CLIENT7, "MP", 0, "{\"loginMethods\":[\"OPENID_SILENT\"]}")));

        assertThatThrownBy(() -> service.clientLogin(new ClientLoginRequest(CLIENT7, "MP", CODE)))
                .isInstanceOf(BusinessException.class)
                .hasMessage("该端未开通此登录方式");
        verify(miniprogramClient, never()).code2Session(anyString(), anyString(), anyString());
    }

    @Test
    void clientLogin_decryptsChannelSecretAndUsesClientScopedIdentity() {
        when(channelRepository.findByClientIdAndChannelType(CLIENT7, "MP"))
                .thenReturn(Optional.of(mpChannelEnabled("[\"OPENID_SILENT\",\"BIND_CODE\"]")));
        stubSession();
        when(openidRepository.findByClientIdAndOpenidAndIsDeleted(CLIENT7, OPENID, 0))
                .thenReturn(Optional.of(binding(CLIENT7, 7L, OPENID)));
        when(userRepository.findById(7L)).thenReturn(Optional.of(user(7L, "customer", 1)));

        LoginResponse response = service.clientLogin(new ClientLoginRequest(CLIENT7, "MP", CODE));

        // appid/secret 来自端渠道 config（secret 密文解密），不再走全局配置
        verify(miniprogramClient).code2Session(CLIENT_ID, CLIENT_SECRET, CODE);
        assertThat(response.accessToken()).isEqualTo("access-token");
        assertThat(response.user().id()).isEqualTo(7L);
    }

    @Test
    void clientLogin_openidIsolatedAcrossClients() {
        // 同一 openid 在 client1 有绑定，client7 没有 → 按端查询查不到 → 401（spec「openid 跨端隔离」）
        when(channelRepository.findByClientIdAndChannelType(CLIENT7, "MP"))
                .thenReturn(Optional.of(mpChannelEnabled("[\"OPENID_SILENT\"]")));
        stubSession();
        when(openidRepository.findByClientIdAndOpenidAndIsDeleted(CLIENT7, OPENID, 0))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.clientLogin(new ClientLoginRequest(CLIENT7, "MP", CODE)))
                .isInstanceOf(BusinessException.class)
                .hasMessage("该微信未绑定平台账号，请先使用账号密码绑定")
                .extracting(e -> ((BusinessException) e).getCode()).isEqualTo(401);
        verify(openidRepository).findByClientIdAndOpenidAndIsDeleted(CLIENT7, OPENID, 0);
    }

    @Test
    void clientLogin_disabledUser_403() {
        when(channelRepository.findByClientIdAndChannelType(CLIENT7, "MP"))
                .thenReturn(Optional.of(mpChannelEnabled("[\"OPENID_SILENT\"]")));
        stubSession();
        when(openidRepository.findByClientIdAndOpenidAndIsDeleted(CLIENT7, OPENID, 0))
                .thenReturn(Optional.of(binding(CLIENT7, 7L, OPENID)));
        when(userRepository.findById(7L)).thenReturn(Optional.of(user(7L, "customer", 0)));

        assertThatThrownBy(() -> service.clientLogin(new ClientLoginRequest(CLIENT7, "MP", CODE)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getCode()).isEqualTo(403);
    }

    @Test
    void clientLogin_nonMpChannel_notYetSupported_400() {
        assertThatThrownBy(() -> service.clientLogin(new ClientLoginRequest(CLIENT7, "H5", CODE)))
                .isInstanceOf(BusinessException.class)
                .hasMessage("该渠道登录方式暂未支持")
                .extracting(e -> ((BusinessException) e).getCode()).isEqualTo(400);
    }

    @Test
    void clientLogin_channelWithoutAppid_fallsBackToGlobalEnv() {
        // D5 过渡兼容：端渠道未配 appid/secret → 回退全局 env 配置（V64 存量部署不破）
        when(channelRepository.findByClientIdAndChannelType(CLIENT7, "MP"))
                .thenReturn(Optional.of(channel(CLIENT7, "MP", 1, "{\"loginMethods\":[\"OPENID_SILENT\"]}")));
        ReflectionTestUtils.setField(service, "globalMpAppId", "wx-global");
        ReflectionTestUtils.setField(service, "globalMpAppSecret", "global-secret");
        when(miniprogramClient.code2Session("wx-global", "global-secret", CODE))
                .thenReturn(new WechatMiniprogramClient.SessionInfo("wx-global", OPENID, null));
        when(openidRepository.findByClientIdAndOpenidAndIsDeleted(CLIENT7, OPENID, 0))
                .thenReturn(Optional.of(binding(CLIENT7, 7L, OPENID)));
        when(userRepository.findById(7L)).thenReturn(Optional.of(user(7L, "customer", 1)));

        assertThat(service.clientLogin(new ClientLoginRequest(CLIENT7, "MP", CODE)).accessToken())
                .isEqualTo("access-token");
    }

    @Test
    void clientLogin_noAppidAnywhere_503() {
        when(channelRepository.findByClientIdAndChannelType(CLIENT7, "MP"))
                .thenReturn(Optional.of(channel(CLIENT7, "MP", 1, "{\"loginMethods\":[\"OPENID_SILENT\"]}")));

        assertThatThrownBy(() -> service.clientLogin(new ClientLoginRequest(CLIENT7, "MP", CODE)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getCode()).isEqualTo(503);
    }

    // ------------------------------------------------------------ clientBind（账号密码 / 绑定码双载体）

    @Test
    void bind_password_createsClientScopedBinding() {
        when(channelRepository.findByClientIdAndChannelType(CLIENT7, "MP"))
                .thenReturn(Optional.of(mpChannelEnabled("[\"OPENID_SILENT\",\"BIND_CODE\"]")));
        stubSession();
        when(userRepository.findByUsername("customer")).thenReturn(Optional.of(user(7L, "customer", 1)));
        when(passwordEncoder.matches("secret", "encoded")).thenReturn(true);
        when(openidRepository.findByClientIdAndOpenidAndIsDeleted(CLIENT7, OPENID, 0)).thenReturn(Optional.empty());
        when(openidRepository.findByClientIdAndUserIdAndIsDeleted(CLIENT7, 7L, 0)).thenReturn(Optional.empty());
        when(openidRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        LoginResponse response = service.clientBind(
                new ClientBindRequest(CLIENT7, "MP", CODE, "customer", "secret", null));

        assertThat(response.accessToken()).isEqualTo("access-token");
        ArgumentCaptor<SysUserOpenid> captor = ArgumentCaptor.forClass(SysUserOpenid.class);
        verify(openidRepository).save(captor.capture());
        assertThat(captor.getValue().getClientId()).isEqualTo(CLIENT7);
        assertThat(captor.getValue().getUserId()).isEqualTo(7L);
        assertThat(captor.getValue().getAppId()).isEqualTo(CLIENT_ID);
        assertThat(captor.getValue().getOpenid()).isEqualTo(OPENID);
        assertThat(captor.getValue().getUnionid()).isEqualTo("union-1");
    }

    @Test
    void bind_password_wrong_401_noBinding() {
        when(channelRepository.findByClientIdAndChannelType(CLIENT7, "MP"))
                .thenReturn(Optional.of(mpChannelEnabled("[\"OPENID_SILENT\"]")));
        stubSession();
        when(userRepository.findByUsername("customer")).thenReturn(Optional.of(user(7L, "customer", 1)));
        when(passwordEncoder.matches("wrong", "encoded")).thenReturn(false);

        assertThatThrownBy(() -> service.clientBind(
                new ClientBindRequest(CLIENT7, "MP", CODE, "customer", "wrong", null)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getCode()).isEqualTo(401);
        verify(openidRepository, never()).save(any());
    }

    @Test
    void bind_password_idempotent_forSameOpenidAndUser() {
        when(channelRepository.findByClientIdAndChannelType(CLIENT7, "MP"))
                .thenReturn(Optional.of(mpChannelEnabled("[\"OPENID_SILENT\"]")));
        stubSession();
        when(userRepository.findByUsername("customer")).thenReturn(Optional.of(user(7L, "customer", 1)));
        when(passwordEncoder.matches("secret", "encoded")).thenReturn(true);
        when(openidRepository.findByClientIdAndOpenidAndIsDeleted(CLIENT7, OPENID, 0))
                .thenReturn(Optional.of(binding(CLIENT7, 7L, OPENID)));

        LoginResponse response = service.clientBind(
                new ClientBindRequest(CLIENT7, "MP", CODE, "customer", "secret", null));

        assertThat(response.accessToken()).isEqualTo("access-token");
        verify(openidRepository, never()).save(any());
    }

    @Test
    void bind_password_openidBoundToAnotherUser_409() {
        when(channelRepository.findByClientIdAndChannelType(CLIENT7, "MP"))
                .thenReturn(Optional.of(mpChannelEnabled("[\"OPENID_SILENT\"]")));
        stubSession();
        when(userRepository.findByUsername("customer")).thenReturn(Optional.of(user(7L, "customer", 1)));
        when(passwordEncoder.matches("secret", "encoded")).thenReturn(true);
        when(openidRepository.findByClientIdAndOpenidAndIsDeleted(CLIENT7, OPENID, 0))
                .thenReturn(Optional.of(binding(CLIENT7, 8L, OPENID)));

        assertThatThrownBy(() -> service.clientBind(
                new ClientBindRequest(CLIENT7, "MP", CODE, "customer", "secret", null)))
                .isInstanceOf(BusinessException.class)
                .hasMessage("该微信已绑定其他平台账号，请联系管理员解绑")
                .extracting(e -> ((BusinessException) e).getCode()).isEqualTo(409);
        verify(openidRepository, never()).save(any());
    }

    @Test
    void bind_password_userBoundToAnotherOpenid_409() {
        when(channelRepository.findByClientIdAndChannelType(CLIENT7, "MP"))
                .thenReturn(Optional.of(mpChannelEnabled("[\"OPENID_SILENT\"]")));
        stubSession();
        when(userRepository.findByUsername("customer")).thenReturn(Optional.of(user(7L, "customer", 1)));
        when(passwordEncoder.matches("secret", "encoded")).thenReturn(true);
        when(openidRepository.findByClientIdAndOpenidAndIsDeleted(CLIENT7, OPENID, 0)).thenReturn(Optional.empty());
        when(openidRepository.findByClientIdAndUserIdAndIsDeleted(CLIENT7, 7L, 0))
                .thenReturn(Optional.of(binding(CLIENT7, 7L, "openid-old")));

        assertThatThrownBy(() -> service.clientBind(
                new ClientBindRequest(CLIENT7, "MP", CODE, "customer", "secret", null)))
                .isInstanceOf(BusinessException.class)
                .hasMessage("该平台账号已绑定其他微信，请联系管理员解绑")
                .extracting(e -> ((BusinessException) e).getCode()).isEqualTo(409);
        verify(openidRepository, never()).save(any());
    }

    @Test
    void bind_byCode_consumesCodeAndBinds() {
        when(channelRepository.findByClientIdAndChannelType(CLIENT7, "MP"))
                .thenReturn(Optional.of(mpChannelEnabled("[\"OPENID_SILENT\",\"BIND_CODE\"]")));
        stubSession();
        com.workflow.system.domain.entity.SysBindCode record = new com.workflow.system.domain.entity.SysBindCode();
        record.setUserId(9L);
        record.setClientId(CLIENT7);
        when(bindCodeService.consume("ABCD1234EF56", CLIENT7)).thenReturn(record);
        when(userRepository.findById(9L)).thenReturn(Optional.of(user(9L, "zhangsan", 1)));
        when(openidRepository.findByClientIdAndOpenidAndIsDeleted(CLIENT7, OPENID, 0)).thenReturn(Optional.empty());
        when(openidRepository.findByClientIdAndUserIdAndIsDeleted(CLIENT7, 9L, 0)).thenReturn(Optional.empty());
        when(openidRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        LoginResponse response = service.clientBind(
                new ClientBindRequest(CLIENT7, "MP", CODE, null, null, "ABCD1234EF56"));

        assertThat(response.user().username()).isEqualTo("zhangsan");
        ArgumentCaptor<SysUserOpenid> captor = ArgumentCaptor.forClass(SysUserOpenid.class);
        verify(openidRepository).save(captor.capture());
        assertThat(captor.getValue().getUserId()).isEqualTo(9L);
        assertThat(captor.getValue().getClientId()).isEqualTo(CLIENT7);
    }

    @Test
    void bind_onlyBindCodeMethodEnabled_passwordRejected_butCodeAccepted() {
        // D4 裁定：口令 bind 门禁=OPENID_SILENT；绑定码 bind 门禁=BIND_CODE
        when(channelRepository.findByClientIdAndChannelType(CLIENT7, "MP"))
                .thenReturn(Optional.of(mpChannelEnabled("[\"BIND_CODE\"]")));

        assertThatThrownBy(() -> service.clientBind(
                new ClientBindRequest(CLIENT7, "MP", CODE, "customer", "secret", null)))
                .isInstanceOf(BusinessException.class)
                .hasMessage("该端未开通此登录方式");
        // 口令分支拒绝后不消耗 session
        verify(miniprogramClient, never()).code2Session(anyString(), anyString(), anyString());
    }

    @Test
    void bind_withoutAnyCredential_400() {
        when(channelRepository.findByClientIdAndChannelType(CLIENT7, "MP"))
                .thenReturn(Optional.of(mpChannelEnabled("[\"OPENID_SILENT\",\"BIND_CODE\"]")));

        assertThatThrownBy(() -> service.clientBind(new ClientBindRequest(CLIENT7, "MP", CODE, null, null, null)))
                .isInstanceOf(BusinessException.class)
                .hasMessage("绑定凭据不能为空（账号密码或绑定码）")
                .extracting(e -> ((BusinessException) e).getCode()).isEqualTo(400);
    }

    // ------------------------------------------------------------ unbind

    @Test
    void unbind_softDeletesClientScopedBinding() {
        SysUserOpenid existing = binding(CLIENT7, 7L, OPENID);
        when(openidRepository.findByClientIdAndUserIdAndIsDeleted(CLIENT7, 7L, 0))
                .thenReturn(Optional.of(existing));

        service.clientUnbind(7L, new ClientUnbindRequest(CLIENT7));

        assertThat(existing.getIsDeleted()).isEqualTo(1);
        verify(openidRepository).save(existing);
    }

    @Test
    void unbind_notFound_400() {
        when(openidRepository.findByClientIdAndUserIdAndIsDeleted(anyLong(), anyLong(), any()))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.clientUnbind(7L, new ClientUnbindRequest(CLIENT7)))
                .isInstanceOf(BusinessException.class)
                .hasMessage("该端暂无身份绑定")
                .extracting(e -> ((BusinessException) e).getCode()).isEqualTo(400);
    }

    // ------------------------------------------------------------ J4 端 claim 与按端过滤

    @Test
    void login_issuesTokenWithPortalWebClaims() {
        when(channelRepository.findByClientIdAndChannelType(1L, "WEB"))
                .thenReturn(Optional.of(channel(1L, "WEB", 1, null)));
        when(userRepository.findByUsername("admin")).thenReturn(Optional.of(user(1L, "admin", 1)));
        when(passwordEncoder.matches("pass", "encoded")).thenReturn(true);

        service.login(new LoginRequest("admin", "pass"));

        verify(jwtTokenProvider).createAccessToken(1L, "admin", 1L, "WEB");
        verify(jwtTokenProvider).createRefreshToken(1L, "admin", 1L, "WEB");
    }

    @Test
    void clientLogin_issuesTokenWithClientScopedClaims() {
        when(channelRepository.findByClientIdAndChannelType(CLIENT7, "MP"))
                .thenReturn(Optional.of(mpChannelEnabled("[\"OPENID_SILENT\"]")));
        stubSession();
        when(openidRepository.findByClientIdAndOpenidAndIsDeleted(CLIENT7, OPENID, 0))
                .thenReturn(Optional.of(binding(CLIENT7, 7L, OPENID)));
        when(userRepository.findById(7L)).thenReturn(Optional.of(user(7L, "customer", 1)));

        service.clientLogin(new ClientLoginRequest(CLIENT7, "MP", CODE));

        // spec：token SHALL 携带 client/channel——下游过滤器/菜单/guard 端上下文的唯一来源
        verify(jwtTokenProvider).createAccessToken(7L, "customer", 7L, "MP");
        verify(jwtTokenProvider).createRefreshToken(7L, "customer", 7L, "MP");
    }

    @Test
    void refreshToken_inheritsClientClaimsFromRefreshToken() {
        when(jwtTokenProvider.validateToken("refresh-token")).thenReturn(true);
        when(jwtTokenProvider.getUserIdFromToken("refresh-token")).thenReturn(7L);
        when(jwtTokenProvider.getClientIdFromToken("refresh-token")).thenReturn(7L);
        when(jwtTokenProvider.getChannelFromToken("refresh-token")).thenReturn("MP");
        when(userRepository.findById(7L)).thenReturn(Optional.of(user(7L, "customer", 1)));

        service.refreshToken("refresh-token");

        verify(jwtTokenProvider).createAccessToken(7L, "customer", 7L, "MP");
    }

    @Test
    void getCurrentUserMenus_nonPortalAdmin_getsClientScopedRoots() {
        com.workflow.system.domain.entity.SysUserRole ur = new com.workflow.system.domain.entity.SysUserRole();
        ur.setUserId(1L);
        ur.setRoleId(5L);
        when(userRoleRepository.findByUserId(1L)).thenReturn(List.of(ur));
        com.workflow.system.domain.entity.SysRole adminRole = new com.workflow.system.domain.entity.SysRole();
        adminRole.setId(5L);
        adminRole.setRoleCode("ROLE_ADMIN");
        when(roleRepository.findAllById(any())).thenReturn(List.of(adminRole));

        com.workflow.system.domain.entity.SysMenu mpMenu = new com.workflow.system.domain.entity.SysMenu();
        mpMenu.setId(900L);
        mpMenu.setClientId(7L);
        mpMenu.setMenuName("司机订单");
        mpMenu.setMenuType(1);
        mpMenu.setSortOrder(1);
        mpMenu.setStatus(1);
        when(menuRepository.findByClientIdAndParentIdIsNullOrderBySortOrder(7L)).thenReturn(List.of(mpMenu));
        when(menuRepository.findByParentIdOrderBySortOrder(900L)).thenReturn(List.of());

        assertThat(service.getCurrentUserMenus(1L, 7L))
                .extracting(com.workflow.system.domain.vo.MenuTree::id).containsExactly(900L);
        // 按端取树：不得回退到全量根查询（portal 树≠司机端树，spec Scenario）
        verify(menuRepository, never()).findByParentIdIsNullOrderBySortOrder();
    }

    @Test
    void getCurrentUser_nonPortal_permissionsScopedToOwnClient() {
        com.workflow.system.domain.entity.SysUserRole ur = new com.workflow.system.domain.entity.SysUserRole();
        ur.setUserId(7L);
        ur.setRoleId(5L);
        when(userRoleRepository.findByUserId(7L)).thenReturn(List.of(ur));
        com.workflow.system.domain.entity.SysRole role = new com.workflow.system.domain.entity.SysRole();
        role.setId(5L);
        role.setRoleCode("ROLE_DRIVER");
        when(roleRepository.findAllById(any())).thenReturn(List.of(role));
        com.workflow.system.domain.entity.SysRoleMenu rm1 = new com.workflow.system.domain.entity.SysRoleMenu();
        rm1.setRoleId(5L);
        rm1.setMenuId(61L);
        com.workflow.system.domain.entity.SysRoleMenu rm2 = new com.workflow.system.domain.entity.SysRoleMenu();
        rm2.setRoleId(5L);
        rm2.setMenuId(62L);
        when(roleMenuRepository.findByRoleIdIn(any())).thenReturn(List.of(rm1, rm2));
        com.workflow.system.domain.entity.SysMenu ownMenu = new com.workflow.system.domain.entity.SysMenu();
        ownMenu.setId(61L);
        ownMenu.setClientId(7L);
        ownMenu.setPermission("order:list");
        com.workflow.system.domain.entity.SysMenu portalMenu = new com.workflow.system.domain.entity.SysMenu();
        portalMenu.setId(62L);
        portalMenu.setClientId(1L);
        portalMenu.setPermission("sys:user:list");
        when(menuRepository.findAllById(any())).thenReturn(List.of(ownMenu, portalMenu));
        when(userRepository.findById(7L)).thenReturn(Optional.of(user(7L, "customer", 1)));

        LoginResponse response = service.getCurrentUser(7L, 7L);

        assertThat(response.user().permissions()).containsExactly("order:list");
    }

    @Test
    void getCurrentUser_portal_keepsAllPermissions() {
        // client=1 全量（非 portal 才隔离裁定）：存量权限语义零破坏
        com.workflow.system.domain.entity.SysUserRole ur = new com.workflow.system.domain.entity.SysUserRole();
        ur.setUserId(7L);
        ur.setRoleId(5L);
        when(userRoleRepository.findByUserId(7L)).thenReturn(List.of(ur));
        com.workflow.system.domain.entity.SysRole role = new com.workflow.system.domain.entity.SysRole();
        role.setId(5L);
        role.setRoleCode("ROLE_STAFF");
        when(roleRepository.findAllById(any())).thenReturn(List.of(role));
        com.workflow.system.domain.entity.SysRoleMenu rm1 = new com.workflow.system.domain.entity.SysRoleMenu();
        rm1.setRoleId(5L);
        rm1.setMenuId(61L);
        when(roleMenuRepository.findByRoleIdIn(any())).thenReturn(List.of(rm1));
        com.workflow.system.domain.entity.SysMenu otherMenu = new com.workflow.system.domain.entity.SysMenu();
        otherMenu.setId(61L);
        otherMenu.setClientId(9L);
        otherMenu.setPermission("order:list");
        when(menuRepository.findAllById(any())).thenReturn(List.of(otherMenu));
        when(userRepository.findById(7L)).thenReturn(Optional.of(user(7L, "customer", 1)));

        LoginResponse response = service.getCurrentUser(7L, 1L);

        assertThat(response.user().permissions()).containsExactly("order:list");
    }
}
