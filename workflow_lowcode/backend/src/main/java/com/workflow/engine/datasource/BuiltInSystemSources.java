package com.workflow.engine.datasource;

import com.workflow.engine.form.column.ColumnConfig;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 系统内建数据源目录 —— <b>唯一事实源</b>（对齐 NodeJS
 * {@code backend-node/src/engine/datasource/service/system-source-catalog.ts}）。
 *
 * <p>消费方（各自取所需，改这里一处全联动）：
 * <ul>
 *   <li>{@code db/migration/V39__builtin_data_sources.sql}：启动迁移按本目录幂等预置
 *       {@code wf_data_source} 行（初始化职责已从旧启动播种器
 *       {@code SystemDataSourceInitializer} 迁入 Flyway）；</li>
 *   <li>{@link UnifiedDataSourceAdapter}：SYSTEM 元数据列 / 取数分支；</li>
 *   <li>{@link InternalDataSourceRouter} 与 {@link DataSourceDefinitionService}：
 *       SYSTEM sourceKey 白名单（原来两处各抄一份 {@code [dept-tree, user-tree]}，已收编）；</li>
 *   <li>{@code com.workflow.api.controller.SystemInternalController}：内建数据源的
 *       REST 化取数端点。</li>
 * </ul>
 *
 * <p>【语义】这 8 个数据源是系统管理 / 流程管理的内建结构数据（系统菜单、系统用户、
 * 组织机构、系统角色、系统字典、流程定义、流程实例、待办任务），<b>预置且受保护</b>：
 * 全部 ENABLED、跨租户可见（靠 {@code type='SYSTEM'} 的 SQL OR 条件）、不允许改名/删除/禁用
 * （{@code tenant_id = BUILT_IN_TENANT} 判定，见
 * {@link DataSourceDefinitionService} 的写保护）。
 */
public final class BuiltInSystemSources {

    /** 内建数据源所在租户（保留域，不与真实租户冲突；跨租户可见由 type='SYSTEM' 保证）。 */
    public static final String BUILT_IN_TENANT = "system";

    /** 内建数据源固定 id 前缀（迁移幂等预置的判定键，可读、稳定）。 */
    public static final String BUILT_IN_ID_PREFIX = "ds-builtin-";

    /** 取数模式：full=返回全部行（外壳 page=0,size=rows.length）；paged=标准分页。 */
    public static final String PAGING_FULL = "full";

    /** 取数模式：标准分页（total/page/size 来自请求）。 */
    public static final String PAGING_PAGED = "paged";

    /**
     * 单个内建系统数据源定义。
     *
     * @param sourceKey sourceKey（SYSTEM 类型白名单键，REST 映射见
     *                  {@link BuiltInSystemSources#mapSystemInternalPath}）
     * @param name      预置名称（数据源列表展示）
     * @param columns   列定义（metadata 输出；与 adapter 旧 DEPT/USER 列常量同构）
     * @param paging    取数模式：{@link #PAGING_FULL} / {@link #PAGING_PAGED}
     */
    public record BuiltInSystemSource(String sourceKey, String name,
                                      List<ColumnConfig> columns, String paging) {
    }

    // ==================== 列常量（对齐 NodeJS catalog，逐字段一致） ====================

    /** 部门树列常量（历史既有，字段与旧 adapter DEPT_COLUMNS 逐字段一致）。 */
    public static final List<ColumnConfig> DEPT_COLUMNS = List.of(
            column("id", "部门 ID", "VARCHAR", 64),
            column("parentId", "上级部门 ID", "VARCHAR", 64),
            column("label", "部门名称", "VARCHAR", 128),
            column("code", "部门编码", "VARCHAR", 64));

    /** 用户列常量（历史既有，字段与旧 adapter USER_COLUMNS 逐字段一致）。 */
    public static final List<ColumnConfig> USER_COLUMNS = List.of(
            column("id", "用户 ID", "VARCHAR", 64),
            column("username", "用户名", "VARCHAR", 64),
            column("nickname", "昵称", "VARCHAR", 64),
            column("orgId", "部门 ID", "VARCHAR", 64),
            column("orgName", "部门名称", "VARCHAR", 128),
            column("status", "状态", "TINYINT", 1));

    /** 菜单列常量（{@code MenuService.tree()} 字段面）。 */
    public static final List<ColumnConfig> MENU_COLUMNS = List.of(
            column("id", "菜单 ID", "VARCHAR", 64),
            column("parentId", "上级菜单 ID", "VARCHAR", 64),
            column("menuName", "菜单名称", "VARCHAR", 128),
            column("menuType", "类型", "TINYINT", 1),
            column("path", "路由路径", "VARCHAR", 255),
            column("permission", "权限标识", "VARCHAR", 128),
            column("sortOrder", "排序", "INTEGER"));

    /** 角色列常量（{@code RoleService.list()} 字段面）。 */
    public static final List<ColumnConfig> ROLE_COLUMNS = List.of(
            column("id", "角色 ID", "VARCHAR", 64),
            column("roleName", "角色名称", "VARCHAR", 128),
            column("roleCode", "角色编码", "VARCHAR", 64),
            column("description", "描述", "VARCHAR", 255),
            column("status", "状态", "TINYINT", 1));

