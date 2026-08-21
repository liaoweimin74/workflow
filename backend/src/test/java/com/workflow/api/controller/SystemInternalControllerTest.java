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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * SystemInternalController 测试：SYSTEM 内部 REST 接口
 * 部门树扁平化（parentId=root 时为空串）；用户分页；元数据只读标记；CRUD 委托。
 */
class SystemInternalControllerTest {

    private OrganizationService organizationService;
    private UserService userService;
    private SystemInternalController controller;

    @BeforeEach
    void setUp() {
        organizationService = mock(OrganizationService.class);
        userService = mock(UserService.class);
        controller = new SystemInternalController(organizationService, userService);
    }

    private TreeNode node(Long id, Long parentId, String label, String code, List<TreeNode> children) {
        return new TreeNode(id, parentId, label, code, 0, 1, children);
    }

    private UserVO user(Long id, String username, String nickname, Long orgId, String orgName, Integer status) {
        return new UserVO(id, username, nickname, null, null, null, orgId, orgName, status, null, null);
    }

    // ==================== READ: dept-tree ====================

    @Test
    void deptTree_flattensTreeWithParentId() {
        TreeNode root = node(1L, null, "技术部", "TECH", List.of(
                node(2L, 1L, "研发组", "RD", List.of())));
        when(organizationService.tree()).thenReturn(List.of(root));

        R<BizDataPageVO> r = controller.deptTree(null);

        assertThat(r.getData().getRecords()).hasSize(2);
        BizDataVO first = r.getData().getRecords().get(0);
        assertThat(first.getId()).isEqualTo("1");
        assertThat(first.getData().get("label")).isEqualTo("技术部");
        assertThat(first.getData().get("parentId")).isEqualTo(""); // 根节点 parentId 为空串
        BizDataVO second = r.getData().getRecords().get(1);
        assertThat(second.getId()).isEqualTo("2");
        assertThat(second.getData().get("parentId")).isEqualTo("1");
        assertThat(second.getData().get("label")).isEqualTo("研发组");
    }

    @Test
    void deptTree_keywordFiltersLabelAndCode() {
        TreeNode a = node(1L, null, "技术部", "TECH", List.of());
        TreeNode b = node(2L, null, "销售部", "SALE", List.of());
        when(organizationService.tree()).thenReturn(List.of(a, b));

        R<BizDataPageVO> r = controller.deptTree("技术");

        assertThat(r.getData().getRecords()).hasSize(1);
        assertThat(r.getData().getRecords().get(0).getData().get("label")).isEqualTo("技术部");
    }

    // ==================== READ: users ====================

    @Test
    void users_pagedFromUserService() {
        UserVO u = user(7L, "admin", "管理员", 1L, "技术部", 1);
        when(userService.list(any(UserQueryRequest.class)))
                .thenReturn(new PageResult<>(1L, 0, 20, List.of(u)));

        R<BizDataPageVO> r = controller.users("admin", 0, 20);

        assertThat(r.getData().getRecords()).hasSize(1);
        BizDataVO row = r.getData().getRecords().get(0);
        assertThat(row.getId()).isEqualTo("7");
        assertThat(row.getData().get("username")).isEqualTo("admin");
        assertThat(row.getData().get("nickname")).isEqualTo("管理员");
        assertThat(row.getData().get("orgName")).isEqualTo("技术部");
        assertThat(r.getData().getTotal()).isEqualTo(1L);
    }

    @Test
    void getUser_byId_mapsUserVO() {
        UserVO u = user(11L, "bob", "BOB", 2L, "销售部", 1);
        when(userService.getById(11L)).thenReturn(u);

        R<BizDataVO> r = controller.getUser("11");

        assertThat(r.getData().getId()).isEqualTo("11");
        assertThat(r.getData().getData().get("username")).isEqualTo("bob");
        assertThat(r.getData().getData().get("orgName")).isEqualTo("销售部");
    }

    @Test
    void getUser_notFound_throws404() {
        when(userService.getById(99L)).thenReturn(null);
        assertThatThrownBy(() -> controller.getUser("99"))
                .isInstanceOf(BusinessException.class);
    }

    // ==================== metadata ====================

    @Test
    void deptTreeMetadata_columnsAndWritable() {
        R<DataSourceMetadata> r = controller.deptTreeMetadata();
        assertThat(r.getData().getColumns()).hasSize(4);
        assertThat(r.getData().getColumns().stream().map(ColumnConfig::getKey))
                .containsExactly("id", "parentId", "label", "code");
        assertThat(r.getData().isWritable()).isTrue();
    }

    @Test
    void usersMetadata_columnsAndWritable() {
        R<DataSourceMetadata> r = controller.usersMetadata();
        assertThat(r.getData().getColumns()).hasSize(6);
        assertThat(r.getData().getColumns().stream().map(ColumnConfig::getKey))
                .containsExactly("id", "username", "nickname", "orgId", "orgName", "status");
        assertThat(r.getData().isWritable()).isTrue();
    }

    // ==================== CRUD: dept ====================

    @Test
    void createDept_delegatesAndReturnsId() {
        when(organizationService.create(any(OrganizationCreateRequest.class)))
                .thenReturn(node(5L, null, "测试部", "TEST", List.of()));
        R<BizDataVO> r = controller.createDept(Map.of("orgName", "测试部", "orgCode", "TEST"));
        assertThat(r.getData().getId()).isEqualTo("5");
        assertThat(r.getData().getData().get("label")).isEqualTo("测试部");
    }

    @Test
    void deleteDept_delegatesVoid() {
        R<Void> r = controller.deleteDept("3");
        verify(organizationService).delete(3L);
        assertThat(r.getCode()).isEqualTo(200);
    }

    // ==================== CRUD: users ====================

    @Test
    void createUser_delegatesAndReturnsId() {
        when(userService.create(any(UserCreateRequest.class)))
                .thenReturn(user(8L, "new", "新用户", 1L, "技术部", 1));
        R<BizDataVO> r = controller.createUser(Map.of("username", "new", "nickname", "新用户", "orgId", 1L));
        assertThat(r.getData().getId()).isEqualTo("8");
        assertThat(r.getData().getData().get("nickname")).isEqualTo("新用户");
    }

    @Test
    void deleteUser_delegatesVoid() {
        R<Void> r = controller.deleteUser("8");
        verify(userService).delete(8L);
        assertThat(r.getCode()).isEqualTo(200);
    }
}
