# 页面挂接到系统菜单（多挂接）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让已发布视图/页面通过设计器一键挂接到系统菜单（支持一个页面挂多个菜单），并补齐页面渲染与数据接口的后端权限校验（无任何菜单 404 / 全部菜单无权限 403 / OR 语义放行），形成"设计→发布→挂接→访问"闭环。

**Architecture:** 复用现有 `sys_menu` 权限体系（角色→菜单→permission→`hasPermission`）。后端新增挂接接口（每次创建新菜单，支持多挂接）+ 列表查询 + 解除挂接（软删）；在 `PageDefinitionController.getByKey`（非 preview）与 `PageQueryController.query` 注入基于菜单 permission 的访问校验（OR 语义）。共享校验逻辑封装为独立 `PageAccessGuard`，两 Controller 复用。前端设计器新增"挂接菜单"按钮、弹窗（防误操作提示）与已挂列表管理。

**Tech Stack:** Spring Boot + Spring Data JPA + Spring Security（`SecurityContextHolder`/`LoginUser`/`@Component("pe")` PermissionEvaluator）、Vue 3 + Element Plus + vue-router。

## Global Constraints

- 权限码格式固定为 `page:read:{pageKey}`（每页唯一，action 位可扩展），不允许其他命名
- 菜单 path 固定为 `/page/{pageKey}`，component 固定为 `page/PageRenderer`
- **多挂接**：同页面可挂多个菜单，每次挂接创建一条新菜单；`sys_menu.path` 无唯一约束，多菜单同 path 合法
- 仅 PUBLISHED 页面可挂接（DRAFT/ARCHIVED → 400）
- preview=true（definition 接口）跳过权限校验；data 接口始终校验
- 访问校验 OR 语义：拥有**任一**关联菜单权限即放行；无任何关联菜单 → 404；全部无权限 → 403；禁用菜单（status!=1）不参与授权
- 后端校验复用 `@Component("pe")` `PermissionEvaluator.hasPermission(...)`（含 admin 绕过），不重复造轮子
- 解除挂接 = 软删（is_deleted=1），不影响页面及其它关联菜单
- 测试遵循项目既有 JUnit + MockMvc 集成测试风格（参考 `PageQueryControllerTest`、`PageDefinitionPublishIntegrationTest`）
- 后端修改后仅编译（热部署），不重启

---

### Task 1: SysMenuRepository 新增 findByPathAndIsDeleted（返回 List）

**Files:**
- Modify: `backend/src/main/java/com/workflow/system/repository/SysMenuRepository.java`
- Test: `backend/src/test/java/com/workflow/system/repository/SysMenuRepositoryTest.java`（新建）

**Interfaces:**
- Produces: `List<SysMenu> findByPathAndIsDeleted(String path, int isDeleted)` — 后续所有按 path 反查菜单的调用点统一使用（列表查询与 OR 校验共用）

- [ ] **Step 1: Write the failing test**

