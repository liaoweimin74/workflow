package com.workflow.engine.logicflow.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.LocalDateTime;

/**
 * 表单 × 逻辑编排绑定：声明「某表单在某个触发点自动运行某条已发布逻辑流」。
 *
 * <p>触发点（triggerType）覆盖业务表单增删改前后与审批表单快照后：
 * <ul>
 *   <li>BEFORE_CREATE / AFTER_CREATE / BEFORE_UPDATE / AFTER_UPDATE /
 *       BEFORE_DELETE / AFTER_DELETE（BUSINESS 业务表单，BizData 链路）；</li>
 *   <li>AFTER_SNAPSHOT（WORKFLOW 审批表单，任务快照保存后）。</li>
 * </ul>
 *
 * <p>失败语义由触发点性质决定：BEFORE_* 失败一律拒绝操作（校验语义）；
 * AFTER_* 按 executionMode：SYNC_IN_TX（默认，同事务，失败回滚主操作）|
 * AFTER_COMMIT（事务提交后执行，失败仅留运行历史）。
 */
@Entity
@Table(name = "wf_form_logic_binding",
       uniqueConstraints = @UniqueConstraint(name = "uk_form_logic_binding",
               columnNames = {"tenant_id", "form_type", "form_key", "trigger_type", "flow_key"}),
       indexes = @Index(name = "idx_flb_form", columnList = "tenant_id, form_type, form_key"))
public class FormLogicBinding {

    @Column(name = "id", length = 64, nullable = false)
    @jakarta.persistence.Id
    private String id;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId = "default";

    /** 表单类型：BUSINESS（业务表单）| WORKFLOW（审批表单）。 */
    @Column(name = "form_type", length = 20, nullable = false)
    private String formType;

    /** 表单 key（BUSINESS = formKey；WORKFLOW = FormDefinition.key）。 */
    @Column(name = "form_key", length = 64, nullable = false)
    private String formKey;

    /** 触发点：BEFORE_CREATE/AFTER_CREATE/BEFORE_UPDATE/AFTER_UPDATE/BEFORE_DELETE/AFTER_DELETE/AFTER_SNAPSHOT。 */
    @Column(name = "trigger_type", length = 32, nullable = false)
    private String triggerType;

    /** 目标逻辑流 flowKey（运行时须为已发布状态）。 */
    @Column(name = "flow_key", length = 64, nullable = false)
    private String flowKey;

    /** 执行模式（仅 AFTER_* 有效）：SYNC_IN_TX | AFTER_COMMIT。 */
    @Column(name = "execution_mode", length = 20, nullable = false)
    private String executionMode = "SYNC_IN_TX";

    /** 是否启用（停用后调度跳过，配置保留）。 */
    @Column(name = "enabled", nullable = false)
    private Boolean enabled = Boolean.TRUE;

    @Column(name = "description", length = 500)
    private String description;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public String getFormType() { return formType; }
    public void setFormType(String formType) { this.formType = formType; }

    public String getFormKey() { return formKey; }
    public void setFormKey(String formKey) { this.formKey = formKey; }

    public String getTriggerType() { return triggerType; }
    public void setTriggerType(String triggerType) { this.triggerType = triggerType; }

    public String getFlowKey() { return flowKey; }
    public void setFlowKey(String flowKey) { this.flowKey = flowKey; }

    public String getExecutionMode() { return executionMode; }
    public void setExecutionMode(String executionMode) { this.executionMode = executionMode; }

    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean enabled) { this.enabled = enabled; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