    /** 字典类型列常量（{@code DictTypeService.list()} 字段面）。 */
    public static final List<ColumnConfig> DICT_COLUMNS = List.of(
            column("id", "字典 ID", "VARCHAR", 64),
            column("dictCode", "字典编码", "VARCHAR", 64),
            column("dictName", "字典名称", "VARCHAR", 128),
            column("remark", "备注", "VARCHAR", 255),
            column("status", "状态", "TINYINT", 1));

    /** 流程定义列常量（{@code ProcessService.listSummaries()} 字段面）。 */
    public static final List<ColumnConfig> PROCESS_DEF_COLUMNS = List.of(
            column("id", "流程定义 ID", "VARCHAR", 64),
            column("key", "流程标识", "VARCHAR", 64),
            column("name", "流程名称", "VARCHAR", 128),
            column("version", "版本", "INTEGER"));

    /** 流程实例列常量（{@code ProcessInstanceService.listProcessInstances()} 字段面）。 */
    public static final List<ColumnConfig> PROCESS_INSTANCE_COLUMNS = List.of(
            column("id", "实例 ID", "VARCHAR", 64),
            column("name", "实例名称", "VARCHAR", 128),
            column("processDefinitionName", "流程名称", "VARCHAR", 128),
            column("businessKey", "业务标识", "VARCHAR", 64),
            column("currentNode", "当前节点", "VARCHAR", 128),
            column("status", "状态", "VARCHAR", 32),
            column("startTime", "发起时间", "VARCHAR", 64));

    /** 待办任务列常量（{@code WorkflowTaskService.listTodoTasksVO()} 字段面；主键字段是 taskId 不是 id）。 */
    public static final List<ColumnConfig> TODO_TASK_COLUMNS = List.of(
            column("taskId", "任务 ID", "VARCHAR", 64),
            column("currentNodeName", "当前节点", "VARCHAR", 128),
            column("processName", "流程名称", "VARCHAR", 128),
            column("assignee", "办理人", "VARCHAR", 64),
            column("initiatorName", "发起人", "VARCHAR", 64),
            column("createTime", "创建时间", "VARCHAR", 64));

    // ==================== 目录 ====================

    /** 8 个系统内建数据源（顺序即预置顺序；前 2 个是历史既有 key，后 6 个 50-a 新增）。 */
    public static final List<BuiltInSystemSource> BUILT_IN_SYSTEM_SOURCES = List.of(
            new BuiltInSystemSource("dept-tree", "组织机构", DEPT_COLUMNS, PAGING_FULL),
            new BuiltInSystemSource("user-tree", "系统用户", USER_COLUMNS, PAGING_PAGED),
            new BuiltInSystemSource("sys-menus", "系统菜单", MENU_COLUMNS, PAGING_FULL),
            new BuiltInSystemSource("sys-roles", "系统角色", ROLE_COLUMNS, PAGING_PAGED),
            new BuiltInSystemSource("sys-dicts", "系统字典", DICT_COLUMNS, PAGING_PAGED),
            new BuiltInSystemSource("process-definitions", "流程定义", PROCESS_DEF_COLUMNS, PAGING_FULL),
            new BuiltInSystemSource("process-instances", "流程实例", PROCESS_INSTANCE_COLUMNS, PAGING_PAGED),
            new BuiltInSystemSource("todo-tasks", "待办任务", TODO_TASK_COLUMNS, PAGING_PAGED));

    /** 内建 sourceKey 集合（SYSTEM 类型白名单 = 本目录；由目录派生防两处漂移）。 */
    public static final Set<String> SOURCE_KEYS = BUILT_IN_SYSTEM_SOURCES.stream()
            .map(BuiltInSystemSource::sourceKey)
            .collect(Collectors.toUnmodifiableSet());

    private BuiltInSystemSources() {
    }

    /** 按 sourceKey 取内建定义；未知 key 返回 {@code null}。 */
    public static BuiltInSystemSource byKey(String sourceKey) {
        if (sourceKey == null) {
            return null;
        }
        for (BuiltInSystemSource source : BUILT_IN_SYSTEM_SOURCES) {
            if (source.sourceKey().equals(sourceKey)) {
                return source;
            }
        }
        return null;
    }

    /**
     * sourceKey → 内部 REST 路径段（对齐 NodeJS {@code mapSystemInternalPath}）。
     *
     * <p>{@code dept-tree} / {@code user-tree} 是历史契约（dept-tree 原样、user-tree → users）；
     * 新 6 个按语义命名，指向 {@code SystemInternalController} 的对应端点。
     * 未知 key 返回空串（调用方据此抛「未注册的系统数据源」）。
     */
    public static String mapSystemInternalPath(String sourceKey) {
        return switch (sourceKey == null ? "" : sourceKey) {
            case "dept-tree" -> "dept-tree";
            case "user-tree" -> "users";
            case "sys-menus" -> "menus";
            case "sys-roles" -> "roles";
            case "sys-dicts" -> "dicts";
            case "process-definitions" -> "process/definitions";
            case "process-instances" -> "process/instances";
            case "todo-tasks" -> "process/todo-tasks";
            default -> "";
        };
    }

    /** 列定义工厂（对齐 adapter 旧 {@code column} helper；length 传 null 表示不设长度）。 */
    private static ColumnConfig column(String key, String label, String type, Integer length) {
        ColumnConfig c = new ColumnConfig();
        c.setKey(key);
        c.setLabel(label);
        c.setColumnType(type);
        c.setLength(length);
        return c;
    }
}
