package com.workflow.api.dto;

import com.workflow.system.domain.entity.SysMaterial;

import java.time.LocalDateTime;

/**
 * 物料列表项 DTO（remote-materials）。
 */
public class MaterialDTO {

    private Long id;
    private String materialKey;
    private String name;
    private String type;
    private Integer version;
    private String sdkVersion;
    private Integer status;
    private Long fileSize;
    private LocalDateTime createdAt;

    public static MaterialDTO of(SysMaterial m) {
        MaterialDTO dto = new MaterialDTO();
        dto.setId(m.getId());
        dto.setMaterialKey(m.getMaterialKey());
        dto.setName(m.getName());
        dto.setType(m.getType());
        dto.setVersion(m.getVersion());
        dto.setSdkVersion(m.getSdkVersion());
        dto.setStatus(m.getStatus());
        dto.setFileSize(m.getFileSize());
        dto.setCreatedAt(m.getCreatedAt());
        return dto;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getMaterialKey() { return materialKey; }
    public void setMaterialKey(String materialKey) { this.materialKey = materialKey; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }
    public String getSdkVersion() { return sdkVersion; }
    public void setSdkVersion(String sdkVersion) { this.sdkVersion = sdkVersion; }
    public Integer getStatus() { return status; }
    public void setStatus(Integer status) { this.status = status; }
    public Long getFileSize() { return fileSize; }
    public void setFileSize(Long fileSize) { this.fileSize = fileSize; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
