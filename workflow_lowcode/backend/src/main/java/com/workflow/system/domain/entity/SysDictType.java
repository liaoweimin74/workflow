package com.workflow.system.domain.entity;

import com.workflow.common.domain.entity.BaseEntity;
import jakarta.persistence.*;

@Entity
@Table(name = "sys_dict_type")
public class SysDictType extends BaseEntity {
    @Column(name = "dict_name", nullable = false, length = 100)
    private String dictName;

    @Column(name = "dict_code", nullable = false, length = 50, unique = true)
    private String dictCode;

    @Column(length = 255)
    private String remark;

    @Column(nullable = false)
    private Integer status = 1;

    public String getDictName() { return dictName; }
    public void setDictName(String dictName) { this.dictName = dictName; }
    public String getDictCode() { return dictCode; }
    public void setDictCode(String dictCode) { this.dictCode = dictCode; }
    public String getRemark() { return remark; }
    public void setRemark(String remark) { this.remark = remark; }
    public Integer getStatus() { return status; }
    public void setStatus(Integer status) { this.status = status; }
}