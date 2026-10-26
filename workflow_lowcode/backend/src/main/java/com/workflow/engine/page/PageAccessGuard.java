package com.workflow.engine.page;

import com.workflow.common.exception.BusinessException;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.engine.page.repository.PageDefinitionRepository;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.framework.security.permission.PermissionEvaluator;
import com.workflow.system.domain.entity.SysClient;
import com.workflow.system.domain.entity.SysMenu;
import com.workflow.engine.page.repository.PageDefinitionRepository;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.system.repository.SysMenuRepository;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 页面访问权限校验（OR 语义）。
 * 校验规则：
 * - 无任何关联菜单（is_deleted=0）→ 404（不暴露页面存在）
 * - 禁用菜单（status!=1）与无权限码菜单不参与授权
 * - 拥有任一关联菜单的权限码 → 放行（OR）
 * - 全部可授权菜单均无权限 → 403
 * admin 角色经 PermissionEvaluator 自动放行。
 * 端隔离（J4）：非 portal 端只认本端挂接的菜单（异端菜单视同未挂接 → 404）；
 * portal / 无认证上下文 = 全量（沿用 2026-10-26 裁定，存量零破坏）。
 * 发布目标端（A5）：非 portal 端还要求 PUBLISHED 行 target_clients 覆盖本端，
 * 未发布/未发到本端一律 404 同文案（NULL 存量行=缺省仅 portal）。
 */
@Component
public class PageAccessGuard {

    private final SysMenuRepository menuRepository;
    private final PermissionEvaluator permissionEvaluator;
    private final PageDefinitionRepository pageDefRepository;
    private final TenantProvider tenantProvider;

    public PageAccessGuard(SysMenuRepository menuRepository,
                           PermissionEvaluator permissionEvaluator,
                           PageDefinitionRepository pageDefRepository,
                           TenantProvider tenantProvider) {
        this.menuRepository = menuRepository;
        this.permissionEvaluator = permissionEvaluator;
        this.pageDefRepository = pageDefRepository;
        this.tenantProvider = tenantProvider;
    }

    public void assertPageAccess(String pageKey) {
        List<SysMenu> menus = menuRepository.findByPathAndIsDeleted("/page/" + pageKey, 0);
        Long clientId = currentClientId();
        boolean nonPortal = clientId != null && clientId != SysClient.PORTAL_CLIENT_ID;
        if (nonPortal) {
            menus = menus.stream()
                    .filter(m -> clientId.equals(m.getClientId()))
                    .collect(Collectors.toList());
        }
        if (menus.isEmpty()) {
            throw new BusinessException(404, "页面不存在或未挂接菜单");
        }
        // A5 发布目标端闸（非 portal）：本端有挂接菜单还不够，最新 PUBLISHED 行的
        // target_clients 必须含本端（NULL 存量行=缺省仅 portal）。拒绝沿用 404 同文案——
        // 与「未挂接」不可区分，不暴露资产存在性。
        if (nonPortal && !publishedToClient(pageKey, clientId)) {
            throw new BusinessException(404, "页面不存在或未挂接菜单");
        }
        boolean granted = menus.stream()
                .filter(m -> m.getStatus() != null && m.getStatus() == 1)
                .map(SysMenu::getPermission)
                .filter(p -> p != null && !p.isBlank())
                .anyMatch(p -> permissionEvaluator.hasPermission(p));
        if (!granted) {
            throw new BusinessException(403, "无页面访问权限");
        }
    }

    /** 该 key 的最新 PUBLISHED 行是否已发布到指定端（PageTargetClients 统一 NULL 缺省口径）。 */
    private boolean publishedToClient(String pageKey, long clientId) {
        PageDefinition published = pageDefRepository
                .findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                        tenantProvider.getTenantId(), pageKey, "PUBLISHED")
                .orElse(null);
        return published != null && PageTargetClients.contains(published.getTargetClients(), clientId);
    }

    /** 请求端上下文 = JWT 过滤器灌入的 LoginUser.clientId（token claim 唯一来源）；无认证按平台端宽松缺省。 */
    private static Long currentClientId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof LoginUser loginUser) {
            return loginUser.getClientId();
        }
        return null;
    }
}
