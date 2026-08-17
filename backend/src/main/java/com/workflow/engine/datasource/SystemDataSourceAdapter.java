package com.workflow.engine.datasource;

import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.api.dto.DataSourceMetadata;
import com.workflow.common.domain.PageResult;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.system.domain.dto.UserQueryRequest;
import com.workflow.system.domain.vo.TreeNode;
import com.workflow.system.domain.vo.UserVO;
import com.workflow.system.service.OrganizationService;
import com.workflow.system.service.UserService;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * SYSTEM 数据源适配器：系统内置数据（部门树/用户列表）。
 * sourceKey 约定：dept-tree（部门树，组织架构）、user-tree（用户列表）。
 * 只读数据源：metadata/query/get 实现，写操作继承 default 抛"该数据源不支持XX"。
 */
@Component
public class SystemDataSourceAdapter implements DataSourceAdapter {

    /** 部门树列定义（组织架构树） */
    private static final List<ColumnConfig> DEPT_COLUMNS = List.of(
            column("id", "部门 ID", "VARCHAR", 64),
            column("parentId", "上级部门 ID", "VARCHAR", 64),
            column("label", "部门名称", "VARCHAR", 128),
            column("code", "部门编码", "VARCHAR", 64));

    /** 用户列表列定义 */
    private static final List<ColumnConfig> USER_COLUMNS = List.of(
            column("id", "用户 ID", "VARCHAR", 64),
            column("username", "用户名", "VARCHAR", 64),
            column("nickname", "昵称", "VARCHAR", 64),
            column("orgId", "部门 ID", "VARCHAR", 64),
            column("orgName", "部门名称", "VARCHAR", 128),
            column("status", "状态", "TINYINT", 1));

    private final OrganizationService organizationService;
    private final UserService userService;

    public SystemDataSourceAdapter(OrganizationService organizationService, UserService userService) {
        this.organizationService = organizationService;
        this.userService = userService;
    }

    @Override
    public boolean supports(String type) {
        return "SYSTEM".equals(type);
    }

    @Override
    public DataSourceMetadata metadata(DataSourceDefinition ds) {
        if ("user-tree".equals(ds.getSourceKey())) {
            return new DataSourceMetadata(USER_COLUMNS, false);
        }
        return new DataSourceMetadata(DEPT_COLUMNS, false);
    }

    @Override
    public BizDataPageVO query(DataSourceDefinition ds, BizDataQueryRequest req) {
        if ("user-tree".equals(ds.getSourceKey())) {
            return queryUsers(req);
        }
        return queryDeptTree();
    }

    @Override
    public BizDataVO get(DataSourceDefinition ds, String id) {
        // SYSTEM 数据源为只读树/列表，单条按 id 不适用（树节点 id 查询可后续扩展）
        List<BizDataVO> all = query(ds, new BizDataQueryRequest()).getRecords();
        for (BizDataVO row : all) {
            if (row.getId().equals(id)) return row;
        }
        throw new com.workflow.common.exception.BusinessException(404, "系统数据不存在: " + id);
    }

    // ==================== 内部实现 ====================

    private BizDataPageVO queryDeptTree() {
        List<BizDataVO> rows = new ArrayList<>();
        for (TreeNode node : organizationService.tree()) {
            collectNode(node, rows);
        }
        return new BizDataPageVO(rows, rows.size(), 0, rows.size());
    }

    private void collectNode(TreeNode node, List<BizDataVO> out) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", String.valueOf(node.id()));
        data.put("parentId", node.parentId() == null ? "" : String.valueOf(node.parentId()));
        data.put("label", node.label() == null ? "" : node.label());
        data.put("code", node.code() == null ? "" : node.code());
        out.add(new BizDataVO(String.valueOf(node.id()), data, null, null, null));
        if (node.children() != null) {
            for (TreeNode child : node.children()) {
                collectNode(child, out);
            }
        }
    }

    private BizDataPageVO queryUsers(BizDataQueryRequest req) {
        UserQueryRequest query = new UserQueryRequest(
                req.getKeyword(), null, null, null, null, null, req.getPage(), req.getSize());
        PageResult<UserVO> page = userService.list(query);
        List<BizDataVO> rows = new ArrayList<>();
        for (UserVO u : page.getRows() == null ? List.<UserVO>of() : page.getRows()) {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("id", String.valueOf(u.id()));
            data.put("username", u.username());
            data.put("nickname", u.nickname() == null ? "" : u.nickname());
            data.put("orgId", u.orgId() == null ? "" : String.valueOf(u.orgId()));
            data.put("orgName", u.orgName() == null ? "" : u.orgName());
            data.put("status", u.status());
            rows.add(new BizDataVO(String.valueOf(u.id()), data, null, null, null));
        }
        return new BizDataPageVO(rows, page.getTotal(), req.getPage(), req.getSize());
    }

    private static ColumnConfig column(String key, String label, String type, int length) {
        ColumnConfig c = new ColumnConfig();
        c.setKey(key);
        c.setLabel(label);
        c.setColumnType(type);
        c.setLength(length);
        return c;
    }
}
