package com.workflow.engine.datasource.scope;

/**
 * 数据范围的主体类型（一条规则挂在谁身上）。
 *
 * <p>当前只支持角色：授权的唯一入口是「角色管理 → 数据权限」，按人/部门/成员组授权没有配置入口，
 * 也没有解析路径。真要放开个性化授权时，加枚举值 + 解析器分支 + 授权入口三处一起补。
 */
public enum DataScopeSubject {

    /** 角色（sys_role.role_code）。 */
    ROLE
}
