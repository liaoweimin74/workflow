package com.workflow.system.repository;

import com.workflow.system.domain.entity.SysClient;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.Optional;

public interface SysClientRepository extends JpaRepository<SysClient, Long>,
        JpaSpecificationExecutor<SysClient> {

    Optional<SysClient> findByCodeAndIsDeleted(String code, Integer isDeleted);

    /** code 是否被占用（uk_client_code 全局唯一，与 node codeExists 同口径：不过滤 is_deleted）。 */
    boolean existsByCode(String code);

    boolean existsByCodeAndIdNot(String code, Long id);

    /** options 全量（含停用端，按 id 升序——node listOptions 语义）。 */
    List<SysClient> findAllByOrderByIdAsc();
}
