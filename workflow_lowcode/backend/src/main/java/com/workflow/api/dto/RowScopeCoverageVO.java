package com.workflow.api.dto;

import com.workflow.engine.datasource.scope.RowScopeCoverageStatus;

import java.time.LocalDateTime;
import java.util.List;

/** 覆盖度盘点视图：每个可施加范围的数据源一条。 */
public class RowScopeCoverageVO {

    private List<SourceCoverage> sources;
    private int totalSources;
    private int coveredSources;
    private int noGrantSources;
    private int exemptSources;
    private int gapSources;

    public List<SourceCoverage> getSources() { return sources; }
    public void setSources(List<SourceCoverage> sources) { this.sources = sources; }
    public int getTotalSources() { return totalSources; }
    public void setTotalSources(int totalSources) { this.totalSources = totalSources; }
    public int getCoveredSources() { return coveredSources; }
    public void setCoveredSources(int coveredSources) { this.coveredSources = coveredSources; }
    public int getNoGrantSources() { return noGrantSources; }
    public void setNoGrantSources(int noGrantSources) { this.noGrantSources = noGrantSources; }
    public int getExemptSources() { return exemptSources; }
    public void setExemptSources(int exemptSources) { this.exemptSources = exemptSources; }
    public int getGapSources() { return gapSources; }
    public void setGapSources(int gapSources) { this.gapSources = gapSources; }

    public static class SourceCoverage {

        private String dataSourceId;
        private String name;
        private String type;
        private Coverage coverage;

        public String getDataSourceId() { return dataSourceId; }
        public void setDataSourceId(String dataSourceId) { this.dataSourceId = dataSourceId; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getType() { return type; }
        public void setType(String type) { this.type = type; }
        public Coverage getCoverage() { return coverage; }
        public void setCoverage(Coverage coverage) { this.coverage = coverage; }
    }

    /** 数据源的覆盖判定（v3 单态：关联即受控，不再有读写轴）。 */
    public static class Coverage {

        private RowScopeCoverageStatus status;
        private List<String> permissionNames;
        private RowScopeExemptionVO exemption;

        public RowScopeCoverageStatus getStatus() { return status; }
        public void setStatus(RowScopeCoverageStatus status) { this.status = status; }
        public List<String> getPermissionNames() { return permissionNames; }
        public void setPermissionNames(List<String> permissionNames) { this.permissionNames = permissionNames; }
        public RowScopeExemptionVO getExemption() { return exemption; }
        public void setExemption(RowScopeExemptionVO exemption) { this.exemption = exemption; }
    }

    /** 豁免记录（撤销只软撤销，记录永不删除）。 */
    public static class RowScopeExemptionVO {

        private Long id;
        private String dataSourceId;
        private String reason;
        private String createdBy;
        private LocalDateTime createdAt;
        private String revokedBy;
        private LocalDateTime revokedAt;

        public Long getId() { return id; }
        public void setId(Long id) { this.id = id; }
        public String getDataSourceId() { return dataSourceId; }
        public void setDataSourceId(String dataSourceId) { this.dataSourceId = dataSourceId; }
        public String getReason() { return reason; }
        public void setReason(String reason) { this.reason = reason; }
        public String getCreatedBy() { return createdBy; }
        public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
        public LocalDateTime getCreatedAt() { return createdAt; }
        public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
        public String getRevokedBy() { return revokedBy; }
        public void setRevokedBy(String revokedBy) { this.revokedBy = revokedBy; }
        public LocalDateTime getRevokedAt() { return revokedAt; }
        public void setRevokedAt(LocalDateTime revokedAt) { this.revokedAt = revokedAt; }
    }
}
