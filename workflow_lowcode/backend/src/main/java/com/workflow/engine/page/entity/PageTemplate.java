package com.workflow.engine.page.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 页面模板实体。
 * 存储自定义页面的 schema 快照（{rule,option,dataSources,actions}，保留原始 ds ID），
 * 供「另存为模板」沉淀与实例化/导入复用。无版本与发布状态（只读快照 + 覆盖更新）。
 */
@Entity
@Table(name = "wf_page_template",
       uniqueConstraints = @UniqueConstraint(name = "uk_page_template_tenant_key", columnNames = {"tenant_id", "`key`"}),
       indexes = {
               @Index(name = "idx_page_template_tenant_updated", columnList = "tenant_id, updated_at")
       })
public class PageTemplate {

    @Id
    @Column(name = "id", length = 64, nullable = false)
    private String id;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "name", length = 255, nullable = false)
    private String name;

    @Column(name = "`key`", length = 255, nullable = false)
    private String key;

    /**
     * 页面 schema JSON 快照：{rule, option, dataSources, actions}。
     */
    @Lob
    @Column(name = "`schema`", columnDefinition = "LONGTEXT")
    private String schema;

    /**
     * schema 结构版本（模板文件/快照演进用），当前为 1。
     */
    @Column(name = "schema_version", nullable = false)
    private Integer schemaVersion = 1;

    /**
     * 模板形态：full=全量快照（含数据源绑定与字段级配置）；skeleton=骨架（槽位化数据源，
     * refId 置空，联动拓扑保留，数据语义清空）。空值视为 full（存量数据）。
     */
    @Column(name = "kind", length = 20, nullable = false)
    private String kind = "full";

    @Column(name = "created_by", length = 50)
    private String createdBy;

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

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }

    public String getSchema() { return schema; }
    public void setSchema(String schema) { this.schema = schema; }

    public Integer getSchemaVersion() { return schemaVersion; }
    public void setSchemaVersion(Integer schemaVersion) { this.schemaVersion = schemaVersion; }

    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
