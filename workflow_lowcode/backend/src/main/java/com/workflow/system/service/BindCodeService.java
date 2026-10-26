package com.workflow.system.service;

import com.workflow.system.domain.entity.SysBindCode;
import com.workflow.system.domain.vo.BindCodeVO;

/**
 * 端内首绑绑定码服务（J3，spec client-login-identity「绑定码流程」）。
 *
 * <p>载体裁定（ledger D1）：表 sys_bind_code——工程无 redis 配置、logout No-op 已钉 Redis disabled；
 * expires_at 列表达 TTL、used 列表达一次性，行为可在 H2/单测验证。
 */
public interface BindCodeService {

    /**
     * 管理员为「账号 × 端」签发一次性绑定码（30 分钟 TTL，SecureRandom 12 位大写字母数字防枚举）。
     * 用户不存在/停用或端不存在/停用 → 400。
     */
    BindCodeVO issue(Long userId, Long clientId);

    /**
     * 端内首绑时消费绑定码：校验存在、未用、未过期、归属端匹配后置 used=1。
     * 任何失败统一 401（端不匹配复用「无效或已过期」文案，不暴露码的真实归属）。
     */
    SysBindCode consume(String code, Long clientId);
}
