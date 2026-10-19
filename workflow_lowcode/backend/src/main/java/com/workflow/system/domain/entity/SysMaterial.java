package com.workflow.system.domain.entity;

import com.workflow.common.domain.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/**
 * 远程物料注册实体（change: remote-materials）。
 *
 * <p>手写 Vue 页面/组件构建为单文件 ESM bundle 上传平台，本表存元数据与 manifest 原文；
 * bundle 文件落 {@code workflow.material.storage-path}，stored_name 由服务端生成（uuid.ext），
 * 杜绝路径穿越。同 material_key 重新上传为版本 +1 覆盖（不保留历史版本链）。
 */
@Entity
@Table(name = "sys_material", indexes = {
        @Index(name = "uk_sys_material_key", columnList = "material_key", unique = true),
        @Index(name = "idx_sys_material_type", columnList = "type"),
        @Index(name = "idx_sys_material_created_at", columnList = "created_at")
})
public class SysMaterial extends BaseEntity {

    public static final String TYPE_PAGE = "PAGE";
    public static final String TYPE_WIDGET = "WIDGET";

    @Column(name = "material_key", nullable = false, length = 100)
    private String materialKey;

    @Column(name = "name", nullable = false, length = 200)
    private String name;

    /** PAGE 页面型 / WIDGET 组件型。 */
    @Column(name = "type", nullable = false, length = 20)
    private String type;

    @Column(name = "version", nullable = false)
    private Integer version = 1;

    /** 物料要求的 SDK 主版本。 */
    @Column(name = "sdk_version", nullable = false, length = 20)
    private String sdkVersion;

    /** manifest 原文（JSON 文本，含 meta / 菜单建议）。 */
    @Column(name = "manifest_json", nullable = false, columnDefinition = "json")
    private String manifestJson;

    @Column(name = "stored_name", nullable = false, length = 128)
    private String storedName;

    @Column(name = "storage_path", nullable = false, length = 500)
    private String storagePath;

    @Column(name = "file_size", nullable = false)
    private Long fileSize = 0L;

    /** 1 启用 / 0 停用。 */
    @Column(name = "status", nullable = false)
    private Integer status = 1;

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
    public String getManifestJson() { return manifestJson; }
    public void setManifestJson(String manifestJson) { this.manifestJson = manifestJson; }
    public String getStoredName() { return storedName; }
    public void setStoredName(String storedName) { this.storedName = storedName; }
    public String getStoragePath() { return storagePath; }
    public void setStoragePath(String storagePath) { this.storagePath = storagePath; }
    public Long getFileSize() { return fileSize; }
    public void setFileSize(Long fileSize) { this.fileSize = fileSize; }
    public Integer getStatus() { return status; }
    public void setStatus(Integer status) { this.status = status; }
}
