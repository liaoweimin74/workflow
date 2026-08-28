# 页面挂接到系统菜单设计

> 作者：Sisyphus  
> 日期：2026-08-28  
> 状态：草案  

## 1. 背景

系统已实现表单设计器、页面设计器、视图设计器，视图（VIEW）轨端到端可用。当前问题在于：

1. 已发布的页面/视图只能通过 `/page/:pageKey` 预览运行，**没有和系统菜单挂接**
2. 访问控制仅靠前端侧边栏隐蔽，**后端不做权限校验**
3. 设计器发布后，**缺乏快速挂接菜单的入口**

## 2. 目标

- **前端**：提供设计器挂接菜单的按钮，减少用户操作步骤
- **后端**：在页面渲染接口添加访问控制校验
- **完整闭环**：设计器 → 发布 → 挂接菜单 → 用户访问

## 3. 方案概览（方案A：设计器挂接 + 菜单控制 + 后端校验）

```
┌─────────────────┐     ┌──────────────┐     ┌───────────────┐
│ 视图设计器      │     │ MenuService  │     │ 用户访问      │
│（发布）        │────▶│ 创建 sys_menu│────▶│ 侧边栏显示   │
│                 │     │ permission   │     │ hasPermission │
└─────────────────┘     └──────────────┘     └───────────────┘
         │                          │                    │
         ▼                          ▼                    ▼
   PageDefinition         sys_menu 记录          PageRenderer
   已发布状态             path=/page/:key         @PreAuthorize 检查
   status=PUBLISHED       permission=             permission
                         page:read:{key}
```

### 3.1 方案优势

| 优势 | 说明 |
|------|------|
| 前端+后端双重控制 | 符合权限体系，防止 URL 直填访问 |
| 复用现有框架 | 使用 `sys_menu`、`hasPermission`、`@PreAuthorize` 等已有机制 |
| 操作一步到位 | 设计器挂接按钮，免手动进入菜单页 |
| 最小改动 | 只改动 PageDefinitionController + UI |

### 3.2 方案劣势

| 劣势 | 说明 |
|------|------|
| 需要后端新增接口 | `/api/v1/pages/{id}/mount-menu` |
| 前端需要新增按钮 | 设计器右上角挂接按钮 |
| 挂接后需同步信息 | 版本更新后若删跑，需同步菜单 |

## 4. 详细设计

### 4.1 数据模型

#### 4.1.1 现有表

```
sys_menu
├── id                  BIGINT PK
├── parent_id           BIGINT
├── menu_name           VARCHAR(100)
├── menu_type           INT       -- 1: 目录, 2: 按钮
├── path                VARCHAR(200)  -- 路由路径
├── component           VARCHAR(255)  -- 组件路径
├── permission          VARCHAR(100)  -- 权限码
├── icon                VARCHAR(50)   -- 图标
├── sort_order          INT
├── status              INT           -- 1:启用, 0:禁用
└── is_deleted          INT           -- 软删

wf_page_def
├── id                  VARCHAR(64) PK
├── tenant_id           VARCHAR(64)
├── name                VARCHAR(255)
├── key                 VARCHAR(255)    -- 唯一标识
├── type                VARCHAR(32)     -- VIEW/PAGE
├── form_key            VARCHAR(255)
├── data_source_id      VARCHAR(64)
├── schema              LONGTEXT
├── version             INT
├── status              VARCHAR(32)     -- DRAFT/PUBLISHED
└── ...
```

**无需新增字段**：通过 `sys_menu` 的 `path` 和 `permission` 间接挂接页面。

#### 4.1.2 业务规则

| 规则 | 说明 |
|------|------|
| `permission` 格式 | `page:read:{pageKey}`（只读） |
| `path` 格式 | `/page/{pageKey}` |
| 侧边栏显示 | 前端 `hasPermission` 检查 `page:read:{key}` |

### 4.2 接口设计

#### 4.2.1 挂接菜单

```http
POST /api/v1/pages/{id}/mount-menu
Headers: Authorization: Bearer {token}
Body: {
  "name": "员工列表",           // 菜单名称（可选，默认用 page.name）
  "parentId": null            // 父菜单 ID（挂到根或指定分类）
}
Response: {
  "success": true,
  "menuId": 12345,
  "path": "/page/employee-list",
  "permission": "page:read:employee-list",
  "url": "/page/employee-list"
}
```

#### 4.2.2 查询挂接状态

```http
GET /api/v1/pages/{key}/menu
Response: {
  "mounted": true,
  "menuId": 12345,
  "path": "/page/employee-list",
  "permission": "page:read:employee-list"
}
```

#### 4.2.3 检查是否已挂接

后端接口：
```java
// PageDefinitionController
@GetMapping("/{key}/mounted")
public R<Boolean> isMounted(@PathVariable String key) {
    PageDefinition page = pageDefService.getPublishedByKey(key);
    boolean exists = menuRepository.findByPath("/page/" + key) != null;
    return R.ok(exists);
}
```

### 4.3 后端权限校验

