package com.workflow.engine.task;

import com.workflow.system.domain.entity.SysRole;
import com.workflow.system.domain.entity.SysUserRole;
import com.workflow.system.repository.SysRoleRepository;
import com.workflow.system.repository.SysUserRepository;
import com.workflow.system.repository.SysUserRoleRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 角色/管理员解析器（审批人 role 类型与 to_admin 策略的共享查询点）。
 *
 * <p>对齐 NodeJS 端 buildResolutionContext：
 * roleMemberships = 角色编码 → 启用角色（status=1）的成员用户 ID 列表；
 * adminUserId = sys_user 中 username='admin' 的用户。
 */
@Component
public class RoleMembershipResolver {

    private static final Logger log = LoggerFactory.getLogger(RoleMembershipResolver.class);

    private final SysRoleRepository sysRoleRepository;
    private final SysUserRoleRepository sysUserRoleRepository;
    private final SysUserRepository sysUserRepository;

    public RoleMembershipResolver(SysRoleRepository sysRoleRepository,
                                  SysUserRoleRepository sysUserRoleRepository,
                                  SysUserRepository sysUserRepository) {
        this.sysRoleRepository = sysRoleRepository;
        this.sysUserRoleRepository = sysUserRoleRepository;
        this.sysUserRepository = sysUserRepository;
    }

    /**
     * 角色编码 → 成员用户 ID 列表（字符串化，与引擎任务 assignee 口径一致）。
     */
    public List<String> membersOfRole(String roleCode) {
        if (roleCode == null || roleCode.isBlank()) {
            return List.of();
        }
        try {
            List<SysRole> roles = sysRoleRepository.findAll();
            Long roleId = null;
            for (SysRole role : roles) {
                if (roleCode.equals(role.getRoleCode())
                        && Integer.valueOf(0).equals(role.getIsDeleted())
                        && (role.getStatus() == null || role.getStatus() == 1)) {
                    roleId = role.getId();
                    break;
                }
            }
            if (roleId == null) {
                return List.of();
            }
            List<SysUserRole> links = sysUserRoleRepository.findAll();
            Set<String> userIds = new LinkedHashSet<>();
            for (SysUserRole link : links) {
                if (roleId.equals(link.getRoleId()) && link.getUserId() != null) {
                    userIds.add(String.valueOf(link.getUserId()));
                }
            }
            return new ArrayList<>(userIds);
        } catch (Exception e) {
            log.warn("解析角色成员失败 roleCode={}: {}", roleCode, e.getMessage());
            return List.of();
        }
    }

    /**
     * 多角色并集（保序去重）。
     */
    public List<String> membersOfRoles(List<String> roleCodes) {
        Set<String> out = new LinkedHashSet<>();
        if (roleCodes != null) {
            for (String code : roleCodes) {
                out.addAll(membersOfRole(code));
            }
        }
        return new ArrayList<>(out);
    }

    /**
     * 审批管理员用户 ID（username='admin'）；找不到返回 null。
     */
    public String findAdminUserId() {
        try {
            return sysUserRepository.findByUsername("admin")
                    .map(u -> String.valueOf(u.getId()))
                    .orElse(null);
        } catch (Exception e) {
            log.warn("查询审批管理员失败: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 全量角色成员映射（键为角色编码）。
     */
    public Map<String, List<String>> loadRoleMemberships() {
        Map<String, List<String>> out = new HashMap<>();
        try {
            List<SysRole> roles = sysRoleRepository.findAll();
            List<SysUserRole> links = sysUserRoleRepository.findAll();
            for (SysRole role : roles) {
                if (role.getRoleCode() == null
                        || !Integer.valueOf(0).equals(role.getIsDeleted())
                        || (role.getStatus() != null && role.getStatus() != 1)) {
                    continue;
                }
                List<String> members = out.computeIfAbsent(role.getRoleCode(), k -> new ArrayList<>());
                for (SysUserRole link : links) {
                    if (role.getId().equals(link.getRoleId()) && link.getUserId() != null) {
                        members.add(String.valueOf(link.getUserId()));
                    }
                }
            }
        } catch (Exception e) {
            log.warn("加载角色成员映射失败: {}", e.getMessage());
        }
        return out;
    }
}
