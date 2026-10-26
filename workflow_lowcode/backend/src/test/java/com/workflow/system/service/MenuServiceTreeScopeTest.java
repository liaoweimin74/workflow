package com.workflow.system.service;

import com.workflow.system.domain.dto.MenuCreateRequest;
import com.workflow.system.domain.entity.SysMenu;
import com.workflow.system.domain.vo.MenuTree;
import com.workflow.system.repository.SysClientChannelRepository;
import com.workflow.system.repository.SysClientRepository;
import com.workflow.system.repository.SysMenuRepository;
import com.workflow.system.service.impl.MenuServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 管理端 /api/menus/tree 按端作用域契约（J5 检查发现的移植缺口，对齐 backend-node
 * menu-scope.spec.ts 与 AuthServiceImpl 登录树的 J4 裁定③口径）：
 *
 * 1. clientId 缺省 → 归一 portal(1)；他端节点（如移动端分区根）不得泄入门户树；
 * 2. 传 clientId → 只返回该端的根与子树；
 * 3. 树节点 VO 携带 clientId（前端按端 Tab 与 treeSelect 依赖）；
 * 4. create 必须透传请求的 clientId——否则非 portal 端新建菜单会落进 portal 树。
 */
@ExtendWith(MockitoExtension.class)
// 各用例只用到公共夹具的一部分桩，放宽为 LENIENT（对齐 MenuServiceMoveTest）
@MockitoSettings(strictness = Strictness.LENIENT)
class MenuServiceTreeScopeTest {

    static final int DIR = 0;
    static final int MENU = 1;

    @Mock
    SysMenuRepository menuRepository;
    @Mock
    SysClientRepository clientRepository;
    @Mock
    SysClientChannelRepository channelRepository;

    @InjectMocks
    MenuServiceImpl menuService;

    private SysMenu node(long id, Long parentId, int menuType, long clientId) {
        SysMenu menu = new SysMenu();
        menu.setId(id);
        menu.setParentId(parentId);
        menu.setMenuName("menu-" + id);
        menu.setMenuType(menuType);
        menu.setSortOrder(0);
        menu.setStatus(1);
        menu.setClientId(clientId);
        return menu;
    }

    @Test
    void treeOmittedNormalizesToPortalAndExcludesForeignClient() {
        SysMenu portalRoot = node(1L, null, DIR, 1L);
        SysMenu portalChild = node(10L, 1L, MENU, 1L);
        SysMenu foreignChild = node(11L, 1L, MENU, 2L); // 跨端子节点（脏数据）必须被过滤
        when(menuRepository.findByClientIdAndParentIdIsNullOrderBySortOrder(1L))
                .thenReturn(List.of(portalRoot));
        when(menuRepository.findByParentIdOrderBySortOrder(1L))
                .thenReturn(List.of(portalChild, foreignChild));
        when(menuRepository.findByParentIdOrderBySortOrder(10L)).thenReturn(List.of());

        List<MenuTree> tree = menuService.tree(null);

        assertThat(tree).hasSize(1);
        assertThat(tree.get(0).clientId()).isEqualTo(1L);
        assertThat(tree.get(0).children()).extracting(MenuTree::id).containsExactly(10L);
    }

    @Test
    void treeByClientIdReturnsOnlyThatClientsZoneRoots() {
        SysMenu tabs = node(9338L, null, DIR, 2L);
        tabs.setComponent("mzone:tabs");
        SysMenu grid = node(9339L, null, DIR, 2L);
        grid.setComponent("mzone:grid");
        when(menuRepository.findByClientIdAndParentIdIsNullOrderBySortOrder(2L))
                .thenReturn(List.of(tabs, grid));
        when(menuRepository.findByParentIdOrderBySortOrder(9338L)).thenReturn(List.of());
        when(menuRepository.findByParentIdOrderBySortOrder(9339L)).thenReturn(List.of());

        List<MenuTree> tree = menuService.tree(2L);

        assertThat(tree).extracting(MenuTree::id).containsExactly(9338L, 9339L);
        assertThat(tree.get(0).clientId()).isEqualTo(2L);
        // 按端取树不得再走「全端根」查询（泄漏回归的根因路径）
        verify(menuRepository, never()).findByParentIdIsNullOrderBySortOrder();
    }

    @Test
    void createPersistsClientIdFromRequest() {
        stubSaveWithId(70L);
        // A 组落点校验上线后，非 portal 客户端要先过存在性（无渠道行=桌面形态，本用例不关心形态）
        when(clientRepository.existsById(2L)).thenReturn(true);

        menuService.create(new MenuCreateRequest(
                null, "移动端新目录", DIR, "/m", null, null, null, null, null, 2L));

        assertThat(savedMenu().getClientId()).isEqualTo(2L);
    }

    @Test
    void createWithoutClientIdDefaultsToPortal() {
        stubSaveWithId(71L);

        menuService.create(new MenuCreateRequest(
                null, "门户新目录", DIR, "/p", null, null, null, null, null, null));

        assertThat(savedMenu().getClientId()).isEqualTo(1L);
    }

    private void stubSaveWithId(long id) {
        when(menuRepository.save(any(SysMenu.class))).thenAnswer(inv -> {
            SysMenu m = inv.getArgument(0);
            m.setId(id);
            return m;
        });
        when(menuRepository.findByParentIdOrderBySortOrder(id)).thenReturn(List.of());
    }

    private SysMenu savedMenu() {
        var captor = ArgumentCaptor.forClass(SysMenu.class);
        verify(menuRepository).save(captor.capture());
        return captor.getValue();
    }
}
