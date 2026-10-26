package com.workflow.system.service;

import com.workflow.system.domain.dto.MenuCreateRequest;
import com.workflow.system.domain.dto.MenuUpdateRequest;
import com.workflow.system.domain.entity.SysMenu;
import com.workflow.system.domain.vo.MenuTree;
import com.workflow.system.repository.SysMenuRepository;
import com.workflow.system.service.impl.MenuServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 菜单 status 开关契约。
 *
 * sys_menu 只有 status 列（1 启用 / 0 停用），侧边栏菜单树按 status==1 过滤，
 * 因此 status 就是菜单可见性的唯一开关；管理页要能停用/启用菜单，
 * 必须能从 tree 接口读到当前 status（回填弹窗）、提交时后端真正落库。
 */
@ExtendWith(MockitoExtension.class)
class MenuServiceStatusTest {

    @Mock
    SysMenuRepository menuRepository;

    @InjectMocks
    MenuServiceImpl menuService;

    private SysMenu menu(Long id, String name, Integer status) {
        SysMenu menu = new SysMenu();
        menu.setId(id);
        menu.setMenuName(name);
        menu.setMenuType(1);
        menu.setStatus(status);
        return menu;
    }

    @Test
    void tree_exposesStatusIncludingDisabledMenus() {
        when(menuRepository.findByParentIdIsNullOrderBySortOrder())
                .thenReturn(List.of(menu(1L, "停用菜单", 0), menu(2L, "启用菜单", 1)));

        List<MenuTree> tree = menuService.tree();

        assertThat(tree).hasSize(2);
        assertThat(tree.get(0).status()).isZero();
        assertThat(tree.get(1).status()).isOne();
    }

    @Test
    void create_withoutStatus_defaultsToEnabled() {
        when(menuRepository.save(any(SysMenu.class))).thenAnswer(invocation -> {
            SysMenu saved = invocation.getArgument(0);
            saved.setId(100L);
            return saved;
        });

        menuService.create(new MenuCreateRequest(
                null, "新菜单", 0, "/new", null, null, null, null, null, null));

        assertThat(captureSaved().getStatus()).isOne();
    }

    @Test
    void create_withDisabledStatus_keepsIt() {
        when(menuRepository.save(any(SysMenu.class))).thenAnswer(invocation -> {
            SysMenu saved = invocation.getArgument(0);
            saved.setId(101L);
            return saved;
        });

        // 根级只允许挂目录（菜单必须在目录之下），这里用类型 0 保持用例合法
        menuService.create(new MenuCreateRequest(
                null, "停用新菜单", 0, "/disabled", null, null, null, null, 0, null));

        assertThat(captureSaved().getStatus()).isZero();
    }

    @Test
    void update_withDisabledStatus_persistsDisable() {
        when(menuRepository.findById(1L)).thenReturn(Optional.of(menu(1L, "已启用", 1)));
        when(menuRepository.save(any(SysMenu.class))).thenAnswer(invocation -> invocation.getArgument(0));

        menuService.update(1L, new MenuUpdateRequest(
                null, null, null, null, null, null, null, 0));

        assertThat(captureSaved().getStatus()).isZero();
    }

    private SysMenu captureSaved() {
        ArgumentCaptor<SysMenu> captor = ArgumentCaptor.forClass(SysMenu.class);
        verify(menuRepository).save(captor.capture());
        return captor.getValue();
    }
}
