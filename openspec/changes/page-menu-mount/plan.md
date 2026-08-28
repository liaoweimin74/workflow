# 页面挂接到系统菜单 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让已发布视图/页面通过设计器一键挂接到系统菜单，并补齐页面渲染与数据接口的后端权限校验（无菜单 404 / 无权限 403），形成"设计→发布→挂接→访问"闭环。

**Architecture:** 复用现有 `sys_menu` 权限体系（角色→菜单→permission→`hasPermission`）。后端新增挂接接口（幂等创建菜单）+ 在 `PageDefinitionController.getByKey`（非 preview）与 `PageQueryController.query` 注入基于菜单 permission 的访问校验；前端设计器新增"挂接菜单"按钮与弹窗。共享校验逻辑封装为独立 Guard 组件，两 Controller 复用。

**Tech Stack:** Spring Boot + Spring Data JPA + Spring Security（`SecurityContextHolder`/`LoginUser`）、Vue 3 + Element Plus + vue-router。

## Global Constraints

- 权限码格式固定为 `page:read:{pageKey}`（每页唯一，action 位可扩展），不允许其他命名
- 菜单 path 固定为 `/page/{pageKey}`，component 固定为 `page/PageRenderer`
- 挂接幂等：同 path 只允许一条菜单（is_deleted=0），重复挂接返回既有菜单
- 仅 PUBLISHED 页面可挂接（DRAFT/ARCHIVED → 400）
- preview=true（definition 接口）跳过权限校验；data 接口始终校验
- 后端校验复用 `@Component("pe")` `PermissionEvaluator.hasPermission(...)`（含 admin 绕过），不重复造轮子
- 无菜单 → 404（不暴露页面存在）；有菜单但无权限 → 403；菜单禁用/软删 → 400
- 测试遵循项目既有 JUnit + MockMvc 集成测试风格（参考 `PageQueryControllerTest`、`PageDefinitionPublishIntegrationTest`）
- 后端修改后仅编译（热部署），不重启

---

### Task 1: SysMenuRepository 新增 findByPath

**Files:**
- Modify: `backend/src/main/java/com/workflow/system/repository/SysMenuRepository.java`
- Test: `backend/src/test/java/com/workflow/system/repository/SysMenuRepositoryTest.java`（新建）

**Interfaces:**
- Produces: `Optional<SysMenu> findByPathAndIsDeleted(String path, int isDeleted)` — 后续所有按 path 反查菜单的调用点统一使用

- [ ] **Step 1: Write the failing test**

```java
package com.workflow.system.repository;

import com.workflow.system.domain.entity.SysMenu;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class SysMenuRepositoryTest {

    @Autowired
    private SysMenuRepository repository;

    @Test
    void findByPathAndIsDeleted_returnsMenu_whenExists() {
        SysMenu menu = new SysMenu();
        menu.setParentId(null);
        menu.setMenuName("请假查询");
        menu.setMenuType(1);
        menu.setPath("/page/leave-query");
        menu.setComponent("page/PageRenderer");
        menu.setPermission("page:read:leave-query");
        menu.setSortOrder(0);
        menu.setStatus(1);
        menu.setIsDeleted(0);
        SysMenu saved = repository.save(menu);

        Optional<SysMenu> found = repository.findByPathAndIsDeleted("/page/leave-query", 0);
        assertThat(found).isPresent();
        assertThat(found.get().getId()).isEqualTo(saved.getId());
        repository.delete(saved);
    }

    @Test
    void findByPathAndIsDeleted_returnsEmpty_whenSoftDeleted() {
        Optional<SysMenu> found = repository.findByPathAndIsDeleted("/page/ghost", 0);
        assertThat(found).isEmpty();
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

    Optional<SysMenu> findByPathAndIsDeleted(String path, int isDeleted);
}
```

补 import：`import java.util.Optional;`

- [ ] **Step 4: Run test to verify it passes**

