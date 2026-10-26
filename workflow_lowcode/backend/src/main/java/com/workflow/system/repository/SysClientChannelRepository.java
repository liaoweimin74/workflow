package com.workflow.system.repository;

import com.workflow.system.domain.entity.SysClientChannel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface SysClientChannelRepository extends JpaRepository<SysClientChannel, Long> {

    Optional<SysClientChannel> findByClientIdAndChannelType(Long clientId, String channelType);

    List<SysClientChannel> findByClientIdIn(Collection<Long> clientIds);
}
