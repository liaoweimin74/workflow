package com.workflow.system.service;

import com.workflow.system.domain.dto.MenuCreateRequest;
import com.workflow.system.domain.dto.MenuMoveRequest;
import com.workflow.system.domain.dto.MenuUpdateRequest;
import com.workflow.system.domain.entity.SysClientChannel;
import com.workflow.system.domain.entity.SysMenu;
import com.workflow.system.repository.SysClientChannelRepository;
import com.workflow.system.repository.SysClientRepository;
import com.workflow.system.repository.SysMenuRepository;
import com.workflow.system.service.impl.MenuServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * A 组：Java 菜单服务端落点校验器（移植 backend-node menu-shape.ts +
 * system.service.ts assertPlacement 组装口径，2026-10-26 用户裁定 A+B 补漏）。
 *
 * <p>钉住四条防线：
 * <ol>
 *   <li>移动形态区——TAB 区只放一级菜单且总数 ≤5（下限 2 是终态完整性，不在插入时拦截）；
 *       GRID 区深度 ≤2、不放按钮；BUTTON 跟随菜单、不要求形态区祖先；</li>
 *   <li>mzone 分区根 locked——删除/移动/改名拒绝，非改名补丁不受影响；</li>
 *   <li>跨端拒绝——create 父级、move 目标父、zone 上溯链上任一节点 client 不符即拒；</li>
 *   <li>移动形态判定——客户端 H5/APP/MP 任一 enabled 才算移动端；不存在的客户端拒绝。</li>
 * </ol>
 *
 * <p>WEB 三层规则文案已由 MenuServiceMoveTest 逐条钉住，此处不重复；
 * 移动端菜单落形态区之外的拒绝文案（"必须挂在…之下"）与 WEB 文案（"菜单必须放在目录下"）
 * 分别钉住两种形态不串线。
 */
@ExtendWith(MockitoExtension.class)
// 各用例只触公共夹具的一部分桩，放宽为 LENIENT（对齐 MenuServiceMoveTest）
@MockitoSettings(strictness = Strictness.LENIENT)
class MenuServicePlacementTest {

    static final int DIR = 0;
    static final int MENU = 1;
    static final int BUTTON = 2;

    static final long MOBILE = 2L;    // H5 enabled=true → 移动形态
    static final long DESKTOP = 3L;   // 存在但无移动渠道 → 桌面形态
    static final long DISABLED = 4L;  // H5 行存在但 enabled=0 → 仍是桌面形态
    static final long UNKNOWN = 99L;  // 不存在的客户端

    static final long TABS = 9338L;   // mzone:tabs 分区根（live 库真实 id）
    static final long GRID = 9339L;   // mzone:grid 分区根
    static final long TAB_1 = 9400L;  // TAB 区一级菜单
    static final long G_L1 = 9500L;   // GRID 区一级（目录）
    static final long G_L2 = 9501L;   // GRID 区二级（目录）
    static final long OUT_DIR = 9600L; // 客户端 2 但挂不到形态区的目录

    @Mock
    SysMenuRepository menuRepository;
    @Mock
    SysClientRepository clientRepository;
    @Mock
    SysClientChannelRepository channelRepository;

    @InjectMocks
    MenuServiceImpl menuService;

    // ------------------------------------------------------------ 夹具

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

    private SysMenu zoneRoot(long id, String component) {
        SysMenu menu = node(id, null, DIR, MOBILE);
        menu.setComponent(component);
        return menu;
    }

    private SysClientChannel channel(long clientId, String type, int enabled) {
        SysClientChannel ch = new SysClientChannel();
        ch.setClientId(clientId);
        ch.setChannelType(type);
        ch.setEnabled(enabled);
        return ch;
    }

    /** 客户端存在性 + 渠道矩阵一次性布好（portal 短路，无需桩） */
    private void clients(long... idsWithMobileH5) {
        for (long id : idsWithMobileH5) {
            when(clientRepository.existsById(id)).thenReturn(true);
            when(channelRepository.findByClientIdIn(List.of(id)))
                    .thenReturn(List.of(channel(id, "H5", 1)));
        }
    }

