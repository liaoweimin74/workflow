package com.workflow.engine.form.bizdata;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * JOIN 目标表目录 —— 内建数据源作为声明式 JOIN 目标的物理映射（唯一事实源）。
 * <p>
 * 背景：声明式 JOIN（{@link JoinSqlGenerator}）原只支持业务表单目标（{@code wf_biz_<formKey>}）。
 * 需求扩展：目标表下拉应包含<b>内建数据源</b>（系统用户/组织机构等），让业务表单
 * 直接 JOIN 系统结构数据（如按 {@code user_id} 关联 {@code sys_user} 取 {@code nickname}）。
 * 对齐 NodeJS {@code backend-node/src/engine/form/bizdata/join-target-catalog.ts}（逐条一致）。
 * <p>
 * 【纳入范围】5 个结构化系统数据源 —— 底层物理表稳定、列映射干净：
 * 组织机构(sys_organization) / 系统用户(sys_user) / 系统菜单(sys_menu) /
 * 系统角色(sys_role) / 系统字典(sys_dict_type)。
 * 流程类 3 个（流程定义/流程实例/待办任务）的展示列多为跨表派生
 * （当前节点/发起人/流程名），无稳定物理列可 JOIN，暂不纳入。
 * <p>
 * 【列语义】{@code key} = 下拉选项值（<b>物理列名</b>，SQL 直接引用）；
 * {@code label} = 前端展示名；{@code columnType} = 虚拟列类型推导（对齐主表列语义）。
 * 派生列（如系统用户的 orgName 来自 JOIN sys_organization）不是物理列，不列入。
 * 注意与 {@code BuiltInSystemSources} 的 API 列（camelCase，取数适配面）互为两层，勿混用。
 * <p>
 * 消费方：
 * <ul>
 *   <li>{@link JoinSqlGenerator}：resolveJoinTargetTable（LEFT JOIN 表名解析）+ validateTargets；</li>
 *   <li>{@link BizDataSupport}：目标列类型解析（resolveJoinTargets）与预览入口 key 安全校验；</li>
 *   <li>{@code DataSourceDefinitionService}：保存校验 SYSTEM 目标物理列白名单。</li>
 * </ul>
 */
public final class JoinTargetCatalog {

    /** 单个内建 JOIN 目标列（key 即物理列名）。 */
    public record JoinTargetSystemColumn(String key, String label, String columnType) {
    }

    /** 单个内建 JOIN 目标数据源。 */
    public record JoinTargetSystemSource(String sourceKey, String table,
                                         List<JoinTargetSystemColumn> columns) {
    }

    /** 内建数据源 JOIN 主键列（各系统表统一 bigint 主键 id）。 */
    private static final JoinTargetSystemColumn ID_COLUMN =
            new JoinTargetSystemColumn("id", "主键 id", "BIGINT");

