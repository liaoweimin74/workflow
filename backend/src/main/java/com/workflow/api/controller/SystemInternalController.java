package com.workflow.api.controller;

import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.api.dto.DataSourceMetadata;
import com.workflow.common.domain.PageResult;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.BuiltInSystemSourceQueryService;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.system.domain.dto.OrganizationCreateRequest;
import com.workflow.system.domain.dto.UserCreateRequest;
import com.workflow.system.domain.dto.UserQueryRequest;
import com.workflow.system.domain.vo.TreeNode;
import com.workflow.system.domain.vo.UserVO;
import com.workflow.system.service.OrganizationService;
import com.workflow.system.service.UserService;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * SYSTEM 内部 REST 控制器。
 * 部门树扁平化（parentId=root 时为空串）；用户分页；元数据只读标记；CRUD 委托。
 *
 * 这些端点不是给前端直接调的，而是<b>数据源 SPI 的另一半</b>：
 * {@code /api/v1/data-sources} 里类型为 SYSTEM 的数据源（部门树、用户、内建系统数据源）转发到这里。
 * 响应用 {@code BizDataVO} / {@code BizDataPageVO}，与业务表单数据同构，
 * 页面设计器才能用同一套渲染逻辑。
 */
@RestController
@RequestMapping("/api/v1/internal")
public class SystemInternalController {

    private final OrganizationService organizationService;
    private final UserService userService;
    private final BuiltInSystemSourceQueryService builtInSourceQuery;

    public SystemInternalController(OrganizationService organizationService,
                                    UserService userService,
                                    BuiltInSystemSourceQueryService builtInSourceQuery) {
        this.organizationService = organizationService;
        this.userService = userService;
        this.builtInSourceQuery = builtInSourceQuery;
    }

    // ==================== READ ====================

    /**
     * 部门树扁平化。根节点 parentId 为空串。
     * keyword 过滤 label 和 code（忽略大小写包含匹配）。
     */
    @GetMapping("/system/dept-tree")
    public R<BizDataPageVO> deptTree(@RequestParam(required = false) String keyword) {
        List<TreeNode> tree = organizationService.tree();
        List<BizDataVO> flattened = flattenTree(tree, keyword);
        BizDataPageVO page = new BizDataPageVO(flattened, flattened.size(), 0, flattened.size());
        return R.ok(page);
    }

    /**
     * 用户分页。
     */
    @GetMapping("/system/users")
    public R<BizDataPageVO> users(@RequestParam(required = false) String keyword,
                                  @RequestParam(defaultValue = "1") Integer page,
                                  @RequestParam(defaultValue = "20") Integer size) {
        int userServicePage = Math.max(page, 1);
        UserQueryRequest query = new UserQueryRequest(keyword, null, null, null, null, null, userServicePage, size);
        PageResult<UserVO> result = userService.list(query);
        List<BizDataVO> records = result.getRows().stream()
                .map(this::toUserRow)
                .collect(Collectors.toList());
        BizDataPageVO pageVo = new BizDataPageVO(records, result.getTotal(), userServicePage, size);
        return R.ok(pageVo);
    }

    /**
     * 根据 ID 查询用户。
     */
    @GetMapping("/system/users/{id}")
    public R<BizDataVO> getUser(@PathVariable String id) {
        UserVO user = userService.getById(Long.valueOf(id));
        if (user == null) {
            throw new BusinessException("用户不存在");
        }
        return R.ok(toUserRow(user));
    }

    // ==================== metadata ====================

    @GetMapping("/system/dept-tree/metadata")
    public R<DataSourceMetadata> deptTreeMetadata() {
        List<ColumnConfig> columns = List.of(
                columnConfig("id", "ID"),
                columnConfig("parentId", "父节点"),
                columnConfig("label", "名称"),
                columnConfig("code", "编码")
        );
        return R.ok(new DataSourceMetadata(columns, true));
    }

