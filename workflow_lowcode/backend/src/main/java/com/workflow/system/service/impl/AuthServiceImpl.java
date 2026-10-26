package com.workflow.system.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.constant.GlobalConstant;
import com.workflow.common.exception.BusinessException;
import com.workflow.framework.security.ClientCrypto;
import com.workflow.framework.security.jwt.JwtTokenProvider;
import com.workflow.system.domain.dto.BindCodeIssueRequest;
import com.workflow.system.domain.dto.ChangePasswordRequest;
import com.workflow.system.domain.dto.ClientBindRequest;
import com.workflow.system.domain.dto.ClientLoginRequest;
import com.workflow.system.domain.dto.ClientUnbindRequest;
import com.workflow.system.domain.dto.LoginRequest;
import com.workflow.system.domain.entity.*;
import com.workflow.system.domain.vo.BindCodeVO;
import com.workflow.system.domain.vo.LoginResponse;
import com.workflow.system.domain.vo.MenuTree;
import com.workflow.system.domain.vo.UserInfo;
import com.workflow.system.repository.*;
import com.workflow.system.service.AuthService;
import com.workflow.system.service.BindCodeService;
import com.workflow.system.service.WechatMiniprogramClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

@Service
public class AuthServiceImpl implements AuthService {

    /** 登录方式枚举值——与前端 A2 渠道勾选项一致（ClientSettingDrawer LOGIN_METHOD_OPTIONS）。 */
    private static final String METHOD_PWD = "PWD";
    private static final String METHOD_OPENID_SILENT = "OPENID_SILENT";
    private static final String METHOD_BIND_CODE = "BIND_CODE";

    /** 渠道配置 JSON 解析（宽松降级）；只读取 loginMethods/appid，不外泄 config 原文。 */
    private static final ObjectMapper CONFIG_MAPPER = new ObjectMapper();

    private final SysUserRepository userRepository;
    private final SysRoleRepository roleRepository;
    private final SysMenuRepository menuRepository;
    private final SysUserRoleRepository userRoleRepository;
    private final SysRoleMenuRepository roleMenuRepository;
    private final SysOrganizationRepository orgRepository;
    private final SysUserOpenidRepository userOpenidRepository;
    private final SysClientChannelRepository clientChannelRepository;
    private final WechatMiniprogramClient miniprogramClient;
    private final ClientCrypto clientCrypto;
    private final BindCodeService bindCodeService;
    private final JwtTokenProvider jwtTokenProvider;
    private final PasswordEncoder passwordEncoder;

    /** D5 过渡兼容：端渠道未配 appid/secret 时回退全局 env 配置（V64 存量部署不破）。 */
    @Value("${workflow.auth.miniprogram.app-id:}")
    private String globalMpAppId;

    @Value("${workflow.auth.miniprogram.app-secret:}")
    private String globalMpAppSecret;

