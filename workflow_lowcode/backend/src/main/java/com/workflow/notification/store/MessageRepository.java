package com.workflow.notification.store;

import com.workflow.notification.model.Message;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Collection;

/**
 * 消息 JPA Repository
 */
public interface MessageRepository extends JpaRepository<Message, Long>, JpaSpecificationExecutor<Message> {

    /**
     * 根据ID列表分页查询
     */
    Page<Message> findByIdIn(Collection<Long> ids, Pageable pageable);
}