    private void stubNodes(SysMenu... nodes) {
        for (SysMenu n : nodes) {
            when(menuRepository.findById(n.getId())).thenReturn(Optional.of(n));
        }
    }

    private void childrenOf(long parentId, SysMenu... children) {
        when(menuRepository.findByParentIdOrderBySortOrder(parentId))
                .thenReturn(new ArrayList<>(List.of(children)));
    }

    private SysMenu savedMenu() {
        var captor = org.mockito.ArgumentCaptor.forClass(SysMenu.class);
        verify(menuRepository).save(captor.capture());
        return captor.getValue();
    }

    private MenuCreateRequest createReq(Long parentId, int menuType, long clientId) {
        return new MenuCreateRequest(parentId, "新节点", menuType, "/x", null, null, null, null, null, clientId);
    }

    // ------------------------------------------------------------ 1. TAB 区形态

    @Test
    void tabZone_allowsFirstLevelMenuWithinLimit() {
        clients(MOBILE);
        SysMenu tabs = zoneRoot(TABS, "mzone:tabs");
        stubNodes(tabs, node(TAB_1, TABS, MENU, MOBILE));
        childrenOf(TABS, node(TAB_1, TABS, MENU, MOBILE));
        when(menuRepository.save(any(SysMenu.class))).thenAnswer(inv -> {
            SysMenu m = inv.getArgument(0);
            m.setId(9401L);
            return m;
        });

        menuService.create(createReq(TABS, MENU, MOBILE));

        assertThat(savedMenu().getParentId()).isEqualTo(TABS);
    }

    @Test
    void tabZone_rejectsSixthMenu() {
        clients(MOBILE);
        SysMenu tabs = zoneRoot(TABS, "mzone:tabs");
        stubNodes(tabs);
        childrenOf(TABS,
                node(9400L, TABS, MENU, MOBILE), node(9401L, TABS, MENU, MOBILE),
                node(9402L, TABS, MENU, MOBILE), node(9403L, TABS, MENU, MOBILE),
                node(9404L, TABS, MENU, MOBILE));

        assertThatThrownBy(() -> menuService.create(createReq(TABS, MENU, MOBILE)))
                .hasMessageContaining("最多 5 个");
        verify(menuRepository, never()).save(any());
    }

    @Test
    void tabZone_rejectsDirectory() {
        clients(MOBILE);
        stubNodes(zoneRoot(TABS, "mzone:tabs"));
        childrenOf(TABS);

        assertThatThrownBy(() -> menuService.create(createReq(TABS, DIR, MOBILE)))
                .hasMessageContaining("底部 Tab 区只能放菜单");
        verify(menuRepository, never()).save(any());
    }

    @Test
    void tabZone_rejectsSecondLevelViaMove() {
        clients(MOBILE);
        SysMenu tabs = zoneRoot(TABS, "mzone:tabs");
        SysMenu tab1 = node(TAB_1, TABS, MENU, MOBILE);
        SysMenu tab2 = node(9405L, TABS, MENU, MOBILE);
        stubNodes(tabs, tab1, tab2);
        childrenOf(TABS, tab1, tab2);

        // 现状 WEB 文案是「菜单必须放在目录下」；移动口径必须换成 TAB 区专属文案
        assertThatThrownBy(() -> menuService.move(9405L, new MenuMoveRequest(TAB_1, 0)))
                .hasMessageContaining("底部 Tab 区只认一级节点");
        verify(menuRepository, never()).saveAll(any());
    }

    @Test
    void updateMenuTypeIntoDirectoryInsideTabZone_rejected() {
        clients(MOBILE);
        SysMenu tabs = zoneRoot(TABS, "mzone:tabs");
        stubNodes(tabs, node(TAB_1, TABS, MENU, MOBILE));

        // 现状：目录挂目录下合法；新口径：改类型重过 TAB 区形态 → 拒
        assertThatThrownBy(() -> menuService.update(TAB_1,
                new MenuUpdateRequest(null, DIR, null, null, null, null, null, null)))
                .hasMessageContaining("底部 Tab 区只能放菜单");
        verify(menuRepository, never()).save(any());
    }

    // ------------------------------------------------------------ 2. GRID 区形态

