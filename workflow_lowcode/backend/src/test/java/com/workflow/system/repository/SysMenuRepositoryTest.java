package com.workflow.system.repository;

import com.workflow.system.domain.entity.SysMenu;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class SysMenuRepositoryTest {

    @Autowired
    private SysMenuRepository repository;

    private SysMenu buildMenu(String name, String path) {
        SysMenu menu = new SysMenu();
        menu.setParentId(null);
        menu.setMenuName(name);
        menu.setMenuType(1);
        menu.setPath(path);
        menu.setComponent("page/PageRenderer");
        menu.setPermission("page:read:leave-query");
        menu.setSortOrder(0);
        menu.setStatus(1);
        menu.setIsDeleted(0);
        return menu;
    }

    @Test
    void findByPathAndIsDeleted_returnsAllMatching() {
        SysMenu a = repository.save(buildMenu("请假查询", "/page/leave-query"));
        SysMenu b = repository.save(buildMenu("假期管理", "/page/leave-query"));

        List<SysMenu> found = repository.findByPathAndIsDeleted("/page/leave-query", 0);
        assertThat(found).hasSize(2);
        assertThat(found).extracting(SysMenu::getId)
                .containsExactlyInAnyOrder(a.getId(), b.getId());

        repository.delete(a);
        repository.delete(b);
    }

    @Test
    void findByPathAndIsDeleted_excludesSoftDeleted() {
        SysMenu a = repository.save(buildMenu("请假查询", "/page/leave-query"));
        SysMenu b = buildMenu("已解除", "/page/leave-query");
        b.setIsDeleted(1);
        repository.save(b);

        List<SysMenu> found = repository.findByPathAndIsDeleted("/page/leave-query", 0);
        assertThat(found).hasSize(1);
        assertThat(found.get(0).getId()).isEqualTo(a.getId());

        repository.delete(a);
        repository.delete(b);
    }
}