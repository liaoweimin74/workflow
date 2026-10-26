package com.workflow.api.controller;

import com.workflow.api.dto.RoleDataPermissionDTO;
import com.workflow.api.dto.RoleDataPermissionSaveRequest;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.scope.RoleDataPermissionService;
import com.workflow.engine.datasource.scope.RoleDataPermissionService.Item;
import com.workflow.engine.datasource.scope.RoleDataPermissionService.View;
import com.workflow.framework.security.domain.LoginUser;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 角色数据权限端点：按角色维护「权限对象」勾选（v3：授权 = 赋予可见行）。
 *
 * <p>这是 ROLE 授权的唯一写入口（对齐「分配菜单」）；与行权限对象端点一样仅管理员可用。
 */
@RestController
@RequestMapping("/api/roles/{roleId}/data-permissions")
public class RoleDataPermissionController {

    private static final List<String> ADMIN_ROLES = List.of("admin", "ROLE_ADMIN");

    private final RoleDataPermissionService roleDataPermissionService;

    public RoleDataPermissionController(RoleDataPermissionService roleDataPermissionService) {
        this.roleDataPermissionService = roleDataPermissionService;
    }

    @GetMapping
    public R<List<RoleDataPermissionDTO>> list(@PathVariable Long roleId) {
        requireAdmin();
        return R.ok(roleDataPermissionService.list(roleId).stream().map(this::toDTO).toList());
    }

    @PutMapping
    public R<Void> save(@PathVariable Long roleId, @RequestBody RoleDataPermissionSaveRequest request) {
        requireAdmin();
        List<Item> items = request.getItems() == null ? List.of() : request.getItems().stream()
                .map(item -> item == null ? null
                        : new Item(item.getPermissionId(), item.getFieldPolicies()))
                .toList();
        roleDataPermissionService.save(roleId, items);
        return R.ok();
    }

    private RoleDataPermissionDTO toDTO(View view) {
        RoleDataPermissionDTO dto = new RoleDataPermissionDTO();
        dto.setPermissionId(view.permissionId());
        dto.setPermissionName(view.permissionName());
        dto.setRemark(view.remark());
        dto.setConditions(view.conditions());
        dto.setDataSourceIds(view.dataSourceIds());
        dto.setGranted(view.granted());
        dto.setFieldPolicies(view.fieldPolicies());
        return dto;
    }

    private void requireAdmin() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        LoginUser loginUser = auth != null && auth.getPrincipal() instanceof LoginUser user ? user : null;
        if (loginUser == null || loginUser.getRoles() == null
                || loginUser.getRoles().stream().noneMatch(ADMIN_ROLES::contains)) {
            throw new BusinessException(403, "需要管理员权限");
        }
    }
}
