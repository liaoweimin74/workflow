package com.workflow.system.service.impl;

import com.workflow.common.constant.GlobalConstant;
import com.workflow.common.domain.PageResult;
import com.workflow.common.exception.BusinessException;
import com.workflow.system.domain.dto.*;
import com.workflow.system.domain.entity.SysRole;
import com.workflow.system.domain.entity.SysRoleMenu;
import com.workflow.system.domain.vo.RoleVO;
import com.workflow.system.repository.SysRoleMenuRepository;
import com.workflow.system.repository.SysRoleRepository;
import com.workflow.system.repository.SysUserRoleRepository;
import com.workflow.system.service.RoleService;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;

@Service
public class RoleServiceImpl implements RoleService {
    private final SysRoleRepository roleRepository;
    private final SysRoleMenuRepository roleMenuRepository;
    private final SysUserRoleRepository userRoleRepository;

    public RoleServiceImpl(SysRoleRepository roleRepository, SysRoleMenuRepository roleMenuRepository,
                           SysUserRoleRepository userRoleRepository) {
        this.roleRepository = roleRepository;
        this.roleMenuRepository = roleMenuRepository;
        this.userRoleRepository = userRoleRepository;
    }

    @Override
    public PageResult<RoleVO> list(RoleQueryRequest query) {
        Specification<SysRole> spec = (root, cq, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("isDeleted"), GlobalConstant.DELETED_NO));
            if (StringUtils.hasText(query.roleName())) {
                predicates.add(cb.like(root.get("roleName"), "%" + query.roleName() + "%"));
            }
            if (StringUtils.hasText(query.roleCode())) {
                predicates.add(cb.like(root.get("roleCode"), "%" + query.roleCode() + "%"));
            }
            if (query.status() != null) {
                predicates.add(cb.equal(root.get("status"), query.status()));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };

        int page = query.page() != null ? Math.max(query.page(), 1) : 1;
        int size = query.size() != null ? query.size() : 10;
        PageRequest pageRequest = PageRequest.of(page - 1, size, Sort.by(Sort.Direction.DESC, "createdAt"));

        Page<SysRole> rolePage = roleRepository.findAll(spec, pageRequest);
        List<RoleVO> roleVOs = rolePage.getContent().stream()
                .map(this::toVO)
                .toList();
        return new PageResult<>(rolePage.getTotalElements(), page, size, roleVOs);
    }

    @Override
    @Transactional
    public RoleVO create(RoleCreateRequest request) {
        if (roleRepository.findByRoleCode(request.roleCode()).isPresent()) {
            throw new BusinessException("角色编码已存在");
        }
        SysRole role = new SysRole();
        role.setRoleName(request.roleName());
        role.setRoleCode(request.roleCode());
        role.setDescription(request.description());
        role.setStatus(request.status() != null ? request.status() : 1);
        role = roleRepository.save(role);
        return toVO(role);
    }

    @Override
    @Transactional
    public RoleVO update(Long id, RoleUpdateRequest request) {
        SysRole role = roleRepository.findById(id)
                .orElseThrow(() -> new BusinessException("角色不存在"));
        if (StringUtils.hasText(request.roleName())) role.setRoleName(request.roleName());
        if (request.description() != null) role.setDescription(request.description());
        if (request.status() != null) role.setStatus(request.status());
        role = roleRepository.save(role);
        return toVO(role);
    }

    @Override
    @Transactional
    public void delete(Long id) {
        if (!roleRepository.existsById(id)) {
            throw new BusinessException("角色不存在");
        }
        if (userRoleRepository.countByRoleId(id) > 0) {
            throw new BusinessException("该角色下存在用户，无法删除");
        }
        SysRole role = roleRepository.findById(id).orElseThrow();
        role.setIsDeleted(GlobalConstant.DELETED_YES);
        roleRepository.save(role);
    }

    @Override
    public List<Long> getRoleMenus(Long roleId) {
        return roleMenuRepository.findByRoleId(roleId).stream()
                .map(SysRoleMenu::getMenuId)
                .toList();
    }

    @Override
    @Transactional
    public void assignMenus(Long roleId, Long[] menuIds) {
        if (!roleRepository.existsById(roleId)) {
            throw new BusinessException("角色不存在");
        }
        roleMenuRepository.deleteByRoleId(roleId);
        for (Long menuId : menuIds) {
            SysRoleMenu rm = new SysRoleMenu();
            rm.setRoleId(roleId);
            rm.setMenuId(menuId);
            roleMenuRepository.save(rm);
        }
    }

    private RoleVO toVO(SysRole role) {
        return new RoleVO(role.getId(), role.getRoleName(), role.getRoleCode(),
                role.getDescription(), role.getStatus(), role.getCreatedAt());
    }
}
