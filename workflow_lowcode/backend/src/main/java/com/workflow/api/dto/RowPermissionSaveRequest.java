package com.workflow.api.dto;

import java.util.List;
import java.util.Map;

/**
 * 权限对象保存请求（对象视角）。
 *
 * <p>只维护条件与数据源关联；授权（主体 × 读写轴）唯一入口是「角色管理 → 数据权限」，
 * 请求里带 grants 也不会被写入授权表。
 */
public class RowPermissionSaveRequest {

    /** 编辑已有对象时传 id；新建留空 */
    private Long id;

    private String name;
    private String remark;

    /** 条件数组 [{column,op,value}, ...]，组内 AND；空数组拒绝保存 */
    private List<Map<String, Object>> conditions;

    /** 关联的数据源 id；至少一个，且须为可施加范围（FORM / SQL）的类型 */
    private List<String> dataSourceIds;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getRemark() { return remark; }
    public void setRemark(String remark) { this.remark = remark; }
    public List<Map<String, Object>> getConditions() { return conditions; }
    public void setConditions(List<Map<String, Object>> conditions) { this.conditions = conditions; }
    public List<String> getDataSourceIds() { return dataSourceIds; }
    public void setDataSourceIds(List<String> dataSourceIds) { this.dataSourceIds = dataSourceIds; }
}