    public AuthServiceImpl(SysUserRepository userRepository, SysRoleRepository roleRepository,
                           SysMenuRepository menuRepository, SysUserRoleRepository userRoleRepository,
                           SysRoleMenuRepository roleMenuRepository, SysOrganizationRepository orgRepository,
                           SysUserOpenidRepository userOpenidRepository,
                           SysClientChannelRepository clientChannelRepository,
                           WechatMiniprogramClient miniprogramClient,
                           ClientCrypto clientCrypto,
                           BindCodeService bindCodeService,
                           JwtTokenProvider jwtTokenProvider, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.menuRepository = menuRepository;
        this.userRoleRepository = userRoleRepository;
        this.roleMenuRepository = roleMenuRepository;
        this.orgRepository = orgRepository;
        this.userOpenidRepository = userOpenidRepository;
        this.clientChannelRepository = clientChannelRepository;
        this.miniprogramClient = miniprogramClient;
        this.clientCrypto = clientCrypto;
        this.bindCodeService = bindCodeService;
        this.jwtTokenProvider = jwtTokenProvider;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public LoginResponse login(LoginRequest request) {
        // J3 门禁：账密登录=默认平台端 portal × WEB × PWD（spec「未开通方式拒绝」；
        // portal WEB seed config NULL=缺省放行，存量零破坏——ledger D3）。
        assertMethodEnabled(SysClient.PORTAL_CLIENT_ID, "WEB", METHOD_PWD);
        SysUser user = userRepository.findByUsername(request.username())
                .orElseThrow(() -> new BusinessException("用户名或密码错误"));
        if (!passwordEncoder.matches(request.password(), user.getPassword())) {
            throw new BusinessException("用户名或密码错误");
        }
        if (user.getStatus() != 1) {
            throw new BusinessException("账号已被禁用");
        }
        // J4：账密登录 = 平台端 portal × WEB，端声明随 token 签发（spec「token 携带端声明」）
        return tokenResponse(user, SysClient.PORTAL_CLIENT_ID, "WEB");
    }

    @Override
    public void logout(String token) {
        // No-op: Redis disabled
    }

    @Override
    @Transactional
    public void changePassword(Long userId, ChangePasswordRequest request) {
        SysUser user = requireActiveUser(userId, "用户不存在");
        if (!passwordEncoder.matches(request.oldPassword(), user.getPassword())) {
            throw new BusinessException(400, "旧密码不正确");
        }
        if (passwordEncoder.matches(request.newPassword(), user.getPassword())) {
            throw new BusinessException(400, "新密码不能与旧密码相同");
        }
        user.setPassword(passwordEncoder.encode(request.newPassword()));
        userRepository.save(user);
    }

    @Override
    public LoginResponse refreshToken(String refreshToken) {
        if (!jwtTokenProvider.validateToken(refreshToken)) {
            throw new BusinessException("Refresh Token 无效或已过期");
        }
        Long userId = jwtTokenProvider.getUserIdFromToken(refreshToken);
        // J4：续期继承 refresh token 的端声明，端上下文不降级（历史 refresh token 缺省平台端）
        Long clientId = jwtTokenProvider.getClientIdFromToken(refreshToken);
        String channel = jwtTokenProvider.getChannelFromToken(refreshToken);
        SysUser user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException("用户不存在"));
        return tokenResponse(user, clientId, channel);
    }

    // ------------------------------------------------------------ J3 端身份泛化

    @Override
    @Transactional
    public LoginResponse clientLogin(ClientLoginRequest request) {
        String channelType = normalizeChannel(request.channel());
        assertMpChannel(channelType);
        SysClientChannel channel = assertMethodEnabled(request.clientId(), channelType, METHOD_OPENID_SILENT);

        WechatMiniprogramClient.SessionInfo session = exchangeSession(channel, request.code());
        SysUserOpenid binding = userOpenidRepository
                .findByClientIdAndOpenidAndIsDeleted(channel.getClientId(), session.openid(), GlobalConstant.DELETED_NO)
                .orElseThrow(() -> new BusinessException(401, "该微信未绑定平台账号，请先使用账号密码绑定"));
        return tokenResponse(requireActiveUser(binding.getUserId(), "绑定账号不存在或已删除"),
                channel.getClientId(), channelType);
    }

