package com.workflow.system.domain.vo;

import java.time.LocalDateTime;

public record UserVO(
        Long id,
        String username,
        String nickname,
        String email,
        String phone,
        String avatar,
        Long orgId,
        String orgName,
        Integer status,
        LocalDateTime createdAt,
        Long[] roleIds) {
}