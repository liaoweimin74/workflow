package com.workflow.engine.datasource.scope;

/**
 * 数据范围的主体类型（一条规则挂在谁身上）。
 *
 * <p>{@link #MEMBER_GROUP} 复用成员组（sys_member_group）：客户/商户分组天然要走这条路，
 * 早于「客户端主体」落地定好，P0.4 不用再改一次表。
 */
public enum DataScopeSubject {

    /** 角色（sys_role.role_code）。 */
    ROLE,

    /** 指定用户（sys_user.id）。 */
    USER,

    /** 所属组织（sys_user.org_id，单值，不含下级）。 */
    ORG,

    /** 成员组（sys_member_group.id）。 */
    MEMBER_GROUP
}
