package com.workflow.api.controller;

import com.workflow.api.dto.RowPermissionDTO;
import com.workflow.api.dto.RowPermissionSaveRequest;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.scope.RowPermissionObjectService;
import com.workflow.engine.datasource.scope.RowPermissionObjectService.Detail;
import com.workflow.engine.datasource.scope.RowPermissionObjectService.Input;
import com.workflow.framework.security.domain.LoginUser;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.List;

/**
 * 权限对象管理端点（对象视角）。
 *
 * <p>整组接口仅管理员可用：能改写权限对象等于能给自己放行。后端无方法级授权，
 * 沿用项目既有的编程式管理员校验。
 */
@RestController
@RequestMapping("/api/v1/row-permissions")
public class RowPermissionController {

    private static final List<String> ADMIN_ROLES = List.of("admin", "ROLE_ADMIN");

    private final RowPermissionObjectService objectService;

    public RowPermissionController(RowPermissionObjectService objectService) {
        this.objectService = objectService;
    }

    @GetMapping
    public R<List<RowPermissionDTO>> list() {
        requireAdmin();
        return R.ok(objectService.list().stream().map(this::toDTO).toList());
    }

    @GetMapping("/{id}")
    public R<RowPermissionDTO> get(@PathVariable Long id) {
        requireAdmin();
        return R.ok(toDTO(objectService.get(id)));
    }

    /** 候选条件列：所选数据源都能施加范围条件的列交集（配置辅助，保存仍逐源校验）。 */
    @GetMapping("/column-candidates")
    public R<List<RowPermissionObjectService.ColumnOption>> columnCandidates(
            @RequestParam(name = "dataSourceIds", required = false) String dataSourceIds) {
        requireAdmin();
        List<String> ids = dataSourceIds == null || dataSourceIds.isBlank()
                ? List.of()
                : Arrays.stream(dataSourceIds.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
        return R.ok(objectService.columnCandidates(ids));
    }

    @PostMapping
    public R<RowPermissionDTO> save(@RequestBody RowPermissionSaveRequest req) {
        requireAdmin();
        Detail saved = objectService.save(new Input(req.getId(), req.getName(), req.getRemark(),
                req.getConditions(), req.getDataSourceIds(), req.getFieldPolicies()));
        return R.ok(toDTO(saved));
    }

    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        requireAdmin();
        objectService.delete(id);
        return R.ok();
    }

    private RowPermissionDTO toDTO(Detail detail) {
        RowPermissionDTO dto = new RowPermissionDTO();
        dto.setId(detail.permission().getId());
        dto.setName(detail.permission().getName());
        dto.setRemark(detail.permission().getRemark());
        dto.setConditions(detail.conditions());
        dto.setDataSourceIds(detail.dataSourceIds());
        dto.setFieldPolicies(detail.fieldPolicies());
        dto.setGrants(detail.grants().stream().map(grant -> {
            RowPermissionDTO.GrantDTO item = new RowPermissionDTO.GrantDTO();
            item.setSubjectType(grant.subjectType());
            item.setSubjectKey(grant.subjectKey());
            return item;
        }).toList());
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
