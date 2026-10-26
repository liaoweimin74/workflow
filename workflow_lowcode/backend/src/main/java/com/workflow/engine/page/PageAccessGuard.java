package com.workflow.engine.page;

import com.workflow.common.exception.BusinessException;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.framework.security.permission.PermissionEvaluator;
import com.workflow.system.domain.entity.SysClient;
import com.workflow.system.domain.entity.SysMenu;
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
 */
@Component
public class PageAccessGuard {

    private final SysMenuRepository menuRepository;
    private final PermissionEvaluator permissionEvaluator;

    public PageAccessGuard(SysMenuRepository menuRepository,
                           PermissionEvaluator permissionEvaluator) {
        this.menuRepository = menuRepository;
        this.permissionEvaluator = permissionEvaluator;
    }

    public void assertPageAccess(String pageKey) {
        List<SysMenu> menus = menuRepository.findByPathAndIsDeleted("/page/" + pageKey, 0);
        Long clientId = currentClientId();
        if (clientId != null && clientId != SysClient.PORTAL_CLIENT_ID) {
            menus = menus.stream()
                    .filter(m -> clientId.equals(m.getClientId()))
                    .collect(Collectors.toList());
        }
        if (menus.isEmpty()) {
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

    /** 请求端上下文 = JWT 过滤器灌入的 LoginUser.clientId（token claim 唯一来源）；无认证按平台端宽松缺省。 */
    private static Long currentClientId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof LoginUser loginUser) {
            return loginUser.getClientId();
        }
        return null;
    }
}
