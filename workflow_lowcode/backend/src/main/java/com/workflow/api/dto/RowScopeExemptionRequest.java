package com.workflow.api.dto;

/** 覆盖度豁免登记请求（v3：豁免挂在数据源上，不再分读写轴）。 */
public class RowScopeExemptionRequest {

    private String dataSourceId;
    private String reason;

    public String getDataSourceId() { return dataSourceId; }
    public void setDataSourceId(String dataSourceId) { this.dataSourceId = dataSourceId; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
}
