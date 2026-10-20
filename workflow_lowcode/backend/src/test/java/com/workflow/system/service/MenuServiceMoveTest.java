package com.workflow.system.service;

import com.workflow.system.domain.dto.MenuCreateRequest;
import com.workflow.system.domain.dto.MenuMoveRequest;
import com.workflow.system.domain.entity.SysMenu;
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
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 菜单层级与排序号契约（拖动调整）。
 *
 * 层级规则：目录可在目录之下或根级；菜单必须在目录之下；按钮必须在菜单之下。
 * 排序号规则：一次移动只重排「原父级的剩余子项」和「新父级的子项」，各自归一化为 0..n-1。
 */
@ExtendWith(MockitoExtension.class)
// stubTree 是公共夹具，单个用例只会用到其中一部分桩，故放宽为 LENIENT
@MockitoSettings(strictness = Strictness.LENIENT)
class MenuServiceMoveTest {

    static final int DIR = 0;
    static final int MENU = 1;
    static final int BUTTON = 2;

    @Mock
    SysMenuRepository menuRepository;

    @InjectMocks
    MenuServiceImpl menuService;

    private SysMenu node(long id, Long parentId, int menuType, int sortOrder) {
        SysMenu menu = new SysMenu();
        menu.setId(id);
        menu.setParentId(parentId);
        menu.setMenuName("menu-" + id);
        menu.setMenuType(menuType);
        menu.setSortOrder(sortOrder);
        menu.setStatus(1);
        return menu;
    }

    /** 根级：系统管理(1) / 开发管理(2)；1 下挂 用户(10,s0) 角色(11,s1)；2 下挂 字典(20,s0) 以及一个菜单型节点 30（用于非法落点用例） */
    private void stubTree() {
        SysMenu root1 = node(1L, null, DIR, 0);
        SysMenu root2 = node(2L, null, DIR, 1);
        SysMenu user = node(10L, 1L, MENU, 0);
        SysMenu role = node(11L, 1L, MENU, 1);
        SysMenu dict = node(20L, 2L, MENU, 0);
        SysMenu menuUnder2 = node(30L, 2L, MENU, 1);
        when(menuRepository.findById(1L)).thenReturn(Optional.of(root1));
        when(menuRepository.findById(2L)).thenReturn(Optional.of(root2));
        when(menuRepository.findById(10L)).thenReturn(Optional.of(user));
        when(menuRepository.findById(11L)).thenReturn(Optional.of(role));
        when(menuRepository.findById(20L)).thenReturn(Optional.of(dict));
        when(menuRepository.findById(30L)).thenReturn(Optional.of(menuUnder2));
        when(menuRepository.findByParentIdIsNullOrderBySortOrder())
                .thenReturn(new ArrayList<>(List.of(root1, root2)));
        when(menuRepository.findByParentIdOrderBySortOrder(1L))
                .thenReturn(new ArrayList<>(List.of(user, role)));
        when(menuRepository.findByParentIdOrderBySortOrder(2L))
                .thenReturn(new ArrayList<>(List.of(dict, menuUnder2)));
    }

    private List<SysMenu> savedAll() {
        var captor = org.mockito.ArgumentCaptor.forClass(List.class);
        verify(menuRepository).saveAll(captor.capture());
        return (List<SysMenu>) captor.getValue();
    }

    private SysMenu savedById(List<SysMenu> saved, long id) {
        return saved.stream().filter(m -> Long.valueOf(id).equals(m.getId())).findFirst().orElse(null);
    }

    @Test
    void moveMenuIntoOtherDirectory_renumbersBothGroups() {
        stubTree();

        menuService.move(10L, new MenuMoveRequest(2L, 0));

        List<SysMenu> saved = savedAll();
        // 新父级：用户(10) 插到 字典(20) 之前 -> 0,1
        assertThat(savedById(saved, 10L).getParentId()).isEqualTo(2L);
        assertThat(savedById(saved, 10L).getSortOrder()).isZero();
        assertThat(savedById(saved, 20L).getSortOrder()).isEqualTo(1);
        // 原父级剩余：角色(11) 归零
        assertThat(savedById(saved, 11L).getSortOrder()).isZero();
    }

    @Test
    void moveDirectoryToRoot_setsParentNull() {
        stubTree();
        when(menuRepository.findByParentIdOrderBySortOrder(100L)).thenReturn(new ArrayList<>());

        menuService.move(1L, new MenuMoveRequest(null, 1));

        List<SysMenu> saved = savedAll();
        assertThat(savedById(saved, 1L).getParentId()).isNull();
        assertThat(savedById(saved, 1L).getSortOrder()).isEqualTo(1);
        assertThat(savedById(saved, 2L).getSortOrder()).isZero();
    }

