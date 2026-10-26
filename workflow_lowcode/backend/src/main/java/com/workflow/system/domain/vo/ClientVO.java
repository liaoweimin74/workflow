package com.workflow.system.domain.vo;

import java.util.List;

/** 客户端详情/列表行 VO（camelCase 对齐前端 A1；channels 内 secret 已掩码）。 */
public record ClientVO(
        Long id,
        String code,
        String name,
        String icon,
        Integer status,
        Long defaultRoleId,
        Long defaultMemberGroupId,
        List<ClientChannelVO> channels) {
}
