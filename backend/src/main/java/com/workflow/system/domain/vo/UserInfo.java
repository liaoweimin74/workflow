package com.workflow.system.domain.vo;

import java.util.List;
import java.util.Set;

public record UserInfo(
        Long id,
        String username,
        String nickname,
        String email,
        String phone,
        String avatar,
        Long orgId,
        String orgName,
        List<String> roles,
        Set<String> permissions) {
}