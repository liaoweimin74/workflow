package com.workflow.system.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 本人改密。上限 64 位是给 BCrypt 留余量（它只消费前 72 字节）。 */
public record ChangePasswordRequest(
        @NotBlank(message = "请输入旧密码") String oldPassword,
        @NotBlank(message = "请输入新密码")
        @Size(min = 6, max = 64, message = "新密码长度需在 6-64 位之间") String newPassword) {
}
