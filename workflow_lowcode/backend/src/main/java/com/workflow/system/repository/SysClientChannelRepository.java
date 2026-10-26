package com.workflow.system.repository;

import com.workflow.system.domain.entity.SysClientChannel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface SysClientChannelRepository extends JpaRepository<SysClientChannel, Long> {

    Optional<SysClientChannel> findByClientIdAndChannelType(Long clientId, String channelType);

    List<SysClientChannel> findByClientIdIn(Collection<Long> clientIds);

    /** 列表/详情组装：批量取渠道，按 channel_type 升序稳定输出（对齐 node listChannelsByClientIds）。 */
    List<SysClientChannel> findByClientIdInOrderByChannelTypeAsc(Collection<Long> clientIds);
}