    @Test
    void gridZone_secondLevelAllowed() {
        clients(MOBILE);
        stubNodes(zoneRoot(GRID, "mzone:grid"), node(G_L1, GRID, DIR, MOBILE));
        childrenOf(G_L1);
        when(menuRepository.save(any(SysMenu.class))).thenAnswer(inv -> {
            SysMenu m = inv.getArgument(0);
            m.setId(9502L);
            return m;
        });

        menuService.create(createReq(G_L1, MENU, MOBILE));

        assertThat(savedMenu().getParentId()).isEqualTo(G_L1);
    }

    @Test
    void gridZone_rejectsThirdLevel() {
        clients(MOBILE);
        stubNodes(zoneRoot(GRID, "mzone:grid"),
                node(G_L1, GRID, DIR, MOBILE), node(G_L2, G_L1, DIR, MOBILE));
        childrenOf(G_L2);

        // 现状：目录挂目录下合法 → 新口径深度 ≤2 拒第三层
        assertThatThrownBy(() -> menuService.create(createReq(G_L2, DIR, MOBILE)))
                .hasMessageContaining("层级最多 2 层");
        verify(menuRepository, never()).save(any());
    }

    // ------------------------------------------------------------ 3. BUTTON 跟随菜单

    @Test
    void button_followsMenu_withoutZoneRootAncestor() {
        clients(MOBILE);
        // 按钮的父级必须是「菜单」形态区外的 MENU 节点（非目录）
        SysMenu outMenu = node(OUT_DIR, null, MENU, MOBILE);
        stubNodes(outMenu);
        childrenOf(OUT_DIR);
        when(menuRepository.save(any(SysMenu.class))).thenAnswer(inv -> {
            SysMenu m = inv.getArgument(0);
            m.setId(9601L);
            return m;
        });

        // 按钮不占屏不占形态层级（design D5）：形态区外的菜单下挂按钮必须放行
        menuService.create(createReq(OUT_DIR, BUTTON, MOBILE));

        assertThat(savedMenu().getMenuType()).isEqualTo(BUTTON);
    }

    // ------------------------------------------------------------ 4. 移动端必须挂形态区

    @Test
    void mobileMenuOutsideZoneRoot_rejected() {
        clients(MOBILE);
        stubNodes(node(OUT_DIR, null, DIR, MOBILE));
        childrenOf(OUT_DIR);

        assertThatThrownBy(() -> menuService.create(createReq(OUT_DIR, MENU, MOBILE)))
                .hasMessageContaining("移动端菜单必须挂在底部 Tab 区或工作台宫格区之下");
        verify(menuRepository, never()).save(any());
    }

    // ------------------------------------------------------------ 5. 跨端拒绝

    @Test
    void createUnderForeignClientParent_rejected() {
        stubNodes(zoneRoot(TABS, "mzone:tabs"));

        // portal(1) 请求挂到客户端 2 的分区根下：现状目录/菜单组合合法 → 必须拒
        assertThatThrownBy(() -> menuService.create(createReq(TABS, MENU, 1L)))
                .hasMessageContaining("不能跨客户端移动菜单");
        verify(menuRepository, never()).save(any());
    }

    @Test
    void moveToForeignClientParent_rejected() {
        clients(MOBILE);
        stubNodes(node(10L, 1L, MENU, 1L), node(G_L1, GRID, DIR, MOBILE));
        childrenOf(G_L1);

        // portal 菜单移进客户端 2 的 GRID 一级：现状「菜单挂目录」合法 → 必须拒
        assertThatThrownBy(() -> menuService.move(10L, new MenuMoveRequest(G_L1, 0)))
                .hasMessageContaining("不能跨客户端移动菜单");
        verify(menuRepository, never()).saveAll(any());
    }

    @Test
    void zoneTraversal_hitsForeignChainNode_rejected() {
        clients(MOBILE);
        // 脏数据链：G_L1(端2) → G_L2(端1)——上溯途中撞到别端节点
        stubNodes(zoneRoot(GRID, "mzone:grid"),
                node(G_L1, GRID, DIR, MOBILE), node(G_L2, G_L1, DIR, 1L));

        assertThatThrownBy(() -> menuService.create(createReq(G_L2, MENU, MOBILE)))
                .hasMessageContaining("不能跨客户端移动菜单");
        verify(menuRepository, never()).save(any());
    }