    @Override
    @Transactional
    public LoginResponse clientBind(ClientBindRequest request) {
        String channelType = normalizeChannel(request.channel());
        assertMpChannel(channelType);
        boolean passwordMode = hasText(request.username()) || hasText(request.password());
        if (!passwordMode && !hasText(request.bindCode())) {
            throw new BusinessException(400, "绑定凭据不能为空（账号密码或绑定码）");
        }
        // D4 裁定：口令 bind 是 openid 静默登录的前置设置步 → 门禁 OPENID_SILENT；绑定码 → BIND_CODE。
        String method = passwordMode ? METHOD_OPENID_SILENT : METHOD_BIND_CODE;
        SysClientChannel channel = assertMethodEnabled(request.clientId(), channelType, method);
        WechatMiniprogramClient.SessionInfo session = exchangeSession(channel, request.code());

        SysUser user;
        if (passwordMode) {
            user = userRepository.findByUsername(request.username())
                    .orElseThrow(() -> new BusinessException(401, "用户名或密码错误"));
            if (!passwordEncoder.matches(request.password(), user.getPassword())) {
                throw new BusinessException(401, "用户名或密码错误");
            }
            if (user.getIsDeleted() != GlobalConstant.DELETED_NO) {
                throw new BusinessException(401, "用户名或密码错误");
            }
            if (user.getStatus() == null || user.getStatus() != 1) {
                throw new BusinessException(403, "账号已被禁用");
            }
        } else {
            SysBindCode code = bindCodeService.consume(request.bindCode().trim(), channel.getClientId());
            user = requireActiveUser(code.getUserId(), "绑定目标账号不存在或已删除");
        }

        // 端身份判定按 clientId 隔离（spec「openid 跨端隔离」：各端绑定互不影响）
        Optional<SysUserOpenid> byOpenid = userOpenidRepository
                .findByClientIdAndOpenidAndIsDeleted(channel.getClientId(), session.openid(), GlobalConstant.DELETED_NO);
        if (byOpenid.isPresent()) {
            if (byOpenid.get().getUserId().equals(user.getId())) {
                return tokenResponse(user, channel.getClientId(), channelType); // 幂等：同一 openid 重绑同一账号直接登录
            }
            throw new BusinessException(409, "该微信已绑定其他平台账号，请联系管理员解绑");
        }
        Optional<SysUserOpenid> byUser = userOpenidRepository
                .findByClientIdAndUserIdAndIsDeleted(channel.getClientId(), user.getId(), GlobalConstant.DELETED_NO);
        if (byUser.isPresent()) {
            throw new BusinessException(409, "该平台账号已绑定其他微信，请联系管理员解绑");
        }

        SysUserOpenid binding = new SysUserOpenid();
        binding.setClientId(channel.getClientId());
        binding.setUserId(user.getId());
        binding.setAppId(session.appId());
        binding.setOpenid(session.openid());
        binding.setUnionid(session.unionid());
        userOpenidRepository.save(binding);
        return tokenResponse(user, channel.getClientId(), channelType);
    }

    @Override
    @Transactional
    public void clientUnbind(Long userId, ClientUnbindRequest request) {
        SysUserOpenid binding = userOpenidRepository
                .findByClientIdAndUserIdAndIsDeleted(request.clientId(), userId, GlobalConstant.DELETED_NO)
                .orElseThrow(() -> new BusinessException(400, "该端暂无身份绑定"));
        binding.setIsDeleted(1);
        userOpenidRepository.save(binding);
    }

    @Override
    public BindCodeVO issueBindCode(BindCodeIssueRequest request) {
        return bindCodeService.issue(request.userId(), request.clientId());
    }

    // ------------------------------------------------------------ 端门禁与渠道凭据

    /**
     * 登录方式门禁（spec client-login-identity Requirement 1；ledger D3 语义）：
     * <ul>
     *   <li>渠道行缺失或 enabled≠1 → 拒；</li>
     *   <li>config_json NULL/空 → 缺省放行（V71 portal seed 无 config，存量链零破坏）；</li>
     *   <li>config_json 非空 → 严格按 config.loginMethods（A2「未勾选不落键」= 显式关停）。</li>
     * </ul>
     */
    private SysClientChannel assertMethodEnabled(Long clientId, String channelType, String method) {
        SysClientChannel channel = clientChannelRepository
                .findByClientIdAndChannelType(clientId, channelType).orElse(null);
        if (channel == null || !Integer.valueOf(1).equals(channel.getEnabled())) {
            throw new BusinessException(403, "该端未开通此登录方式");
        }
        String configJson = channel.getConfigJson();
        if (configJson == null || configJson.isEmpty()) {
            return channel; // 未配置过 = 缺省放行
        }
        JsonNode methods = tryReadConfig(configJson).get("loginMethods");
        boolean enabled = methods != null && methods.isArray() &&
                StreamSupport.stream(methods.spliterator(), false)
                        .anyMatch(m -> method.equals(m.asText()));
        if (!enabled) {
            throw new BusinessException(403, "该端未开通此登录方式");
        }
        return channel;
    }

    /** 本期端登录/绑定仅实现 MP 渠道；SMS 等其余渠道端点归后续（A2 配置先允许存储）。 */
    private void assertMpChannel(String channelType) {
        if (!"MP".equals(channelType)) {
            throw new BusinessException(400, "该渠道登录方式暂未支持");
        }
    }

    private String normalizeChannel(String channel) {
        return channel == null ? "" : channel.trim().toUpperCase(Locale.ROOT);
    }