Run: `mvn test -pl backend -Dtest=SysMenuRepositoryTest`
Expected: PASS（2 个用例）

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/workflow/system/repository/SysMenuRepository.java backend/src/test/java/com/workflow/system/repository/SysMenuRepositoryTest.java
git commit -m "feat: SysMenuRepository 新增 findByPathAndIsDeleted"
```

---

### Task 2: 挂接接口（mount-menu + 状态查询）

**Files:**
- Create: `backend/src/main/java/com/workflow/api/controller/PageMenuController.java`
- Create: `backend/src/main/java/com/workflow/api/dto/MountMenuRequest.java`
- Create: `backend/src/main/java/com/workflow/api/dto/PageMenuResponse.java`
- Test: `backend/src/test/java/com/workflow/api/controller/PageMenuControllerTest.java`

**Interfaces:**
- Consumes: `SysMenuRepository.findByPathAndIsDeleted(String, int)`（Task 1）；`PageDefinitionService.getById(String)`、`getPublishedByKey(String)`（已有）；`TenantProvider`（已有，见 PageDefinitionService）
- Produces:
  - `POST /api/v1/pages/{id}/mount-menu` body `{name?, parentId?}` → `R<PageMenuResponse>`
  - `GET /api/v1/pages/{key}/menu` → `R<PageMenuResponse>`（mounted 布尔 + 菜单详情）
  - `PageMenuResponse` 字段：`boolean mounted; Long menuId; String menuName; String path; String permission`

- [ ] **Step 1: Write DTOs**

`MountMenuRequest.java`（record，字段 name、parentId 均可空）：
```java
package com.workflow.api.dto;

public record MountMenuRequest(String name, Long parentId) {}
```

`PageMenuResponse.java`：
```java
package com.workflow.api.dto;

public record PageMenuResponse(
        boolean mounted,
        Long menuId,
        String menuName,
        String path,
        String permission) {}
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

