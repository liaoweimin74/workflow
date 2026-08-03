package com.workflow.system.domain.dto;

import java.util.List;

public record UserQueryRequest(
        String username,
        String nickname,
        Integer status,
        Long orgId,
        List<Long> orgIds,
        List<Long> roleIds,
        Integer page,
        Integer size) {
}