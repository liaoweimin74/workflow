package com.workflow.system.service.impl;

import com.workflow.common.constant.GlobalConstant;
import com.workflow.common.domain.PageResult;
import com.workflow.common.exception.BusinessException;
import com.workflow.system.domain.dto.UserCreateRequest;
import com.workflow.system.domain.dto.UserQueryRequest;
import com.workflow.system.domain.dto.UserUpdateRequest;
import com.workflow.system.domain.entity.SysOrganization;
import com.workflow.system.domain.entity.SysUser;
import com.workflow.system.domain.entity.SysUserRole;
import com.workflow.system.domain.vo.UserVO;
import com.workflow.system.repository.SysOrganizationRepository;
import com.workflow.system.repository.SysUserRepository;
import com.workflow.system.repository.SysUserRoleRepository;
import com.workflow.system.service.UserService;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

@Service
public class UserServiceImpl implements UserService {
    private final SysUserRepository userRepository;
    private final SysUserRoleRepository userRoleRepository;
    private final SysOrganizationRepository orgRepository;
    private final PasswordEncoder passwordEncoder;

    public UserServiceImpl(SysUserRepository userRepository, SysUserRoleRepository userRoleRepository,
                           SysOrganizationRepository orgRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.orgRepository = orgRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public PageResult<UserVO> list(UserQueryRequest query) {
        Specification<SysUser> spec = (root, cq, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("isDeleted"), GlobalConstant.DELETED_NO));
            if (StringUtils.hasText(query.username())) {
                predicates.add(cb.like(root.get("username"), "%" + query.username() + "%"));
            }
            if (query.status() != null) {
                predicates.add(cb.equal(root.get("status"), query.status()));
            }
            if (query.orgId() != null) {
                predicates.add(cb.equal(root.get("orgId"), query.orgId()));
            }

            // orgIds/roleIds 合并 OR 查询
            List<Predicate> orPredicates = new ArrayList<>();
            if (query.orgIds() != null && !query.orgIds().isEmpty()) {
                orPredicates.add(root.get("orgId").in(query.orgIds()));
            }
            if (query.roleIds() != null && !query.roleIds().isEmpty()) {
                Subquery<Long> sub = cq.subquery(Long.class);
                Root<SysUserRole> urRoot = sub.from(SysUserRole.class);
                sub.select(urRoot.get("userId"))
                        .where(cb.equal(urRoot.get("userId"), root.get("id")),
                                urRoot.get("roleId").in(query.roleIds()));
                orPredicates.add(root.get("id").in(sub));
            }
            if (!orPredicates.isEmpty()) {
                predicates.add(cb.or(orPredicates.toArray(new Predicate[0])));
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };

        int page = query.page() != null ? query.page() : 1;
        int size = query.size() != null ? query.size() : 10;
        PageRequest pageRequest = PageRequest.of(page - 1, size, Sort.by(Sort.Direction.DESC, "createdAt"));

        Page<SysUser> userPage = userRepository.findAll(spec, pageRequest);
        List<UserVO> userVOs = userPage.getContent().stream()
                .map(this::toVO)
                .toList();

        return new PageResult<>(userPage.getTotalElements(), page, size, userVOs);
    }

    @Override
    public UserVO getById(Long id) {
        SysUser user = userRepository.findById(id)
                .orElseThrow(() -> new BusinessException("用户不存在"));
        return toVO(user);
    }

    @Override
    @Transactional
    public UserVO create(UserCreateRequest request) {
        if (userRepository.findByUsername(request.username()).isPresent()) {
            throw new BusinessException("用户名已存在");
        }
        SysUser user = new SysUser();
        user.setUsername(request.username());
        user.setNickname(request.nickname());
        user.setPassword(passwordEncoder.encode(GlobalConstant.DEFAULT_PASSWORD));
        user.setEmail(request.email());
        user.setPhone(request.phone());
        user.setOrgId(request.orgId());
        user.setStatus(request.status() != null ? request.status() : 1);
        user = userRepository.save(user);

        if (request.roleIds() != null) {
            for (Long roleId : request.roleIds()) {
                SysUserRole ur = new SysUserRole();
                ur.setUserId(user.getId());
                ur.setRoleId(roleId);
                userRoleRepository.save(ur);
            }
        }
        return toVO(user);
    }

    @Override
    @Transactional
    public UserVO update(Long id, UserUpdateRequest request) {
        SysUser user = userRepository.findById(id)
                .orElseThrow(() -> new BusinessException("用户不存在"));
        if (StringUtils.hasText(request.nickname())) user.setNickname(request.nickname());
        if (StringUtils.hasText(request.email())) user.setEmail(request.email());
        if (StringUtils.hasText(request.phone())) user.setPhone(request.phone());
        if (request.orgId() != null) user.setOrgId(request.orgId());
        if (request.status() != null) user.setStatus(request.status());
        user = userRepository.save(user);
        Long userId = user.getId();

        // Update roles - delete old, insert new if changed
        if (request.roleIds() != null) {
            List<SysUserRole> existingRoles = userRoleRepository.findByUserId(userId);
            List<Long> existingRoleIds = existingRoles.stream().map(SysUserRole::getRoleId).sorted().toList();
            List<Long> newRoleIds = Arrays.stream(request.roleIds()).sorted().toList();

            if (!existingRoleIds.equals(newRoleIds)) {
                userRoleRepository.deleteByUserId(userId);
                userRoleRepository.flush();
                List<SysUserRole> newRoles = newRoleIds.stream().map(roleId -> {
                    SysUserRole ur = new SysUserRole();
                    ur.setUserId(userId);
                    ur.setRoleId(roleId);
                    return ur;
                }).toList();
                userRoleRepository.saveAll(newRoles);
            }
        }
        return toVO(user);
    }

    @Override
    @Transactional
    public void delete(Long id) {
        SysUser user = userRepository.findById(id)
                .orElseThrow(() -> new BusinessException("用户不存在"));
        user.setIsDeleted(GlobalConstant.DELETED_YES);
        userRepository.save(user);
    }

    @Override
    @Transactional
    public void updateStatus(Long id, Integer status) {
        SysUser user = userRepository.findById(id)
                .orElseThrow(() -> new BusinessException("用户不存在"));
        user.setStatus(status);
        userRepository.save(user);
    }

    @Override
    @Transactional
    public void resetPassword(Long id) {
        SysUser user = userRepository.findById(id)
                .orElseThrow(() -> new BusinessException("用户不存在"));
        user.setPassword(passwordEncoder.encode(GlobalConstant.DEFAULT_PASSWORD));
        userRepository.save(user);
    }

    @Override
    public List<UserVO> findByIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        return userRepository.findAllById(ids).stream()
                .map(this::toVO)
                .toList();
    }

    private UserVO toVO(SysUser user) {
        List<SysUserRole> userRoles = userRoleRepository.findByUserId(user.getId());
        Long[] roleIds = userRoles.stream().map(SysUserRole::getRoleId).toArray(Long[]::new);
        String orgName = null;
        if (user.getOrgId() != null) {
            orgName = orgRepository.findById(user.getOrgId())
                    .map(SysOrganization::getOrgName).orElse(null);
        }
        return new UserVO(user.getId(), user.getUsername(), user.getNickname(),
                user.getEmail(), user.getPhone(), user.getAvatar(),
                user.getOrgId(), orgName, user.getStatus(),
                user.getCreatedAt(), roleIds);
    }
}