```java
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `mvn test -pl backend -Dtest=SysMenuRepositoryTest`
Expected: FAIL — 编译错误（方法 `findByPathAndIsDeleted` 不存在）

- [ ] **Step 3: Add the repository method**

```java
public interface SysMenuRepository extends JpaRepository<SysMenu, Long>,
        JpaSpecificationExecutor<SysMenu> {
    List<SysMenu> findByParentIdOrderBySortOrder(Long parentId);

    List<SysMenu> findByParentIdIsNullOrderBySortOrder();

    long countByParentId(Long parentId);

    List<SysMenu> findByPathAndIsDeleted(String path, int isDeleted);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `mvn test -pl backend -Dtest=SysMenuRepositoryTest`
Expected: PASS（2 个用例）

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/workflow/system/repository/SysMenuRepository.java backend/src/test/java/com/workflow/system/repository/SysMenuRepositoryTest.java
git commit -m "feat: SysMenuRepository 新增 findByPathAndIsDeleted（List）"
```

---

### Task 2: 挂接接口（mount-menu 多挂接 + 列表 + 解除）

**Files:**
- Create: `backend/src/main/java/com/workflow/api/controller/PageMenuController.java`
- Create: `backend/src/main/java/com/workflow/api/dto/MountMenuRequest.java`
- Create: `backend/src/main/java/com/workflow/api/dto/PageMenuResponse.java`
- Test: `backend/src/test/java/com/workflow/api/controller/PageMenuControllerTest.java`

**Interfaces:**
- Consumes: `SysMenuRepository.findByPathAndIsDeleted(String, int)`（Task 1）；`PageDefinitionService.getById(String)`、`getPublishedByKey(String)`（已有）
- Produces:
  - `POST /api/v1/pages/{id}/mount-menu` body `{name?, parentId?}` → `R<MenuItem>`（每次创建新菜单）
  - `GET /api/v1/pages/{key}/menus` → `R<List<MenuItem>>`（该页面全部关联菜单）
  - `DELETE /api/v1/pages/menus/{menuId}` → `R<Void>`（软删；不存在/已软删 → 404）
  - `MenuItem`（record）：`Long menuId; String menuName; String path; Long parentId; String permission; Integer status`

- [ ] **Step 1: Write DTOs**

`MountMenuRequest.java`（record，字段 name、parentId 均可空）：
```java
package com.workflow.api.dto;

public record MountMenuRequest(String name, Long parentId) {}
```

`PageMenuResponse.java`（含菜单项 record）：
```java
package com.workflow.api.dto;

public record PageMenuResponse(
        java.util.List<MenuItem> items) {

    public record MenuItem(
            Long menuId,
            String menuName,
            String path,
            Long parentId,
            String permission,
            Integer status) {}
}
```

- [ ] **Step 2: Write the failing controller test**

```java
package com.workflow.api.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.page.PageDefinitionService;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.system.domain.entity.SysMenu;
import com.workflow.system.repository.SysMenuRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class PageMenuControllerTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private PageDefinitionService pageDefService;
    @MockBean
    private SysMenuRepository menuRepository;

    private PageDefinition publishedPage;

    @BeforeEach
    void setUp() {
        publishedPage = new PageDefinition();
        publishedPage.setId("p1");
        publishedPage.setKey("leave-query");
        publishedPage.setName("请假查询");
        publishedPage.setType("VIEW");
        publishedPage.setStatus("PUBLISHED");
    }

    private SysMenu buildMenu(Long id, String name, Long parentId) {
        SysMenu m = new SysMenu();
        m.setId(id);
        m.setMenuName(name);
        m.setPath("/page/leave-query");
        m.setPermission("page:read:leave-query");
        m.setParentId(parentId);
        m.setStatus(1);
        m.setIsDeleted(0);
        return m;
    }

    @Test
    void mountMenu_createsNewMenu() throws Exception {
        when(pageDefService.getById("p1")).thenReturn(publishedPage);
        when(menuRepository.save(any(SysMenu.class))).thenAnswer(inv -> {
            SysMenu m = inv.getArgument(0);
            m.setId(101L);
            return m;
        });

        mockMvc.perform(post("/api/v1/pages/p1/mount-menu")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new com.workflow.api.dto.MountMenuRequest("考勤请假", 2L))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.menuId").value(101))
                .andExpect(jsonPath("$.data.menuName").value("考勤请假"))
                .andExpect(jsonPath("$.data.path").value("/page/leave-query"))
                .andExpect(jsonPath("$.data.parentId").value(2))
                .andExpect(jsonPath("$.data.permission").value("page:read:leave-query"));

        verify(menuRepository).save(any(SysMenu.class));
    }

    @Test
    void mountMenu_multipleMountsCreateMultipleMenus() throws Exception {
        when(pageDefService.getById("p1")).thenReturn(publishedPage);
        when(menuRepository.save(any(SysMenu.class))).thenAnswer(inv -> {
            SysMenu m = inv.getArgument(0);
            m.setId(101L);
            return m;
        });

        mockMvc.perform(post("/api/v1/pages/p1/mount-menu")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new com.workflow.api.dto.MountMenuRequest("考勤请假", 2L))))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/pages/p1/mount-menu")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new com.workflow.api.dto.MountMenuRequest("人事请假", 1L))))
                .andExpect(status().isOk());

        verify(menuRepository, times(2)).save(any(SysMenu.class));
    }

    @Test
    void mountMenu_rejectsDraft() throws Exception {
        publishedPage.setStatus("DRAFT");
        when(pageDefService.getById("p1")).thenReturn(publishedPage);

        mockMvc.perform(post("/api/v1/pages/p1/mount-menu")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new com.workflow.api.dto.MountMenuRequest(null, null))))
                .andExpect(status().isBadRequest());

        verify(menuRepository, never()).save(any(SysMenu.class));
    }

    @Test
    void getMenus_returnsAllAssociated() throws Exception {
        when(pageDefService.getPublishedByKey("leave-query")).thenReturn(publishedPage);
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0))
                .thenReturn(List.of(buildMenu(100L, "人事请假", 1L), buildMenu(101L, "考勤请假", 2L)));

        mockMvc.perform(get("/api/v1/pages/leave-query/menus"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(2));
    }

    @Test
    void getMenus_emptyWhenNotMounted() throws Exception {
        when(pageDefService.getPublishedByKey("leave-query")).thenReturn(publishedPage);
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0)).thenReturn(List.of());

        mockMvc.perform(get("/api/v1/pages/leave-query/menus"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(0));
    }

    @Test
    void unmountMenu_softDeletes() throws Exception {
        SysMenu menu = buildMenu(100L, "人事请假", 1L);
        when(menuRepository.findById(100L)).thenReturn(java.util.Optional.of(menu));

        mockMvc.perform(delete("/api/v1/pages/menus/100"))
                .andExpect(status().isOk());

        verify(menuRepository).save(menu);
    }

    @Test
    void unmountMenu_notFound() throws Exception {
        when(menuRepository.findById(999L)).thenReturn(java.util.Optional.empty());

        mockMvc.perform(delete("/api/v1/pages/menus/999"))
                .andExpect(status().isNotFound());
    }
}
```

注意：若项目用 `@MockBean` 有版本告警可改 `@MockitoBean`（Spring Boot 3.4+）；以项目现有测试风格为准（参考 PageQueryControllerTest 的写法）。

- [ ] **Step 3: Run test to verify it fails**

Run: `mvn test -pl backend -Dtest=PageMenuControllerTest`
Expected: FAIL — `PageMenuController` 不存在（404 或编译错误）

- [ ] **Step 4: Implement PageMenuController**

```java
package com.workflow.api.controller;

