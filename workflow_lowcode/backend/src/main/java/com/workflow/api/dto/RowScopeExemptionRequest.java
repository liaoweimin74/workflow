package com.workflow.api.dto;

import com.workflow.engine.datasource.scope.DataScopeAction;

/** 覆盖度豁免登记请求。 */
public class RowScopeExemptionRequest {

    private String dataSourceId;
    private DataScopeAction action;
    private String reason;

    public String getDataSourceId() { return dataSourceId; }
    public void setDataSourceId(String dataSourceId) { this.dataSourceId = dataSourceId; }
    public DataScopeAction getAction() { return action; }
    public void setAction(DataScopeAction action) { this.action = action; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
}
