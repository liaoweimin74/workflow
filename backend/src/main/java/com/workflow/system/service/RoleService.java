package com.workflow.system.service;

import com.workflow.common.domain.PageResult;
import com.workflow.system.domain.dto.*;

import java.util.List;

public interface RoleService {
    PageResult<com.workflow.system.domain.vo.RoleVO> list(RoleQueryRequest query);

    com.workflow.system.domain.vo.RoleVO create(RoleCreateRequest request);

    com.workflow.system.domain.vo.RoleVO update(Long id, RoleUpdateRequest request);

    void delete(Long id);

    List<Long> getRoleMenus(Long roleId);

    void assignMenus(Long roleId, Long[] menuIds);
}