    /** 5 个结构化内建数据源的 JOIN 物理映射（列与 V1 baseline DDL 逐字段核对，Java 实体 @Column 同名印证）。 */
    public static final List<JoinTargetSystemSource> JOIN_TARGET_SYSTEM_SOURCES = List.of(
            new JoinTargetSystemSource("dept-tree", "sys_organization", List.of(
                    ID_COLUMN,
                    new JoinTargetSystemColumn("parent_id", "上级部门 id", "BIGINT"),
                    new JoinTargetSystemColumn("org_name", "部门名称", "VARCHAR"),
                    new JoinTargetSystemColumn("org_code", "部门编码", "VARCHAR"))),
            new JoinTargetSystemSource("user-tree", "sys_user", List.of(
                    ID_COLUMN,
                    new JoinTargetSystemColumn("username", "用户名", "VARCHAR"),
                    new JoinTargetSystemColumn("nickname", "昵称", "VARCHAR"),
                    new JoinTargetSystemColumn("org_id", "部门 id", "BIGINT"),
                    new JoinTargetSystemColumn("status", "状态", "TINYINT"))),
            new JoinTargetSystemSource("sys-menus", "sys_menu", List.of(
                    ID_COLUMN,
                    new JoinTargetSystemColumn("parent_id", "上级菜单 id", "BIGINT"),
                    new JoinTargetSystemColumn("menu_name", "菜单名称", "VARCHAR"),
                    new JoinTargetSystemColumn("menu_type", "菜单类型", "TINYINT"),
                    new JoinTargetSystemColumn("path", "路由路径", "VARCHAR"),
                    new JoinTargetSystemColumn("permission", "权限标识", "VARCHAR"),
                    new JoinTargetSystemColumn("sort_order", "排序", "TINYINT"))),
            new JoinTargetSystemSource("sys-roles", "sys_role", List.of(
                    ID_COLUMN,
                    new JoinTargetSystemColumn("role_name", "角色名称", "VARCHAR"),
                    new JoinTargetSystemColumn("role_code", "角色编码", "VARCHAR"),
                    new JoinTargetSystemColumn("description", "描述", "VARCHAR"),
                    new JoinTargetSystemColumn("status", "状态", "TINYINT"))),
            new JoinTargetSystemSource("sys-dicts", "sys_dict_type", List.of(
                    ID_COLUMN,
                    new JoinTargetSystemColumn("dict_code", "字典编码", "VARCHAR"),
                    new JoinTargetSystemColumn("dict_name", "字典名称", "VARCHAR"),
                    new JoinTargetSystemColumn("remark", "备注", "VARCHAR"),
                    new JoinTargetSystemColumn("status", "状态", "TINYINT"))));

    private JoinTargetCatalog() {
    }

    /** sourceKey → 定义（查无返回 {@code null}）。 */
    public static JoinTargetSystemSource joinTargetSystemByKey(String sourceKey) {
        if (sourceKey == null) {
            return null;
        }
        for (JoinTargetSystemSource s : JOIN_TARGET_SYSTEM_SOURCES) {
            if (s.sourceKey().equals(sourceKey)) {
                return s;
            }
        }
        return null;
    }

    /** 是否内建 JOIN 目标 key。 */
    public static boolean isJoinTargetSystemKey(String targetKey) {
        return joinTargetSystemByKey(targetKey) != null;
    }

    /** 内建目标的物理列列表（key 即物理列名）；非内建 key 返回 {@code null}。 */
    public static List<JoinTargetSystemColumn> systemColumns(String targetKey) {
        JoinTargetSystemSource system = joinTargetSystemByKey(targetKey);
        return system == null ? null : system.columns();
    }

    /** 内建目标的物理列集合（key 即物理列名，保序去重）；非内建 key 返回 {@code null}。 */
    public static Set<String> systemColumnKeys(String targetKey) {
        JoinTargetSystemSource system = joinTargetSystemByKey(targetKey);
        if (system == null) {
            return null;
        }
        Set<String> keys = new LinkedHashSet<>();
        for (JoinTargetSystemColumn c : system.columns()) {
            keys.add(c.key());
        }
        return keys;
    }

    /**
     * 内建目标的物理列类型：命中返回大写类型；目标/列任一未命中返回 {@code null}
     * （调用方 fallback，与 FORM 目标的「查不到 fallback VARCHAR」语义一致）。
     */
    public static String joinTargetSystemColumnType(String targetKey, String physicalColumn) {
        JoinTargetSystemSource system = joinTargetSystemByKey(targetKey);
        if (system == null) {
            return null;
        }
        for (JoinTargetSystemColumn c : system.columns()) {
            if (c.key().equals(physicalColumn)) {
                return c.columnType() == null ? null : c.columnType().toUpperCase();
            }
        }
        return null;
    }

    /**
     * JOIN 目标 key → 物理表名：内建数据源 → 系统物理表；其余按业务表单动态表拼接
     * （{@code wf_biz_<formKey>}，既有行为不变）。
     */
    public static String resolveJoinTargetTable(String targetKey) {
        JoinTargetSystemSource system = joinTargetSystemByKey(targetKey);
        return system != null ? system.table() : "wf_biz_" + targetKey;
    }
}
