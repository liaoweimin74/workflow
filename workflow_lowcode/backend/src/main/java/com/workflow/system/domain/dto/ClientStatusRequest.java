package com.workflow.system.domain.dto;

import jakarta.validation.constraints.NotNull;

/** 客户端状态变更请求（portal 停用由 service 拒绝）。 */
public record ClientStatusRequest(@NotNull Integer status) {
}