    @GetMapping("/system/users/metadata")
    public R<DataSourceMetadata> usersMetadata() {
        List<ColumnConfig> columns = List.of(
                columnConfig("id", "ID"),
                columnConfig("username", "用户名"),
                columnConfig("nickname", "昵称"),
                columnConfig("orgId", "组织ID"),
                columnConfig("orgName", "组织名称"),
                columnConfig("status", "状态")
        );
        return R.ok(new DataSourceMetadata(columns, true));
    }

    // ==================== CRUD: dept ====================

    @PostMapping("/system/dept")
    public R<BizDataVO> createDept(@RequestBody Map<String, Object> data) {
        String orgName = (String) data.get("orgName");
        String orgCode = (String) data.get("orgCode");
        OrganizationCreateRequest request = new OrganizationCreateRequest(null, orgName, orgCode, null, null);
        TreeNode node = organizationService.create(request);
        return R.ok(toDeptRow(node));
    }

    @DeleteMapping("/system/dept/{id}")
    public R<Void> deleteDept(@PathVariable String id) {
        organizationService.delete(Long.valueOf(id));
        return R.ok();
    }

    // ==================== CRUD: users ====================

    @PostMapping("/system/user")
    public R<BizDataVO> createUser(@RequestBody Map<String, Object> data) {
        String username = (String) data.get("username");
        String nickname = (String) data.get("nickname");
        Object orgIdObj = data.get("orgId");
        Long orgId = orgIdObj instanceof Number n ? n.longValue() : null;
        UserCreateRequest request = new UserCreateRequest(username, nickname, null, null, orgId, null, null);
        UserVO user = userService.create(request);
        return R.ok(toUserRow(user));
    }

    @DeleteMapping("/system/user/{id}")
    public R<Void> deleteUser(@PathVariable String id) {
        userService.delete(Long.valueOf(id));
        return R.ok();
    }

    // ==================== 内建系统数据源 REST 化取数（新 6 个，50-a） ====================
    //
    // 这些端点与数据源 SPI（adapter 直调服务）共享同一份实现（BuiltInSystemSourceQueryService），
    // 是 V39 迁移脚本预置的 params.list.action 的落点；也给前端/页面直连提供 REST 形状。取数均只读。

    /** 系统菜单列表（全量扁平化）。 */
    @GetMapping("/system/menus")
    public R<BizDataPageVO> systemMenus(@RequestParam(defaultValue = "1") Integer page,
                                        @RequestParam(defaultValue = "20") Integer size) {
        return R.ok(builtInSourceQuery.query("sys-menus", listRequest(page, size)));
    }

    /** 系统菜单元数据。 */
    @GetMapping("/system/menus/metadata")
    public R<DataSourceMetadata> systemMenusMetadata() {
        return R.ok(sourceMetadata("sys-menus"));
    }

    /** 系统角色列表（标准分页）。 */
    @GetMapping("/system/roles")
    public R<BizDataPageVO> systemRoles(@RequestParam(defaultValue = "1") Integer page,
                                        @RequestParam(defaultValue = "20") Integer size) {
        return R.ok(builtInSourceQuery.query("sys-roles", listRequest(page, size)));
    }

    /** 系统角色元数据。 */
    @GetMapping("/system/roles/metadata")
    public R<DataSourceMetadata> systemRolesMetadata() {
        return R.ok(sourceMetadata("sys-roles"));
    }

    /** 系统字典（类型）列表（标准分页）。 */
    @GetMapping("/system/dicts")
    public R<BizDataPageVO> systemDicts(@RequestParam(defaultValue = "1") Integer page,
                                        @RequestParam(defaultValue = "20") Integer size) {
        return R.ok(builtInSourceQuery.query("sys-dicts", listRequest(page, size)));
    }

    /** 系统字典元数据。 */
    @GetMapping("/system/dicts/metadata")
    public R<DataSourceMetadata> systemDictsMetadata() {
        return R.ok(sourceMetadata("sys-dicts"));
    }

    /** 流程定义列表（全量）。 */
    @GetMapping("/system/process/definitions")
    public R<BizDataPageVO> processDefinitions(@RequestParam(defaultValue = "1") Integer page,
                                               @RequestParam(defaultValue = "20") Integer size) {
        return R.ok(builtInSourceQuery.query("process-definitions", listRequest(page, size)));
    }

