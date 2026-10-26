package com.workflow.system.repository;

import com.workflow.system.domain.entity.SysUserOpenid;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * 端身份绑定查询（J3 泛化：身份键 clientId+openid，替代 V64 的 appId+openid 单端链）。
 */
public interface SysUserOpenidRepository extends JpaRepository<SysUserOpenid, Long> {

    Optional<SysUserOpenid> findByClientIdAndOpenidAndIsDeleted(Long clientId, String openid, Integer isDeleted);

    Optional<SysUserOpenid> findByClientIdAndUserIdAndIsDeleted(Long clientId, Long userId, Integer isDeleted);

    /** A4 端身份 Tab：某账号的全部端绑定（含跨端，展示用途）。 */
    List<SysUserOpenid> findByUserIdAndIsDeleted(Long userId, Integer isDeleted);
}