import com.workflow.api.dto.MountMenuRequest;
import com.workflow.api.dto.PageMenuResponse;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.page.PageDefinitionService;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.system.domain.entity.SysMenu;
import com.workflow.system.repository.SysMenuRepository;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/pages")
public class PageMenuController {

    private final PageDefinitionService pageDefService;
    private final SysMenuRepository menuRepository;

    public PageMenuController(PageDefinitionService pageDefService,
                              SysMenuRepository menuRepository) {
        this.pageDefService = pageDefService;
        this.menuRepository = menuRepository;
    }

    /** 挂接菜单：每次调用创建一条新菜单（支持多挂接） */
    @PostMapping("/{id}/mount-menu")
    public R<PageMenuResponse.MenuItem> mountMenu(@PathVariable String id,
                                                  @RequestBody(required = false) MountMenuRequest request) {
        PageDefinition page = pageDefService.getById(id);
        if (!"PUBLISHED".equals(page.getStatus())) {
            throw new BusinessException(400, "仅可挂接已发布的页面");
        }
        SysMenu menu = new SysMenu();
        menu.setMenuName(request != null && request.name() != null ? request.name() : page.getName());
        menu.setPath("/page/" + page.getKey());
        menu.setComponent("page/PageRenderer");
        menu.setPermission("page:read:" + page.getKey());
        menu.setMenuType(1);
        menu.setParentId(request != null ? request.parentId() : null);
        menu.setSortOrder(0);
        menu.setStatus(1);
        menu.setIsDeleted(0);
        SysMenu saved = menuRepository.save(menu);
        return R.ok(toItem(saved));
    }

