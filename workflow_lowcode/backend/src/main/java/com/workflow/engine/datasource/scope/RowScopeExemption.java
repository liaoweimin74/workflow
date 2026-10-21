package com.workflow.engine.datasource.scope;

import com.workflow.common.domain.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 覆盖度豁免：某数据源「已知未关联权限对象（不受控）」的显式留痕。
 *
 * <p>「未关联 = 全量可见」是白名单模型的必要代价，豁免不是隐藏告警，而是把决定写下来：
 * 谁在什么时候、因为什么理由接受这个缺口。撤销是软撤销（revokedAt/revokedBy），
 * 记录永不删除，否则事后无法回答「这个缺口当初是谁拍的板」。
 */
@Entity
@Table(name = "wf_row_scope_exemption")
public class RowScopeExemption extends BaseEntity {

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "data_source_id", length = 64, nullable = false)
    private String dataSourceId;

    @Column(name = "reason", length = 500, nullable = false)
    private String reason;

    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    @Column(name = "revoked_by", length = 50)
    private String revokedBy;

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }
    public String getDataSourceId() { return dataSourceId; }
    public void setDataSourceId(String dataSourceId) { this.dataSourceId = dataSourceId; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public LocalDateTime getRevokedAt() { return revokedAt; }
    public void setRevokedAt(LocalDateTime revokedAt) { this.revokedAt = revokedAt; }
    public String getRevokedBy() { return revokedBy; }
    public void setRevokedBy(String revokedBy) { this.revokedBy = revokedBy; }
}
