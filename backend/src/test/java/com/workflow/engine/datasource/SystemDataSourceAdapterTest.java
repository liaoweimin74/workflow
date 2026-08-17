package com.workflow.engine.datasource;

import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataVO;
import com.workflow.api.dto.DataSourceMetadata;
import com.workflow.common.domain.PageResult;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.system.domain.dto.UserQueryRequest;
import com.workflow.system.domain.vo.TreeNode;
import com.workflow.system.domain.vo.UserVO;
import com.workflow.system.service.OrganizationService;
import com.workflow.system.service.UserService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * SYSTEM 数据源适配器测试：
 * dept-tree 由 OrganizationService.tree() 递归扁平化；
 * user-tree 经 UserService.list() 分页；
 * 内置列定义；只读（写操作走 default 抛"不支持"）。
 */
@ExtendWith(MockitoExtension.class)
class SystemDataSourceAdapterTest {

    @Mock
    private OrganizationService organizationService;

    @Mock
    private UserService userService;

    private SystemDataSourceAdapter adapter;

    private SystemDataSourceAdapter adapter() {
        return new SystemDataSourceAdapter(organizationService, userService);
    }

    private DataSourceDefinition ds(String sourceKey) {
        DataSourceDefinition ds = new DataSourceDefinition();
        ds.setId("sys-1");
        ds.setName("系统数据");
        ds.setType("SYSTEM");
        ds.setSourceKey(sourceKey);
        ds.setStatus("ENABLED");
        return ds;
    }

    // ==================== supports / metadata ====================

    @Test
    void supportsOnlySystem() {
        adapter = adapter();
        assertTrue(adapter.supports("SYSTEM"));
        assertFalse(adapter.supports("FORM"));
        assertFalse(adapter.supports("API"));
    }

    @Test
    void metadata_deptTree_builtinColumns() {
        adapter = adapter();
        DataSourceMetadata meta = adapter.metadata(ds("dept-tree"));
        assertFalse(meta.isWritable());
        assertEquals(4, meta.getColumns().size());
        assertEquals("label", meta.getColumns().get(2).getKey());
    }

    @Test
    void metadata_userTree_builtinColumns() {
        adapter = adapter();
        DataSourceMetadata meta = adapter.metadata(ds("user-tree"));
        assertFalse(meta.isWritable());
        assertEquals(6, meta.getColumns().size());
    }

    // ==================== query ====================

    @Test
    void query_deptTree_flattensTree() {
        TreeNode child = new TreeNode(2L, 1L, "研发组", "RD", 1, 1, List.of());
        TreeNode root = new TreeNode(1L, null, "技术部", "TECH", 1, 1, List.of(child));
        when(organizationService.tree()).thenReturn(List.of(root));

        adapter = adapter();
        BizDataPageVO page = adapter.query(ds("dept-tree"), null);

        assertNotNull(page);
        assertEquals(2, page.getRecords().size());
        BizDataVO first = page.getRecords().get(0);
        assertEquals("1", first.getId());
        assertEquals("技术部", first.getData().get("label"));
        assertEquals("", first.getData().get("parentId"));
        BizDataVO second = page.getRecords().get(1);
        assertEquals("2", second.getId());
        assertEquals("1", second.getData().get("parentId"));
        assertEquals("研发组", second.getData().get("label"));
    }

    @Test
    void query_userTree_delegatesToUserService() {
        UserVO u = new UserVO(7L, "admin", "管理员", "a@x.com", "138", null, 1L, "技术部", 1, null, null);
        when(userService.list(any(UserQueryRequest.class)))
                .thenReturn(new PageResult<>(1L, 0, 20, List.of(u)));

        adapter = adapter();
        BizDataPageVO page = adapter.query(ds("user-tree"), new com.workflow.api.dto.BizDataQueryRequest());

        assertEquals(1, page.getRecords().size());
        BizDataVO row = page.getRecords().get(0);
        assertEquals("7", row.getId());
        assertEquals("admin", row.getData().get("username"));
        assertEquals("技术部", row.getData().get("orgName"));
        assertEquals(1L, page.getTotal());
    }

    // ==================== 只读 ====================

    @Test
    void writeOperations_notSupported() {
        adapter = adapter();
        DataSourceDefinition ds = ds("dept-tree");
        assertThrows(BusinessException.class, () -> adapter.create(ds, Map.of()));
        assertThrows(BusinessException.class, () -> adapter.update(ds, "1", Map.of(), null));
        assertThrows(BusinessException.class, () -> adapter.delete(ds, "1"));
    }

    @Test
    void get_returnsRowById_or404() {
        TreeNode root = new TreeNode(1L, null, "技术部", "TECH", 1, 1, List.of());
        when(organizationService.tree()).thenReturn(List.of(root));

        adapter = adapter();
        BizDataVO vo = adapter.get(ds("dept-tree"), "1");
        assertEquals("1", vo.getId());
        assertEquals("技术部", vo.getData().get("label"));

        assertThrows(BusinessException.class, () -> adapter.get(ds("dept-tree"), "999"));
    }
}