    /** 挂接菜单列表查询 */
    @GetMapping("/{key}/menus")
    public R<PageMenuResponse> getMenus(@PathVariable String key) {
        PageDefinition page = pageDefService.getPublishedByKey(key);
        List<SysMenu> menus = menuRepository.findByPathAndIsDeleted("/page/" + page.getKey(), 0);
        List<PageMenuResponse.MenuItem> items = menus.stream().map(this::toItem).toList();
        return R.ok(new PageMenuResponse(items));
    }

    /** 解除挂接：软删菜单 */
    @DeleteMapping("/menus/{menuId}")
    public R<Void> unmountMenu(@PathVariable Long menuId) {
        SysMenu menu = menuRepository.findById(menuId)
                .orElseThrow(() -> new BusinessException(404, "菜单不存在或已解除"));
        menu.setIsDeleted(1);
        menuRepository.save(menu);
        return R.ok();
    }

    private PageMenuResponse.MenuItem toItem(SysMenu menu) {
        return new PageMenuResponse.MenuItem(menu.getId(), menu.getMenuName(),
                menu.getPath(), menu.getParentId(), menu.getPermission(), menu.getStatus());
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `mvn test -pl backend -Dtest=PageMenuControllerTest`
Expected: PASS（7 个用例）

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/workflow/api/controller/PageMenuController.java backend/src/main/java/com/workflow/api/dto/MountMenuRequest.java backend/src/main/java/com/workflow/api/dto/PageMenuResponse.java backend/src/test/java/com/workflow/api/controller/PageMenuControllerTest.java
git commit -m "feat: 页面挂接菜单接口（多挂接 + 列表 + 解除）"
```

---

### Task 3: 页面访问权限校验（共享 Guard，OR 语义）

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/page/PageAccessGuard.java`
- Modify: `backend/src/main/java/com/workflow/api/controller/PageDefinitionController.java`（getByKey 非 preview 分支）
- Modify: `backend/src/main/java/com/workflow/api/controller/PageQueryController.java`（query 入口）
- Test: `backend/src/test/java/com/workflow/engine/page/PageAccessGuardTest.java`（新建）+ 扩展现有 Controller 测试

**Interfaces:**
- Consumes: `SysMenuRepository.findByPathAndIsDeleted`（Task 1）、`@Component("pe")` `PermissionEvaluator.hasPermission(String...)`
- Produces: `PageAccessGuard.assertPageAccess(String pageKey)`（无返回；无菜单→404、全部无权限→403、任一放行；admin 经 pe 自动放行）

- [ ] **Step 1: Write the failing test**

```java
package com.workflow.engine.page;

import com.workflow.common.exception.BusinessException;
import com.workflow.framework.security.permission.PermissionEvaluator;
import com.workflow.system.domain.entity.SysMenu;
import com.workflow.system.repository.SysMenuRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@SpringBootTest
class PageAccessGuardTest {

    @Autowired
    private PageAccessGuard guard;

    @MockBean
    private SysMenuRepository menuRepository;
    @MockBean
    private PermissionEvaluator permissionEvaluator;

    private SysMenu menuA;
    private SysMenu menuB;

    @BeforeEach
    void setUp() {
        menuA = new SysMenu();
        menuA.setId(1L);
        menuA.setPath("/page/leave-query");
        menuA.setPermission("page:read:leave-query");
        menuA.setStatus(1);
        menuA.setIsDeleted(0);

        menuB = new SysMenu();
        menuB.setId(2L);
        menuB.setPath("/page/leave-query");
        menuB.setPermission("page:read:leave-query");
        menuB.setStatus(1);
        menuB.setIsDeleted(0);
    }

    @Test
    void assertPageAccess_noMenu_throws404() {
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0)).thenReturn(List.of());
        assertThatThrownBy(() -> guard.assertPageAccess("leave-query"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("页面不存在或未挂接菜单");
    }

    @Test
    void assertPageAccess_orSemantics_anyMenuGrants() {
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0))
                .thenReturn(List.of(menuA, menuB));
        // 仅菜单 B 有权限 → OR 放行
        when(permissionEvaluator.hasPermission(anyString())).thenReturn(false);
        when(permissionEvaluator.hasPermission("page:read:leave-query"))
                .thenAnswer(inv -> {
                    // 模拟：对 menuB 有权限（第一次调用 false，第二次 true）
                    return callCount++ > 0;
                });

        assertThatCode(() -> guard.assertPageAccess("leave-query"))
                .doesNotThrowAnyException();
    }

    private int callCount = 0;

    @Test
    void assertPageAccess_allDenied_throws403() {
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0))
                .thenReturn(List.of(menuA, menuB));
        when(permissionEvaluator.hasPermission(anyString())).thenReturn(false);

        assertThatThrownBy(() -> guard.assertPageAccess("leave-query"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("无页面访问权限");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `mvn test -pl backend -Dtest=PageAccessGuardTest`
Expected: FAIL — `PageAccessGuard` 不存在

- [ ] **Step 3: Implement PageAccessGuard（OR 语义）**

```java
package com.workflow.engine.page;

import com.workflow.common.exception.BusinessException;
import com.workflow.framework.security.permission.PermissionEvaluator;
import com.workflow.system.domain.entity.SysMenu;
import com.workflow.system.repository.SysMenuRepository;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class PageAccessGuard {

    private final SysMenuRepository menuRepository;
    private final PermissionEvaluator permissionEvaluator;

    public PageAccessGuard(SysMenuRepository menuRepository,
                           PermissionEvaluator permissionEvaluator) {
        this.menuRepository = menuRepository;
        this.permissionEvaluator = permissionEvaluator;
    }

    /**
     * 断言当前用户可访问指定 pageKey 的页面（OR 语义）。
     * 无任何关联菜单 → 404；禁用菜单不参与授权；
     * 拥有任一关联菜单的权限 → 放行；全部无权限 → 403。
     * admin 角色经 PermissionEvaluator 自动放行。
     */
    public void assertPageAccess(String pageKey) {
        List<SysMenu> menus = menuRepository.findByPathAndIsDeleted("/page/" + pageKey, 0);
        if (menus.isEmpty()) {
            throw new BusinessException(404, "页面不存在或未挂接菜单");
        }
        boolean granted = menus.stream()
                .filter(m -> m.getStatus() != null && m.getStatus() == 1)
                .map(SysMenu::getPermission)
                .filter(p -> p != null && !p.isBlank())
                .anyMatch(p -> permissionEvaluator.hasPermission(p));
        if (!granted) {
            throw new BusinessException(403, "无页面访问权限");
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `mvn test -pl backend -Dtest=PageAccessGuardTest`
Expected: PASS（3 个用例）

- [ ] **Step 5: 接入 PageDefinitionController.getByKey**

在 `getByKey` 方法中，非 preview 分支调用 guard（`PageDefinitionController` 构造器注入 `PageAccessGuard`）：

```java
@GetMapping("/{key}/definition")
public R<PageDefinitionDetailDTO> getByKey(@PathVariable String key,
                                           @RequestParam(defaultValue = "false") boolean preview) {
    if (!preview) {
        pageAccessGuard.assertPageAccess(key);
    }
    PageDefinition pageDef = preview ? pageDefService.getPreviewByKey(key) : pageDefService.getPublishedByKey(key);
    return R.ok(toDetailDTO(pageDef));
}
```

- [ ] **Step 6: 接入 PageQueryController.query**

在 `query` 方法最前面调用 guard（构造器注入 `PageAccessGuard`）：

```java
@GetMapping("/{pageKey}/data")
public R<BizDataPageVO> query(@PathVariable String pageKey, BizDataQueryRequest req) {
    pageAccessGuard.assertPageAccess(pageKey);
    // ...原有逻辑不变
}
```

- [ ] **Step 7: 扩展集成测试（权限分支）**

在 `PageQueryControllerTest`（若存在）或新增用例，用 `@WithMockUser` + 自定义权限模拟（参考项目现有认证测试方式）覆盖：
- 已挂接菜单 + 有 `page:read:leave-query` 权限 → 200
- 已挂接菜单 + 无权限 → 403
- 未挂接菜单 → 404
- 多菜单仅一个有权限（OR）→ 200

若项目用 JWT 集成认证，则按现有测试基建补用例。

- [ ] **Step 8: Run full backend test**

Run: `mvn test -pl backend`
Expected: PASS（既有测试 + 新增用例全绿；若有既有页面渲染/查询测试依赖未挂接页面访问，需同步补齐挂接数据或调整断言）

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/com/workflow/engine/page/PageAccessGuard.java backend/src/main/java/com/workflow/api/controller/PageDefinitionController.java backend/src/main/java/com/workflow/api/controller/PageQueryController.java backend/src/test/java/com/workflow/engine/page/PageAccessGuardTest.java
git commit -m "feat: 页面渲染与数据接口后端权限校验（OR 语义）"
```

---

### Task 4: 前端设计器挂接按钮、弹窗与列表管理

**Files:**
- Modify: `frontend/src/views/page/PageDesignerRouter.vue`（或页面设计视图主文件，以现有挂接点为准）
- Modify: `frontend/src/api/page.ts`（新增三个方法）
- Test: 手动冒烟（本项目前端无单测基建则以构建 + 手工验证为准）

**Interfaces:**
- Consumes: `GET /api/v1/pages/{key}/menus`、`POST /api/v1/pages/{id}/mount-menu`、`DELETE /api/v1/pages/menus/{menuId}`（Task 2）；`authStore.menus`（过滤 menuType===1 作目录树）
- Produces: `pageApi.getMenusByKey(key)`、`pageApi.mountMenu(id, {name, parentId})`、`pageApi.unmountMenu(menuId)`

- [ ] **Step 1: 封装前端 API**

`frontend/src/api/page.ts` 新增（按项目现有导出风格，若用 `pageApi` 对象则挂到该对象上）：

```ts
export interface PageMenuItem {
  menuId: number
  menuName: string
  path: string
  parentId?: number | null
  permission?: string
  status?: number
}

export interface PageMenusInfo {
  items: PageMenuItem[]
}

/** 查询页面全部关联菜单 */
export async function getPageMenus(key: string): Promise<PageMenuItem[]> {
  const res = await http.get(`/pages/${key}/menus`)
  return res.data?.items ?? []
}

/** 挂接菜单（每次创建新菜单） */
export async function mountPageMenu(id: string, body: { name?: string; parentId?: number | null }): Promise<PageMenuItem> {
  const res = await http.post(`/pages/${id}/mount-menu`, body)
  return res.data
}

/** 解除挂接（软删菜单） */
export async function unmountPageMenu(menuId: number): Promise<void> {
  await http.delete(`/pages/menus/${menuId}`)
}
```

- [ ] **Step 2: 页面加载时查询挂接列表**

在页面设计器脚本 setup 中（页面加载/页面信息就绪后）：

```ts
const mountedMenus = ref<PageMenuItem[]>([])
const isPublished = computed(() => pageInfo.value?.status === 'PUBLISHED')

async function loadMenus() {
  if (!pageKey.value || !isPublished.value) { mountedMenus.value = []; return }
  try {
    mountedMenus.value = await getPageMenus(pageKey.value)
  } catch {
    mountedMenus.value = []
  }
}
```

- [ ] **Step 3: 工具栏按钮（已发布时显示）**

```vue
<template>
  <!-- 工具栏，发布按钮旁 -->
  <el-button v-if="isPublished" type="primary" @click="showMountDialog = true">
    挂接菜单
  </el-button>
</template>
```

- [ ] **Step 4: 挂接弹窗（含防误操作提示 + 已挂列表）**

```vue
<el-dialog v-model="showMountDialog" title="挂接到系统菜单" width="560px">
  <!-- 已挂列表 -->
  <div v-if="mountedMenus.length" class="mb-3">
    <div class="text-sm text-gray-500 mb-1">该页面已在 {{ mountedMenus.length }} 个菜单中：</div>
    <el-tag v-for="m in mountedMenus" :key="m.menuId" closable @close="handleUnmount(m)" class="mr-1 mb-1">
      {{ m.menuName }}
    </el-tag>
  </div>
  <el-alert
    v-if="mountedMenus.length"
    type="warning"
    :closable="false"
    show-icon
    title="继续挂接将为该页面新增一条菜单"
    class="mb-3"
  />
  <el-form label-width="90px">
    <el-form-item label="菜单名称">
      <el-input v-model="mountForm.name" placeholder="默认使用页面名称" />
    </el-form-item>
    <el-form-item label="所属目录">
      <el-tree-select
        v-model="mountForm.parentId"
        :data="menuCategories"
        :props="{ label: 'menuName', children: 'children', value: 'id' }"
        check-strictly
        clearable
        placeholder="不选则挂到根目录"
        style="width: 100%"
      />
    </el-form-item>
  </el-form>
  <template #footer>
    <el-button @click="showMountDialog = false">取消</el-button>
    <el-button type="primary" :loading="mounting" @click="confirmMount">挂接</el-button>
  </template>
</el-dialog>
```

`menuCategories` 计算属性：`authStore.menus.filter(m => m.menuType === 1)`（递归保留 children 中 menuType===1 的子目录）。

- [ ] **Step 5: 挂接 / 解除动作**

```ts
const mounting = ref(false)
async function confirmMount() {
  mounting.value = true
  try {
    await mountPageMenu(pageInfo.value.id, {
      name: mountForm.name || undefined,
      parentId: mountForm.parentId ?? null,
    })
    ElMessage.success('挂接成功')
    mountForm.name = ''
    mountForm.parentId = null
    await loadMenus()
  } catch {
    // http 拦截器已提示
  } finally {
    mounting.value = false
  }
}

async function handleUnmount(menu: PageMenuItem) {
  try {
    await ElMessageBox.confirm(`确定解除菜单「${menu.menuName}」吗？`, '解除挂接', { type: 'warning' })
  } catch {
    return
  }
  await unmountPageMenu(menu.menuId)
  ElMessage.success('已解除')
  await loadMenus()
}
```

- [ ] **Step 6: 前端构建验证**

Run: `cd frontend && npm run build`
Expected: 构建成功，无 TS 错误

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/page.ts frontend/src/views/page/PageDesignerRouter.vue
git commit -m "feat: 页面设计器挂接菜单（多挂接管理 + 解除）"
```

---

### Task 5: 端到端验证与收尾

**Files:**
- 无新增代码；验证既有改动

- [ ] **Step 1: 后端全量测试**

Run: `mvn test`
Expected: 全绿

- [ ] **Step 2: 前端构建**

Run: `cd frontend && npm run build`
Expected: 成功

- [ ] **Step 3: 手动冒烟（多挂接）**

1. 设计器创建并发布一个视图（如 leave-query）
2. 点击"挂接菜单"→ 挂到"人事"目录（名称"请假查询"）→ 成功，列表显示 1 条
3. 再次点击"挂接菜单"→ 挂到"考勤"目录（名称"假期管理"）→ 成功，列表显示 2 条，弹窗出现防误操作提示
4. 侧边栏两处出现菜单，点击都进入 `/page/leave-query` 正常渲染
5. 解除"考勤"目录那条 → 列表剩 1 条，侧边栏对应菜单消失
6. 用无该权限的账号访问 `/page/leave-query` → 403（data 接口）
7. 用仅授权"人事"菜单的账号访问 → 200（OR 放行）

- [ ] **Step 4: 更新 features.md**

在 `docs/features.md` 的视图轨小节补充：页面可一键挂接到系统菜单（支持多挂接）、渲染/数据接口带权限校验（OR 语义）。

- [ ] **Step 5: Commit**

```bash
git add docs/features.md
git commit -m "docs: 更新功能清单（页面多挂接菜单 + 访问控制）"
```
