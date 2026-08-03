package com.workflow.engine.form.repository;

import com.workflow.engine.form.entity.FormData;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FormDataRepository extends JpaRepository<FormData, String> {

    Optional<FormData> findByIdAndTenantId(String id, String tenantId);

    Optional<FormData> findByTenantIdAndProcessInstanceIdAndFormDefId(String tenantId, String processInstanceId, String formDefId);

    List<FormData> findByTenantIdAndProcessInstanceId(String tenantId, String processInstanceId);
}
