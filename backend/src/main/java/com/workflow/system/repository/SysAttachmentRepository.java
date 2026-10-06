package com.workflow.system.repository;

import com.workflow.system.domain.entity.SysAttachment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

/**
 * 附件元数据仓储（Task 146）。
 */
public interface SysAttachmentRepository extends JpaRepository<SysAttachment, Long> {

    List<SysAttachment> findByIdInAndIsDeleted(Collection<Long> ids, Integer isDeleted);
}
