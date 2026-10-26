package com.workflow.api.dto;

import java.util.List;

/**
 * 页面发布请求体（A5 发布目标端）。
 *
 * <p>clientIds = sys_client.id 列表；null/空 = 缺省仅 portal(1)，
 * 与不带 body 的老调用完全同口径（存量零破坏）。
 */
public record PagePublishRequest(List<Long> clientIds) {
}
