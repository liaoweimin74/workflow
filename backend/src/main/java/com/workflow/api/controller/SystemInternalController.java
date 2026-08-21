package com.workflow.api.controller;

import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataVO;
import com.workflow.api.dto.DataSourceMetadata;
import com.workflow.common.domain.PageResult;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
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
 */
@RestController
@RequestMapping("/api/v1/internal")
public class SystemInternalController {

    private final OrganizationService organizationService;
    private final UserService userService;

    public SystemInternalController(OrganizationService organizationService, UserService userService) {
        this.organizationService = organizationService;
        this.userService = userService;
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
                                  @RequestParam(defaultValue = "0") Integer page,
                                  @RequestParam(defaultValue = "20") Integer size) {
        UserQueryRequest query = new UserQueryRequest(keyword, null, null, null, null, null, page, size);
        PageResult<UserVO> result = userService.list(query);
        List<BizDataVO> records = result.getRows().stream()
                .map(this::toUserRow)
                .collect(Collectors.toList());
        BizDataPageVO pageVo = new BizDataPageVO(records, result.getTotal(), page, size);
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

    // ==================== helpers ====================

    private ColumnConfig columnConfig(String key, String label) {
        ColumnConfig c = new ColumnConfig();
        c.setKey(key);
        c.setLabel(label);
        return c;
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