    /**
     * 端凭据换 session（D5）：appid 取渠道 config，secret 取 config 密文解密；
     * 端未配置 → 回退全局 env（过渡兼容）→ 双缺 503。
     */
    private WechatMiniprogramClient.SessionInfo exchangeSession(SysClientChannel channel, String code) {
        JsonNode config = tryReadConfig(channel.getConfigJson());
        String appId = textOrNull(config.get("appid"));
        String secret = textOrNull(config.get("secret"));
        if (secret != null) {
            secret = clientCrypto.decrypt(secret); // 密文形态见 J2 ClientService secret 边界
        }
        if (appId == null || secret == null) {
            appId = textOrNull(globalMpAppId);
            secret = textOrNull(globalMpAppSecret);
        }
        if (appId == null || secret == null) {
            throw new BusinessException(503, "小程序登录未配置（该端缺少 appid/secret）");
        }
        return miniprogramClient.code2Session(appId, secret, code);
    }

    private JsonNode tryReadConfig(String json) {
        if (json == null || json.isEmpty()) {
            return CONFIG_MAPPER.createObjectNode();
        }
        try {
            JsonNode node = CONFIG_MAPPER.readTree(json);
            return node.isObject() ? node : CONFIG_MAPPER.createObjectNode();
        } catch (Exception e) {
            return CONFIG_MAPPER.createObjectNode();
        }
    }

    private String textOrNull(JsonNode node) {
        return node == null || !node.isTextual() || node.asText().isBlank() ? null : node.asText().trim();
    }

    private String textOrNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    // ------------------------------------------------------------ 通用支撑

    private SysUser requireActiveUser(Long userId, String missingMessage) {
        SysUser user = userRepository.findById(userId)
                .filter(candidate -> candidate.getIsDeleted() == GlobalConstant.DELETED_NO)
                .orElseThrow(() -> new BusinessException(401, missingMessage));
        if (user.getStatus() == null || user.getStatus() != 1) {
            throw new BusinessException(403, "账号已被禁用");
        }
        return user;
    }

    private LoginResponse tokenResponse(SysUser user, Long clientId, String channel) {
        String accessToken = jwtTokenProvider.createAccessToken(user.getId(), user.getUsername(), clientId, channel);
        String refreshToken = jwtTokenProvider.createRefreshToken(user.getId(), user.getUsername(), clientId, channel);
        return new LoginResponse(accessToken, refreshToken, buildUserInfo(user, clientId));
    }