import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
    private SysMenu existingMenu;

    @BeforeEach
    void setUp() {
        publishedPage = new PageDefinition();
        publishedPage.setId("p1");
        publishedPage.setKey("leave-query");
        publishedPage.setName("请假查询");
        publishedPage.setType("VIEW");
        publishedPage.setStatus("PUBLISHED");

        existingMenu = new SysMenu();
        existingMenu.setId(100L);
        existingMenu.setMenuName("请假查询");
        existingMenu.setPath("/page/leave-query");
        existingMenu.setPermission("page:read:leave-query");
        existingMenu.setStatus(1);
        existingMenu.setIsDeleted(0);
    }

    @Test
    void mountMenu_createsWhenNotExists() throws Exception {
        when(pageDefService.getById("p1")).thenReturn(publishedPage);
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0)).thenReturn(Optional.empty());
        when(menuRepository.save(any(SysMenu.class))).thenAnswer(inv -> {
            SysMenu m = inv.getArgument(0);
            m.setId(101L);
            return m;
        });

        mockMvc.perform(post("/api/v1/pages/p1/mount-menu")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new com.workflow.api.dto.MountMenuRequest("请假查询", null))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.mounted").value(true))
                .andExpect(jsonPath("$.data.menuId").value(101))
                .andExpect(jsonPath("$.data.path").value("/page/leave-query"))
                .andExpect(jsonPath("$.data.permission").value("page:read:leave-query"));

        verify(menuRepository).save(any(SysMenu.class));
    }

    @Test
    void mountMenu_isIdempotentWhenExists() throws Exception {
        when(pageDefService.getById("p1")).thenReturn(publishedPage);
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0)).thenReturn(Optional.of(existingMenu));

        mockMvc.perform(post("/api/v1/pages/p1/mount-menu")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new com.workflow.api.dto.MountMenuRequest(null, null))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.menuId").value(100));

        verify(menuRepository, never()).save(any(SysMenu.class));
    }

    @Test
    void mountMenu_rejectsDraft() throws Exception {
        publishedPage.setStatus("DRAFT");
        when(pageDefService.getById("p1")).thenReturn(publishedPage);

        mockMvc.perform(post("/api/v1/pages/p1/mount-menu")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new com.workflow.api.dto.MountMenuRequest(null, null))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getMenu_returnsMounted() throws Exception {
        when(pageDefService.getPublishedByKey("leave-query")).thenReturn(publishedPage);
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0)).thenReturn(Optional.of(existingMenu));

        mockMvc.perform(get("/api/v1/pages/leave-query/menu"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.mounted").value(true))
                .andExpect(jsonPath("$.data.menuId").value(100));
    }

    @Test
    void getMenu_returnsNotMounted() throws Exception {
        when(pageDefService.getPublishedByKey("leave-query")).thenReturn(publishedPage);
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/pages/leave-query/menu"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.mounted").value(false));
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

    /** 挂接菜单：幂等（同 path 已存在则返回既有菜单） */
    @PostMapping("/{id}/mount-menu")
    public R<PageMenuResponse> mountMenu(@PathVariable String id,
                                         @RequestBody(required = false) MountMenuRequest request) {
        PageDefinition page = pageDefService.getById(id);
        if (!"PUBLISHED".equals(page.getStatus())) {
            throw new BusinessException(400, "仅可挂接已发布的页面");
        }
        String path = "/page/" + page.getKey();
        SysMenu existing = menuRepository.findByPathAndIsDeleted(path, 0).orElse(null);
        if (existing != null) {
            return R.ok(toResponse(existing));
        }
        SysMenu menu = new SysMenu();
        menu.setMenuName(request != null && request.name() != null ? request.name() : page.getName());
        menu.setPath(path);
        menu.setComponent("page/PageRenderer");
        menu.setPermission("page:read:" + page.getKey());
        menu.setMenuType(1);
        menu.setParentId(request != null ? request.parentId() : null);
        menu.setSortOrder(0);
        menu.setStatus(1);
        menu.setIsDeleted(0);
        SysMenu saved = menuRepository.save(menu);
        return R.ok(toResponse(saved));
    }

    /** 查询挂接状态 */
    @GetMapping("/{key}/menu")
    public R<PageMenuResponse> getMenu(@PathVariable String key) {
        PageDefinition page = pageDefService.getPublishedByKey(key);
        SysMenu menu = menuRepository.findByPathAndIsDeleted("/page/" + key, 0).orElse(null);
        if (menu == null) {
            return R.ok(new PageMenuResponse(false, null, null, null, null));
        }
        return R.ok(toResponse(menu));
    }

    private PageMenuResponse toResponse(SysMenu menu) {
        return new PageMenuResponse(true, menu.getId(), menu.getMenuName(),
                menu.getPath(), menu.getPermission());
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `mvn test -pl backend -Dtest=PageMenuControllerTest`
Expected: PASS（5 个用例）

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/workflow/api/controller/PageMenuController.java backend/src/main/java/com/workflow/api/dto/MountMenuRequest.java backend/src/main/java/com/workflow/api/dto/PageMenuResponse.java backend/src/test/java/com/workflow/api/controller/PageMenuControllerTest.java
git commit -m "feat: 页面挂接菜单接口（幂等挂接 + 状态查询）"
```

---

### Task 3: 页面访问权限校验（共享 Guard + 两接口接入）

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/page/PageAccessGuard.java`
- Modify: `backend/src/main/java/com/workflow/api/controller/PageDefinitionController.java`（getByKey 非 preview 分支）
- Modify: `backend/src/main/java/com/workflow/api/controller/PageQueryController.java`（query 入口）
- Test: `backend/src/test/java/com/workflow/api/controller/PageAccessGuardTest.java`（新建）+ 扩展现有 Controller 测试

**Interfaces:**
- Consumes: `SysMenuRepository.findByPathAndIsDeleted`（Task 1）、`@Component("pe")` `PermissionEvaluator.hasPermission(String...)`
- Produces: `PageAccessGuard.assertPageAccess(String pageKey)`（无返回；无菜单→404、禁用→400、无权限→403；admin 经 pe 自动放行）
- Produces 方法签名：`public void assertPageAccess(String pageKey)`

- [ ] **Step 1: Write the failing test**

```java
package com.workflow.engine.page;

import com.workflow.common.exception.BusinessException;
import com.workflow.system.domain.entity.SysMenu;
import com.workflow.system.repository.SysMenuRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@SpringBootTest
class PageAccessGuardTest {

    @Autowired
    private PageAccessGuard guard;

    @MockBean
    private SysMenuRepository menuRepository;

    private SysMenu menu;

    @BeforeEach
    void setUp() {
        menu = new SysMenu();
        menu.setId(1L);
        menu.setPath("/page/leave-query");
        menu.setPermission("page:read:leave-query");
        menu.setStatus(1);
        menu.setIsDeleted(0);
    }

    @Test
    void assertPageAccess_noMenu_throws404() {
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> guard.assertPageAccess("leave-query"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("页面不存在或未挂接菜单");
    }

    @Test
    void assertPageAccess_disabledMenu_throws400() {
        menu.setStatus(0);
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0)).thenReturn(Optional.of(menu));
        assertThatThrownBy(() -> guard.assertPageAccess("leave-query"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("页面访问被禁用");
    }
}
```

（权限命中/403 分支依赖 SecurityContext 中的真实登录用户，放在 Controller 集成测试覆盖：有权限 200 / 无权限 403 用 MockMvc + 模拟认证。）

- [ ] **Step 2: Run test to verify it fails**

Run: `mvn test -pl backend -Dtest=PageAccessGuardTest`
Expected: FAIL — `PageAccessGuard` 不存在

- [ ] **Step 3: Implement PageAccessGuard**

```java
package com.workflow.engine.page;

import com.workflow.common.exception.BusinessException;
import com.workflow.framework.security.permission.PermissionEvaluator;
import com.workflow.system.domain.entity.SysMenu;
import com.workflow.system.repository.SysMenuRepository;
import org.springframework.stereotype.Component;

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
     * 断言当前用户可访问指定 pageKey 的页面。
     * 无关联菜单 → 404；菜单禁用/软删 → 400；无权限 → 403。
     * admin 角色经 PermissionEvaluator 自动放行。
     */
    public void assertPageAccess(String pageKey) {
        SysMenu menu = menuRepository.findByPathAndIsDeleted("/page/" + pageKey, 0)
                .orElseThrow(() -> new BusinessException(404, "页面不存在或未挂接菜单"));
        if (menu.getStatus() == null || menu.getStatus() != 1) {
            throw new BusinessException(400, "页面访问被禁用");
        }
        String required = menu.getPermission();
        if (required != null && !required.isBlank() && !permissionEvaluator.hasPermission(required)) {
            throw new BusinessException(403, "无页面访问权限");
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `mvn test -pl backend -Dtest=PageAccessGuardTest`
Expected: PASS（2 个用例）

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

（注：`getPublishedByKey` 的 404 兜底逻辑保持不变，guard 先跑，避免未挂接页面暴露 schema。）

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
- 有 `page:read:leave-query` 权限 + 已挂接菜单 → 200
- 无该权限 → 403
- 未挂接菜单 → 404

若项目用 JWT 集成认证，则按现有测试基建（如 test security config）补两用例：已挂接+登录用户 200、未挂接 404。

- [ ] **Step 8: Run full backend test**

Run: `mvn test -pl backend`
Expected: PASS（既有测试 + 新增用例全绿；若有既有页面渲染/查询测试依赖未挂接页面访问，需同步补齐挂接数据或调整断言）

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/com/workflow/engine/page/PageAccessGuard.java backend/src/main/java/com/workflow/api/controller/PageDefinitionController.java backend/src/main/java/com/workflow/api/controller/PageQueryController.java backend/src/test/java/com/workflow/engine/page/PageAccessGuardTest.java
git commit -m "feat: 页面渲染与数据接口后端权限校验（无菜单404/无权限403）"
```

---

### Task 4: 前端设计器挂接按钮与弹窗

**Files:**
- Modify: `frontend/src/views/page/PageDesignerRouter.vue`（或页面设计视图主文件，以现有挂接点为准）
- Modify: `frontend/src/api/page.ts`（新增两个方法）
- Test: 手动冒烟（本项目前端无单测基建则以构建 + 手工验证为准）

**Interfaces:**
- Consumes: `GET /api/v1/pages/{key}/menu`、`POST /api/v1/pages/{id}/mount-menu`（Task 2）；`authStore.menus`（过滤 menuType===1 作目录树）
- Produces: `pageApi.getMenuByKey(key)`、`pageApi.mountMenu(id, {name, parentId})`

- [ ] **Step 1: 封装前端 API**

`frontend/src/api/page.ts` 新增：

```ts
export interface PageMenuInfo {
  mounted: boolean
  menuId?: number | null
  menuName?: string | null
  path?: string | null
  permission?: string | null
}

/** 查询页面挂接状态 */
export async function getPageMenu(key: string): Promise<PageMenuInfo> {
  const res = await http.get(`/pages/${key}/menu`)
  return res.data
}

/** 挂接菜单（幂等） */
export async function mountPageMenu(id: string, body: { name?: string; parentId?: number | null }): Promise<PageMenuInfo> {
  const res = await http.post(`/pages/${id}/mount-menu`, body)
  return res.data
}
```

（按项目现有 `page.ts` 的导出风格——若用 `pageApi` 对象则挂到该对象上，保持一致性。）

- [ ] **Step 2: 页面加载时查询挂接状态**

在页面设计器脚本 setup 中（页面加载/页面信息就绪后）：

```ts
const mountedMenu = ref<PageMenuInfo>({ mounted: false })
const isPublished = computed(() => pageInfo.value?.status === 'PUBLISHED')

async function loadMenuState() {
  if (!pageKey.value || !isPublished.value) { mountedMenu.value = { mounted: false }; return }
  try {
    mountedMenu.value = await getPageMenu(pageKey.value)
  } catch {
    mountedMenu.value = { mounted: false }
  }
}
```

- [ ] **Step 3: 工具栏按钮（已发布 + 未挂 → "挂接菜单"；已挂 → 展示已挂状态）**

```vue
<template>
  <!-- 工具栏，发布按钮旁 -->
  <el-button
    v-if="isPublished && !mountedMenu.mounted"
    type="primary"
    @click="showMountDialog = true"
  >
    挂接菜单
  </el-button>
  <el-button v-else-if="isPublished && mountedMenu.mounted" type="info" @click="goMenuPage">
    已挂接<span v-if="mountedMenu.menuName">：{{ mountedMenu.menuName }}</span>
  </el-button>
</template>
```

`goMenuPage`：跳转 `/system/menu`（菜单管理页）。

- [ ] **Step 4: 挂接弹窗**

```vue
<el-dialog v-model="showMountDialog" title="挂接到系统菜单" width="480px">
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

- [ ] **Step 5: 挂接动作**

```ts
const mounting = ref(false)
async function confirmMount() {
  mounting.value = true
  try {
    const res = await mountPageMenu(pageInfo.value.id, {
      name: mountForm.name || undefined,
      parentId: mountForm.parentId ?? null,
    })
    mountedMenu.value = res
    ElMessage.success('挂接成功')
    showMountDialog.value = false
  } catch {
    // http 拦截器已提示
  } finally {
    mounting.value = false
  }
}
```

- [ ] **Step 6: 前端构建验证**

Run: `cd frontend && npm run build`
Expected: 构建成功，无 TS 错误

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/page.ts frontend/src/views/page/PageDesignerRouter.vue
git commit -m "feat: 页面设计器挂接菜单按钮与弹窗"
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

- [ ] **Step 3: 手动冒烟**

1. 设计器创建并发布一个视图（如 leave-query）
2. 点击"挂接菜单"→ 填名称/选目录 → 挂接成功
3. 侧边栏出现新菜单，点击进入 `/page/leave-query` 正常渲染
4. 菜单管理页确认 sys_menu 记录（path=/page/leave-query、permission=page:read:leave-query）
5. 再次点击"挂接菜单"→ 显示已挂接状态
6. 用无该权限的账号访问 `/page/leave-query` → 403（data 接口）

- [ ] **Step 4: 更新 features.md**

在 `docs/features.md` 的视图轨小节补充：页面可一键挂接到系统菜单、渲染/数据接口带权限校验。

- [ ] **Step 5: Commit**

```bash
git add docs/features.md
git commit -m "docs: 更新功能清单（页面挂接菜单 + 访问控制）"
```
