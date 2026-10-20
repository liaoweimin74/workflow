package com.workflow.system.repository;

import com.workflow.system.domain.entity.SysUserOpenid;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SysUserOpenidRepository extends JpaRepository<SysUserOpenid, Long> {

    Optional<SysUserOpenid> findByAppIdAndOpenidAndIsDeleted(String appId, String openid, Integer isDeleted);

    Optional<SysUserOpenid> findByAppIdAndUserIdAndIsDeleted(String appId, Long userId, Integer isDeleted);
}
