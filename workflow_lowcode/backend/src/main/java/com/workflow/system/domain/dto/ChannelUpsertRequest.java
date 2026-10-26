package com.workflow.system.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.Map;

/**
 * 渠道开通/更新请求（channelType 走 body，对齐 node PUT :id/channels）。
 *
 * <p>config.secret 三态：缺失/空串=清除；'******'=保留原密文；其他=明文（service 加密落库）。
 */
public record ChannelUpsertRequest(
        @NotBlank String channelType,
        @NotNull Integer enabled,
        Map<String, Object> config) {
}
