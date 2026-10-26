package com.workflow.system.repository;

import com.workflow.system.domain.entity.SysUserDevice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * 推送设备绑定查询（J3 落表；业务读写归 J5/P2）。
 */
public interface SysUserDeviceRepository extends JpaRepository<SysUserDevice, Long> {

    List<SysUserDevice> findByUserIdAndClientIdAndIsDeleted(Long userId, Long clientId, Integer isDeleted);
}
