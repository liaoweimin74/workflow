package com.workflow.api.dto;

import com.workflow.engine.datasource.scope.DataScopeAction;
import com.workflow.engine.datasource.scope.RowScopeCoverageStatus;

import java.time.LocalDateTime;
import java.util.List;

/** 数据范围覆盖度盘点：每个可施加范围的启用数据源 × 读写轴。 */
public class RowScopeCoverageVO {

    private List<SourceCoverage> sources;
    private int totalAxes;
    private int coveredAxes;
    private int exemptAxes;
    private int gapAxes;

    public List<SourceCoverage> getSources() { return sources; }
    public void setSources(List<SourceCoverage> sources) { this.sources = sources; }
    public int getTotalAxes() { return totalAxes; }
    public void setTotalAxes(int totalAxes) { this.totalAxes = totalAxes; }
    public int getCoveredAxes() { return coveredAxes; }
    public void setCoveredAxes(int coveredAxes) { this.coveredAxes = coveredAxes; }
    public int getExemptAxes() { return exemptAxes; }
    public void setExemptAxes(int exemptAxes) { this.exemptAxes = exemptAxes; }
    public int getGapAxes() { return gapAxes; }
    public void setGapAxes(int gapAxes) { this.gapAxes = gapAxes; }

    public static class SourceCoverage {

        private String dataSourceId;
        private String name;
        private String type;
        private AxisCoverage read;
        private AxisCoverage write;

        public String getDataSourceId() { return dataSourceId; }
        public void setDataSourceId(String dataSourceId) { this.dataSourceId = dataSourceId; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getType() { return type; }
        public void setType(String type) { this.type = type; }
        public AxisCoverage getRead() { return read; }
        public void setRead(AxisCoverage read) { this.read = read; }
        public AxisCoverage getWrite() { return write; }
        public void setWrite(AxisCoverage write) { this.write = write; }
    }

    public static class AxisCoverage {

        private DataScopeAction action;
        private RowScopeCoverageStatus status;
        private List<String> permissionNames;
        private RowScopeExemptionVO exemption;

        public DataScopeAction getAction() { return action; }
        public void setAction(DataScopeAction action) { this.action = action; }
        public RowScopeCoverageStatus getStatus() { return status; }
        public void setStatus(RowScopeCoverageStatus status) { this.status = status; }
        public List<String> getPermissionNames() { return permissionNames; }
        public void setPermissionNames(List<String> permissionNames) { this.permissionNames = permissionNames; }
        public RowScopeExemptionVO getExemption() { return exemption; }
        public void setExemption(RowScopeExemptionVO exemption) { this.exemption = exemption; }
    }

    public static class RowScopeExemptionVO {

        private Long id;
        private String dataSourceId;
        private DataScopeAction action;
        private String reason;
        private String createdBy;
        private LocalDateTime createdAt;
        private String revokedBy;
        private LocalDateTime revokedAt;

        public Long getId() { return id; }
        public void setId(Long id) { this.id = id; }
        public String getDataSourceId() { return dataSourceId; }
        public void setDataSourceId(String dataSourceId) { this.dataSourceId = dataSourceId; }
        public DataScopeAction getAction() { return action; }
        public void setAction(DataScopeAction action) { this.action = action; }
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