#### 4.3.1 PageDefinitionController 校验

```java
// PageDefinitionController.java (修改后)
package com.workflow.api.controller;

import com.workflow.framework.security.domain.LoginUser;   // 登录用户（含 permissions）
import org.springframework.security.core.Authentication;
// 省略其它 import

@RestController
@RequestMapping("/api/v1/pages")
public class PageDefinitionController {

    @GetMapping("/{key}/definition")
    public R<PageDefinitionDetailDTO> getByKey(
            @PathVariable String key,
            @RequestParam(defaultValue = "false") boolean preview,
            Authentication authentication) {

        // 仅在正式访问时校验；preview=true（设计器预览）不校验，保持设计流程畅通
        if (!preview) {
            // 获取已发布页面
            PageDefinition page = pageDefService.getPublishedByKey(key);
            
            // 找对应的菜单（SysMenuRepository 需新增 findByPath）
            SysMenu menu = menuRepository.findByPath("/page/" + key);
            
            // 无菜单 → 404（不暴露页面存在）
            if (menu == null) {
                throw new NotFoundException("页面不存在或未挂接菜单");
            }
            
            // 校验状态
            if (menu.getStatus() != 1 || menu.getIsDeleted() == 1) {
                throw new BusinessException("页面访问被禁用");
            }
            
            // 校验权限（从用户权限集合中检查）
            Set<String> userPermissions = getUserPermissions(authentication);
            if (!userPermissions.contains(menu.getPermission())) {
                throw new AccessDeniedException("无页面访问权限");
            }
        }
        
        return R.ok(toDetailDTO(preview ? 
            pageDefService.getPreviewByKey(key) : 
            pageDefService.getPublishedByKey(key)));
    }
    
    // 辅助方法：从 Authentication 获取用户权限
    private Set<String> getUserPermissions(Authentication auth) {
        if (auth != null && auth.getPrincipal() instanceof LoginUser loginUser) {
            return loginUser.getPermissions();
        }
        return Set.of();
    }
}
```

**实现依赖**：
- `SysMenuRepository` 需新增方法：`SysMenu findByPath(String path)`（或 `Optional<SysMenu> findFirstByPathAndIsDeleted(String path, int isDeleted)`）
- `LoginUser` 已存在于 `com.workflow.framework.security.domain`，含 `getPermissions(): Set<String>`

#### 4.3.2 PageQueryController 校验

```java
// PageQueryController.java (修改后)
@RestController
@RequestMapping("/api/v1/pages")
public class PageQueryController {

    @GetMapping("/{pageKey}/data")
    public R<BizDataPageVO> query(
            @PathVariable String pageKey,
            BizDataQueryRequest req,
            Authentication authentication) {
        
        // 校验页面关联菜单权限
        SysMenu menu = menuRepository.findByPath("/page/" + pageKey);
        if (menu == null) {
            throw new NotFoundException("页面未挂接菜单");
        }
        Set<String> userPermissions = getUserPermissions(authentication);
        if (!userPermissions.contains(menu.getPermission())) {
            throw new AccessDeniedException("无数据查询权限");
        }
        
        // 原有查询逻辑...
    }
}
```

### 4.4 前端设计器按钮

#### 4.4.1 按钮位置

- 视图设计器工具栏右上角
- 位置参考"发布"按钮，置于"保存草稿"旁边

#### 4.4.2 按钮流程

```
[已发布状态] → [挂接菜单] → 弹窗 → [填写名称/选择分类] → 确认 → 调用后端 → 返回菜单信息 → 提示成功
[已挂接状态] → [已挂接] → 显示挂接信息 → [查看菜单] → 跳转菜单管理页
```

#### 4.4.3 弹窗设计

```vue
<!-- PageDesigner.vue 新增按钮 -->
<el-button @click="handleMountMenu" type="primary" v-if="pagePublished">
  挂接菜单
</el-button>

<!-- 已挂接状态 -->
<el-button type="info" disabled>
  <el-icon><Menu /></el-icon> 已挂接
</el-button>

<!-- 挂接弹窗 -->
<el-dialog title="挂接到系统菜单" v-model="showMountDialog">
  <el-form>
    <el-form-item label="菜单名称">
      <el-input v-model="menuName" placeholder="默认使用页面名称" />
    </el-form-item>
    <el-form-item label="所属分类">
      <!-- 菜单目录来源：authStore.menus 中 menuType===1（目录）的节点，递归展开 -->
      <el-tree
        :data="menuCategories"
        v-model="selectedCategory"
        :props="{ value: 'id', label: 'menuName', children: 'children' }"
        node-key="id"
        highlight-current
      />
    </el-form-item>
  </el-form>
  <template #footer>
    <el-button @click="showMountDialog = false">取消</el-button>
    <el-button type="primary" @click="confirmMount">挂接</el-button>
  </template>
</el-dialog>
```

**menuCategories 数据来源**：`authStore.menus`（登录后 `/auth/menus` 返回的 MenuTree，类型见 `@/types/menu.ts`），过滤 `menuType === 1` 的目录节点作为父级候选，`parentId` 不选则挂到根（`parentId = null`）。

