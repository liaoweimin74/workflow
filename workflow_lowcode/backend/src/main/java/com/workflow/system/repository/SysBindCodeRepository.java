package com.workflow.system.repository;

import com.workflow.system.domain.entity.SysBindCode;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * 绑定码数据访问（J3，一次性+TTL 校验在 BindCodeService 落地）。
 */
public interface SysBindCodeRepository extends JpaRepository<SysBindCode, Long> {

    Optional<SysBindCode> findByCode(String code);
}
