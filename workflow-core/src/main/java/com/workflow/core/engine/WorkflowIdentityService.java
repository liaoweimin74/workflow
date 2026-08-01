package com.workflow.core.engine;

import com.workflow.core.tenant.TenantProvider;
import com.workflow.model.entity.WorkflowUser;
import com.workflow.model.entity.WorkflowUserRole;
import com.workflow.model.repository.WorkflowUserRepository;
import com.workflow.model.repository.WorkflowUserRoleRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class WorkflowIdentityService {

    private final WorkflowUserRepository userRepository;
    private final WorkflowUserRoleRepository userRoleRepository;
    private final TenantProvider tenantProvider;

    public WorkflowIdentityService(WorkflowUserRepository userRepository,
                                   WorkflowUserRoleRepository userRoleRepository,
                                   TenantProvider tenantProvider) {
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.tenantProvider = tenantProvider;
    }

    public Optional<WorkflowUser> getUserById(String userId) {
        String tenantId = tenantProvider.getTenantId();
        return userRepository.findByTenantIdAndId(tenantId, userId);
    }

    public Optional<WorkflowUser> getUserByUsername(String username) {
        String tenantId = tenantProvider.getTenantId();
        return userRepository.findByTenantIdAndUsername(tenantId, username);
    }

    public List<String> getUserGroups(String userId) {
        List<WorkflowUserRole> userRoles = userRoleRepository.findByUserId(userId);
        return userRoles.stream()
                .map(WorkflowUserRole::getRoleId)
                .toList();
    }
}