    @Test
    void reorderWithinSameParent_renumbersThatGroupOnly() {
        stubTree();
        when(menuRepository.findByParentIdOrderBySortOrder(10L)).thenReturn(new ArrayList<>());

        menuService.move(10L, new MenuMoveRequest(1L, 1));

        List<SysMenu> saved = savedAll();
        assertThat(savedById(saved, 10L).getSortOrder()).isEqualTo(1);
        assertThat(savedById(saved, 11L).getSortOrder()).isZero();
    }

    @Test
    void moveMenuUnderMenu_rejected() {
        stubTree();

        assertThatThrownBy(() -> menuService.move(10L, new MenuMoveRequest(30L, 0)))
                .hasMessageContaining("菜单必须放在目录下");
        verify(menuRepository, never()).saveAll(any());
    }

    @Test
    void moveButtonUnderDirectory_rejected() {
        stubTree();
        SysMenu button = node(40L, 10L, BUTTON, 0);
        when(menuRepository.findById(40L)).thenReturn(Optional.of(button));

        assertThatThrownBy(() -> menuService.move(40L, new MenuMoveRequest(2L, 0)))
                .hasMessageContaining("按钮必须放在菜单下");
    }

    @Test
    void moveDirectoryUnderMenu_rejected() {
        stubTree();
        SysMenu dir = node(50L, null, DIR, 2);
        when(menuRepository.findById(50L)).thenReturn(Optional.of(dir));

        assertThatThrownBy(() -> menuService.move(50L, new MenuMoveRequest(30L, 0)))
                .hasMessageContaining("目录只能放在根级或其他目录下");
    }

    @Test
    void moveNodeUnderItsOwnDescendant_rejected() {
        stubTree();
        // 目录(1) 的子菜单 用户(10) 之下又挂了子目录(60)：把 1 拖进 60 会成环
        SysMenu nestedDir = node(60L, 10L, DIR, 0);
        when(menuRepository.findById(60L)).thenReturn(Optional.of(nestedDir));

        assertThatThrownBy(() -> menuService.move(1L, new MenuMoveRequest(60L, 0)))
                .hasMessageContaining("自己的子菜单之下");
    }

    @Test
    void moveNodeUnderItself_rejected() {
        stubTree();

        assertThatThrownBy(() -> menuService.move(1L, new MenuMoveRequest(1L, 0)))
                .hasMessageContaining("自己的子菜单之下");
    }

    @Test
    void createUnderTypeMismatchedParent_rejected() {
        stubTree();

        assertThatThrownBy(() -> menuService.create(new MenuCreateRequest(
                10L, "错挂的菜单", MENU, "/x", null, null, null, null, null)))
                .hasMessageContaining("菜单必须放在目录下");
        verify(menuRepository, never()).save(any());
    }

    @Test
    void updateTypeIntoIllegalCombinationWithExistingParent_rejected() {
        stubTree();

        assertThatThrownBy(() -> menuService.update(10L,
                new com.workflow.system.domain.dto.MenuUpdateRequest(
                        null, BUTTON, null, null, null, null, null, null)))
                .hasMessageContaining("按钮必须放在菜单下");
        verify(menuRepository, never()).save(any());
    }

    @Test
    void createWithoutSortOrder_appendsAfterLastSibling() {
        stubTree();
        when(menuRepository.findByParentIdOrderBySortOrder(2L))
                .thenReturn(new ArrayList<>(List.of(node(20L, 2L, MENU, 3))));
        when(menuRepository.save(any(SysMenu.class))).thenAnswer(inv -> {
            SysMenu m = inv.getArgument(0);
            m.setId(70L);
            return m;
        });
        when(menuRepository.findByParentIdOrderBySortOrder(70L)).thenReturn(new ArrayList<>());

        menuService.create(new MenuCreateRequest(
                2L, "新菜单", MENU, "/new", null, null, null, null, null));

        var captor = org.mockito.ArgumentCaptor.forClass(SysMenu.class);
        verify(menuRepository).save(captor.capture());
        assertThat(captor.getValue().getSortOrder()).isEqualTo(4);
    }

    @Test
    void moveUnknownNode_rejected() {
        when(menuRepository.findById(anyLong())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> menuService.move(999L, new MenuMoveRequest(2L, 0)))
                .hasMessageContaining("菜单不存在");
    }
}