    /** 流程定义元数据。 */
    @GetMapping("/system/process/definitions/metadata")
    public R<DataSourceMetadata> processDefinitionsMetadata() {
        return R.ok(sourceMetadata("process-definitions"));
    }

    /** 流程实例列表（标准分页，运行中）。 */
    @GetMapping("/system/process/instances")
    public R<BizDataPageVO> processInstances(@RequestParam(defaultValue = "1") Integer page,
                                             @RequestParam(defaultValue = "20") Integer size) {
        return R.ok(builtInSourceQuery.query("process-instances", listRequest(page, size)));
    }

    /** 流程实例元数据。 */
    @GetMapping("/system/process/instances/metadata")
    public R<DataSourceMetadata> processInstancesMetadata() {
        return R.ok(sourceMetadata("process-instances"));
    }

    /** 待办任务列表（标准分页，按当前登录人过滤）。 */
    @GetMapping("/system/process/todo-tasks")
    public R<BizDataPageVO> processTodoTasks(@RequestParam(defaultValue = "1") Integer page,
                                             @RequestParam(defaultValue = "20") Integer size) {
        return R.ok(builtInSourceQuery.query("todo-tasks", listRequest(page, size)));
    }

    /** 待办任务元数据。 */
    @GetMapping("/system/process/todo-tasks/metadata")
    public R<DataSourceMetadata> processTodoTasksMetadata() {
        return R.ok(sourceMetadata("todo-tasks"));
    }

    // ==================== helpers ====================

    private ColumnConfig columnConfig(String key, String label) {
        ColumnConfig c = new ColumnConfig();
        c.setKey(key);
        c.setLabel(label);
        return c;
    }

    /** 内建数据源取数请求（page/size 缺省与 users 端点同默认：1/20）。 */
    private BizDataQueryRequest listRequest(Integer page, Integer size) {
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setPage(Math.max(page == null ? 1 : page, 1));
        req.setSize(size == null ? 20 : size);
        return req;
    }

    /**
     * 内建数据源元数据（列来自目录常量 BuiltInSystemSources）。
     * 与既有 deptTreeMetadata/usersMetadata 同构传 writable=true。
     */
    private DataSourceMetadata sourceMetadata(String sourceKey) {
        List<ColumnConfig> columns = new ArrayList<>();
        for (ColumnConfig c : builtInSourceQuery.columnsOf(sourceKey)) {
            columns.add(columnConfig(c.getKey(), c.getLabel()));
        }
        return new DataSourceMetadata(columns, true);
    }

    private List<BizDataVO> flattenTree(List<TreeNode> nodes, String keyword) {
        List<BizDataVO> result = new ArrayList<>();
        if (nodes == null) return result;
        for (TreeNode node : nodes) {
            flattenNode(node, result, keyword);
        }
        return result;
    }

    private void flattenNode(TreeNode node, List<BizDataVO> result, String keyword) {
        if (node == null) return;
        boolean matches = keyword == null || keyword.isEmpty()
                || (node.label() != null && node.label().toLowerCase().contains(keyword.toLowerCase()))
                || (node.code() != null && node.code().toLowerCase().contains(keyword.toLowerCase()));
        if (matches) {
            result.add(toDeptRow(node));
        }
        if (node.children() != null) {
            for (TreeNode child : node.children()) {
                flattenNode(child, result, keyword);
            }
        }
    }

    private BizDataVO toDeptRow(TreeNode node) {
        Map<String, Object> data = new HashMap<>();
        data.put("parentId", node.parentId() != null ? String.valueOf(node.parentId()) : "");
        data.put("label", node.label());
        data.put("code", node.code());
        return new BizDataVO(String.valueOf(node.id()), data, null, null, null);
    }

    private BizDataVO toUserRow(UserVO user) {
        Map<String, Object> data = new HashMap<>();
        data.put("username", user.username());
        data.put("nickname", user.nickname());
        data.put("orgId", user.orgId());
        data.put("orgName", user.orgName());
        data.put("status", user.status());
        return new BizDataVO(String.valueOf(user.id()), data, null, null, null);
    }
}
