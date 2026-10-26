package com.workflow.system.domain.vo;

import java.time.LocalDateTime;

/** 绑定码签发结果（A4 展示给用户，用户在目标端首绑时输入）。 */
public record BindCodeVO(String code, LocalDateTime expiresAt) {
}