    @Override
    public LoginResponse getCurrentUser(Long userId, Long clientId) {
        SysUser user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException("用户不存在"));
        UserInfo userInfo = buildUserInfo(user, clientId);
        return new LoginResponse(null, null, userInfo);
    }

    @Override
    public List<MenuTree> getCurrentUserMenus(Long userId, Long clientId) {
        List<SysUserRole> userRoles = userRoleRepository.findByUserId(userId);
        Set<Long> roleIds = userRoles.stream().map(SysUserRole::getRoleId).collect(Collectors.toSet());

        // Admin gets all menus
        boolean isAdmin = roleRepository.findAllById(roleIds).stream()
                .anyMatch(r -> "ROLE_ADMIN".equals(r.getRoleCode()));

        List<SysMenu> allMenus;
        Set<Long> authorizedMenuIds = null;
        Map<Long, SysMenu> menuCache = new HashMap<>();
        if (isAdmin) {
            // J4 统一按端取根（裁定③）：portal=1 取平台端树；业务端取本端树（spec：司机端 token 得司机端树）
            allMenus = menuRepository.findByClientIdAndParentIdIsNullOrderBySortOrder(clientId);
        } else {
            Set<Long> menuIds = roleMenuRepository.findByRoleIdIn(roleIds).stream()
                    .map(SysRoleMenu::getMenuId)
                    .collect(Collectors.toSet());

            // 回溯所有祖先菜单，确保父级目录也在列表中
            Set<Long> rootMenuIds = new LinkedHashSet<>();
            for (Long menuId : menuIds) {
                SysMenu menu = menuRepository.findById(menuId).orElse(null);
                if (menu == null) {
                    continue;
                }
                menuCache.put(menu.getId(), menu);
                // 向上回溯祖先
                SysMenu current = menu;
                while (current.getParentId() != null) {
                    if (menuCache.containsKey(current.getParentId())) {
                        break; // 祖先已在缓存中，无需重复
                    }
                    SysMenu parent = menuRepository.findById(current.getParentId()).orElse(null);
                    if (parent == null) {
                        break;
                    }
                    menuCache.put(parent.getId(), parent);
                    current = parent;
                }
                // 收集顶级祖先
                if (current.getParentId() == null) {
                    rootMenuIds.add(current.getId());
                }
            }

            allMenus = rootMenuIds.stream()
                    .map(menuCache::get)
                    .filter(Objects::nonNull)
                    .filter(m -> isPortal(clientId) || clientId.equals(m.getClientId()))
                    .sorted(Comparator.comparingInt(SysMenu::getSortOrder))
                    .collect(Collectors.toList());
        }

        // 收集所有有权限的菜单 ID（原始授权 + 祖先目录）
        authorizedMenuIds = isAdmin ? null : menuCache.keySet();

        return buildMenuTree(allMenus, authorizedMenuIds, clientId);
    }

    private static boolean isPortal(Long clientId) {
        return clientId == null || clientId == SysClient.PORTAL_CLIENT_ID;
    }

    private UserInfo buildUserInfo(SysUser user, Long clientId) {
        List<SysUserRole> userRoles = userRoleRepository.findByUserId(user.getId());
        Set<Long> roleIds = userRoles.stream().map(SysUserRole::getRoleId).collect(Collectors.toSet());
        List<SysRole> roles = roleRepository.findAllById(roleIds);

        Set<Long> menuIds = roleMenuRepository.findByRoleIdIn(roleIds).stream()
                .map(SysRoleMenu::getMenuId)
                .collect(Collectors.toSet());
        // 端隔离沿用裁定：仅非 portal 端只认本端菜单权限码，portal 全量（存量零破坏）
        Set<String> permissions = menuRepository.findAllById(menuIds).stream()
                .filter(m -> isPortal(clientId) || clientId.equals(m.getClientId()))
                .map(SysMenu::getPermission)
                .filter(p -> p != null && !p.isEmpty())
                .collect(Collectors.toSet());

        String orgName = null;
        if (user.getOrgId() != null) {
            orgName = orgRepository.findById(user.getOrgId())
                    .map(SysOrganization::getOrgName).orElse(null);
        }

        return new UserInfo(
                user.getId(), user.getUsername(), user.getNickname(),
                user.getEmail(), user.getPhone(), user.getAvatar(),
                user.getOrgId(), orgName,
                roles.stream().map(SysRole::getRoleCode).collect(Collectors.toList()),
                permissions);
    }

    private List<MenuTree> buildMenuTree(List<SysMenu> menus, Set<Long> authorizedMenuIds, Long clientId) {
        return menus.stream()
                .filter(m -> m.getIsDeleted() == 0)
                .filter(m -> m.getStatus() == 1)
                .filter(m -> authorizedMenuIds == null || authorizedMenuIds.contains(m.getId()))
                .map(m -> toMenuTree(m, authorizedMenuIds, clientId))
                .collect(Collectors.toList());
    }

    private MenuTree toMenuTree(SysMenu menu, Set<Long> authorizedMenuIds, Long clientId) {
        List<SysMenu> children = menuRepository.findByParentIdOrderBySortOrder(menu.getId());
        List<MenuTree> childTrees = children.stream()
                .filter(c -> c.getIsDeleted() == 0)
                .filter(c -> c.getStatus() == 1)
                .filter(c -> authorizedMenuIds == null || authorizedMenuIds.contains(c.getId()))
                .filter(c -> isPortal(clientId) || clientId.equals(c.getClientId()))
                .map(c -> toMenuTree(c, authorizedMenuIds, clientId))
                .collect(Collectors.toList());

        return new MenuTree(
                menu.getId(), menu.getParentId(), menu.getMenuName(),
                menu.getMenuType(), menu.getPath(), menu.getComponent(),
                menu.getPermission(), menu.getIcon(), menu.getSortOrder(),
                menu.getStatus(), menu.getClientId(),
                childTrees.isEmpty() ? null : childTrees);
    }
}
