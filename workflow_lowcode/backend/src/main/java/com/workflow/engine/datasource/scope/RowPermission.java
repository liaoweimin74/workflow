package com.workflow.engine.datasource.scope;

import com.workflow.common.domain.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/**
 * 行权限对象：一组 AND 条件 + 名称，可关联多个数据源、授予多个主体。
 *
 * <p>条件用 JSON 数组存（{@code [{column,op,value}, ...]}），顺序即语义的一部分但不参与匹配：
 * 同一个对象的条件按 AND 组合，多个对象之间在查询时取并集（OR）。
 * 对象内部不支持 OR —— 需要 OR 就建第二个对象，这正是「并集」要表达的东西。
 */
@Entity
@Table(name = "wf_row_permission")
public class RowPermission extends BaseEntity {

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "name", length = 100, nullable = false)
    private String name;

    @Column(name = "remark", length = 255)
    private String remark;

    @Column(name = "conditions_json", nullable = false, columnDefinition = "TEXT")
    private String conditionsJson;

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getRemark() { return remark; }
    public void setRemark(String remark) { this.remark = remark; }
    public String getConditionsJson() { return conditionsJson; }
    public void setConditionsJson(String conditionsJson) { this.conditionsJson = conditionsJson; }
}