    // ------------------------------------------------------------ 6. 分区根 locked

    @Test
    void deleteZoneRoot_rejected() {
        SysMenu tabs = zoneRoot(TABS, "mzone:tabs");
        when(menuRepository.existsById(TABS)).thenReturn(true);
        stubNodes(tabs);
        when(menuRepository.countByParentId(TABS)).thenReturn(1L);

        assertThatThrownBy(() -> menuService.delete(TABS))
                .hasMessageContaining("锁定根目录")
                .hasMessageContaining("不允许删除");
        verify(menuRepository, never()).save(any());
    }

    @Test
    void moveZoneRoot_rejected() {
        SysMenu tabs = zoneRoot(TABS, "mzone:tabs");
        SysMenu grid = zoneRoot(GRID, "mzone:grid");
        stubNodes(tabs, grid);
        childrenOf(GRID);

        assertThatThrownBy(() -> menuService.move(TABS, new MenuMoveRequest(GRID, 0)))
                .hasMessageContaining("底部 Tab 区为锁定根目录")
                .hasMessageContaining("不允许移动");
        verify(menuRepository, never()).saveAll(any());
    }

    @Test
    void renameZoneRoot_rejected() {
        stubNodes(zoneRoot(TABS, "mzone:tabs"));

        assertThatThrownBy(() -> menuService.update(TABS,
                new MenuUpdateRequest("改名", null, null, null, null, null, null, null)))
                .hasMessageContaining("不允许改名");
        verify(menuRepository, never()).save(any());
    }

    @Test
    void zoneRoot_nonRenamePatchAllowed() {
        stubNodes(zoneRoot(TABS, "mzone:tabs"));
        when(menuRepository.save(any(SysMenu.class))).thenAnswer(inv -> inv.getArgument(0));
        childrenOf(TABS);

        // locked 只拦改名；状态/排序补丁照常（对齐 node updateMenu 的 hasText 门槛）
        menuService.update(TABS, new MenuUpdateRequest(null, null, null, null, null, null, null, 0));

        assertThat(savedMenu().getStatus()).isZero();
    }

    // ------------------------------------------------------------ 7. 移动形态判定

    @Test
    void unknownClient_rejected() {
        // existsById(99) 默认 false
        assertThatThrownBy(() -> menuService.create(createReq(null, DIR, UNKNOWN)))
                .hasMessageContaining("客户端不存在");
        verify(menuRepository, never()).save(any());
    }

    @Test
    void mobileChannelDisabled_keepsWebRules() {
        when(clientRepository.existsById(DISABLED)).thenReturn(true);
        when(channelRepository.findByClientIdIn(List.of(DISABLED)))
                .thenReturn(List.of(channel(DISABLED, "H5", 0)));
        stubNodes(node(9700L, null, DIR, DISABLED));
        childrenOf(9700L);
        when(menuRepository.save(any(SysMenu.class))).thenAnswer(inv -> {
            SysMenu m = inv.getArgument(0);
            m.setId(9701L);
            return m;
        });

        // H5 行存在但未 enabled → 桌面形态：走 WEB 文案（目录挂根合法、菜单必须挂目录）
        menuService.create(createReq(null, DIR, DISABLED));
        assertThat(savedMenu().getParentId()).isNull();
    }

    @Test
    void desktopClientKeepsWebPlacementVocabulary() {
        when(clientRepository.existsById(DESKTOP)).thenReturn(true);
        when(channelRepository.findByClientIdIn(List.of(DESKTOP)))
                .thenReturn(List.of(channel(DESKTOP, "WEB", 1)));

        // 桌面端根级放菜单：拒因是 WEB 三层规则，不得冒出「形态区之下」的移动文案
        assertThatThrownBy(() -> menuService.create(createReq(null, MENU, DESKTOP)))
                .hasMessageContaining("菜单必须放在目录下");
        verify(menuRepository, never()).save(any());
    }
}
