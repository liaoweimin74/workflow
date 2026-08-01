package com.workflow.system.service;

import java.util.List;

public interface OrganizationService {
    List<com.workflow.system.domain.vo.TreeNode> tree();

    com.workflow.system.domain.vo.TreeNode create(com.workflow.system.domain.dto.OrganizationCreateRequest request);

    com.workflow.system.domain.vo.TreeNode update(Long id, com.workflow.system.domain.dto.OrganizationUpdateRequest request);

    void delete(Long id);
}