package com.workflow.identity.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "wf_tenant")
public class WorkflowTenant {

    @Id
    @Column(length = 64)
    private String id;

    @Column(nullable = false, length = 255)
    private String name;

    @Column(length = 20)
    private String status = "ACTIVE";

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}