### 4.5 重复挂接处理

#### 4.5.1 场景

| 场景 | 处理方式 |
|------|----------|
| 同一页面已挂接菜单，再次挂接 | 显示"已挂接"状态，给出查看/编辑选项 |
| 挂接后页面名称修改 | 菜单名称不自动变更（保持历史） |
| 页面删除 | 待定：是否连带删菜单？建议不删，由管理员清理 |

#### 4.5.2 实现方式

后端 `mount-menu` 接口内部查询是否已有 `path=/page/{key}` 的菜单：
- 有 → 返回现有菜单信息
- 无 → 创建新菜单

前端显示：
```vue
<el-alert v-if="mountedMenu" type="info" title="已挂接到菜单">
  菜单名称: {{ mountedMenu.menuName }}
  <el-link type="primary" @click="goToMenu(mountedMenu.menuId)">查看菜单</el-link>
</el-alert>
```

### 4.6 版本/发布处理

#### 4.6.1 挂接时机

- 只能在 `status=PUBLISHED` 的页面挂接
- 挂接后若重新发布，菜单不变（因为 `key` 不变）
- 若 `key` 改变（重新生成），需重新挂接

#### 4.6.2 后端约束

```java
@PostMapping("/{id}/mount-menu")
public R<MenuResponse> mountMenu(
        @PathVariable String id,
        @RequestBody MountMenuRequest request) {
    
    PageDefinition page = pageDefService.getById(id);
    
    // 只能挂已发布页面
    if (!"PUBLISHED".equals(page.getStatus())) {
        throw new BusinessException(400, "仅可挂接已发布的页面");
    }
    
    // 检查是否已挂（幂等：同 path 只允许一条）
    SysMenu existing = menuRepository.findByPath("/page/" + page.getKey());
    if (existing != null) {
        return R.ok(buildResponse(existing)); // 返回已挂信息，不重复创建
    }
    
    // 创建新菜单
    SysMenu menu = new SysMenu();
    menu.setMenuName(request.getName() != null ? request.getName() : page.getName());
    menu.setPath("/page/" + page.getKey());
    menu.setComponent("page/PageRenderer");   // 复用统一渲染组件
    menu.setPermission("page:read:" + page.getKey());
    menu.setMenuType(1); // 目录类型
    menu.setParentId(request.getParentId());
    menu.setSortOrder(0);
    menu.setStatus(1);
    menu.setIsDeleted(0);
    
    menuRepository.save(menu);
    
    return R.ok(buildResponse(menu));
}
```

## 5. 风险分析

### 5.1 权限穿透风险

**风险**：用户知道 `pageKey` 可直接访问页面，越过菜单控制。

**缓解措施**：
- 后端 `PageDefinitionController` 加上权限校验（见 4.3）
- 无菜单的页面返回 404，减少信息泄露

### 5.2 菜单同步问题

**风险**：页面修改 `key` 后，旧菜单仍指向旧路径。

**缓解措施**：
- 限制 `key` 一旦创建不可修改（设计器层面）
- 或提供"同步菜单"接口

### 5.3 权限字段冲突

**风险**：假设后期页面需要更细粒度的权限（读/写/导出）。

**缓解措施**：
- 当前 `page:read:{key}` 可扩展为 `page:{key}:{action}`
- 设计留口（权限字段字符串），后期可通过 `MenuService` 更新

## 6. 验收标准

- [ ] 设计器页面发布后显示"挂接菜单"按钮
- [ ] 挂接按钮弹出表单，创建菜单成功
- [ ] 侧边栏出现指向页面的菜单项
- [ ] 用户访问 `/page/:pageKey` 前端能看到页面
- [ ] 无权限用户访问 `/page/:pageKey` 后端返回 403
- [ ] 已挂接页面再次挂接显示"已挂接"状态
- [ ] 同一页面不同版本挂接一次即可

## 7. 依赖约束

- 依赖 `sys_menu` 表、`permission` 机制、`PageDefinitionService`
- 前端依赖 `MenuService`（获取用户菜单树）
- 需新增 `AuthServiceImpl` 或 `PagePermissionEvaluator`

## 8. 参考路径

- `backend/src/main/java/com/workflow/api/controller/PageDefinitionController.java`
- `backend/src/main/java/com/workflow/api/controller/PageQueryController.java`
- `backend/src/main/java/com/workflow/system/service/AuthServiceImpl.java`
- `backend/src/main/java/com/workflow/system/domain/entity/SysMenu.java`
- `backend/src/main/java/com/workflow/system/repository/SysMenuRepository.java`（需新增 `findByPath`）
- `backend/src/main/java/com/workflow/framework/security/domain/LoginUser.java`
- `frontend/src/router/index.ts`
- `frontend/src/views/page/PageRenderer.vue`
- `frontend/src/views/page/PageDesignerRouter.vue`（挂接按钮入口）
- `frontend/src/stores/auth.ts`（menus 来源）