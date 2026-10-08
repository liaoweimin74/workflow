# 页面挂接到系统菜单设计（多挂接版）

> 作者：Sisyphus  
> 日期：2026-08-28  
> 状态：已确认（多挂接方向）

## 1. 背景

系统已实现表单设计器、页面设计器、视图设计器，视图（VIEW）轨端到端可用。当前问题在于：

1. 已发布的页面/视图只能通过 `/page/:pageKey` 预览运行，**没有和系统菜单挂接**
2. 访问控制仅靠前端侧边栏隐蔽，**后端不做权限校验**
3. 设计器发布后，**缺乏快速挂接菜单的入口**

## 2. 目标

- **前端**：提供设计器挂接菜单的按钮，减少用户操作步骤；支持一个页面挂多个菜单（多入口/分部门）
- **后端**：在页面渲染接口添加访问控制校验（OR 语义）
- **完整闭环**：设计器 → 发布 → 挂接菜单 → 用户访问

## 3. 方案概览（方案A：设计器挂接 + 菜单控制 + 后端校验 + 多挂接）

```
┌─────────────────┐     ┌──────────────┐     ┌───────────────┐
│ 视图设计器      │     │ MenuService  │     │ 用户访问      │
│（发布）        │────▶│ 创建 sys_menu│────▶│ 侧边栏显示   │
│ 可挂 N 个菜单  │     │ 每次新建一条 │     │ hasPermission │
└─────────────────┘     └──────────────┘     └───────────────┘
         │                          │                    │
         ▼                          ▼                    ▼
   PageDefinition         sys_menu 记录(N条)     PageRenderer
   已发布状态             path=/page/:key        后端 OR 校验
   status=PUBLISHED       permission=            任一菜单权限
                         page:read:{key}         即放行
```

### 3.1 方案优势

| 优势 | 说明 |
|------|------|
| 前端+后端双重控制 | 符合权限体系，防止 URL 直填访问 |
| 复用现有框架 | 使用 `sys_menu`、`hasPermission`、`PermissionEvaluator` 等已有机制 |
| 多入口 | 同一视图挂多个菜单（不同目录/名称），分部门/分角色菜单的刚需 |
| 操作一步到位 | 设计器挂接按钮，免手动进入菜单页 |

### 3.2 方案劣势

| 劣势 | 说明 |
|------|------|
| 需要后端新增接口 | mount-menu、menus 列表、解除挂接 |
| 防误操作要求 | 多挂接需"已挂 N 个菜单"提示 + 列表管理，避免菜单脏数据 |
| 访问校验升维 | 从单条查询变 List + OR 聚合 |

## 4. 详细设计

### 4.1 数据模型

#### 4.1.1 现有表

```
sys_menu（无 path 唯一约束，多菜单同 path 合法）
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
| `permission` 格式 | `page:read:{pageKey}`（action 位可扩展） |
| `path` 格式 | `/page/{pageKey}`，component=`page/PageRenderer` |
| 挂接语义 | **多挂接**：每次挂接创建一条新菜单，同一页面可挂多个 |
| 侧边栏显示 | 前端 `hasPermission` 检查 `page:read:{key}` |
| 访问校验 | **OR**：拥有任一关联菜单权限即放行 |

### 4.2 接口设计

#### 4.2.1 挂接菜单（每次创建新菜单）

```http
POST /api/v1/pages/{id}/mount-menu
Body: {
  "name": "员工列表",           // 菜单名称（可选，默认用 page.name）
  "parentId": 5               // 父菜单 ID（可空，空则挂根）
}
Response: {
  "success": true,
  "menuId": 12345,
  "menuName": "员工列表",
  "path": "/page/employee-list",
  "parentId": 5,
  "permission": "page:read:employee-list"
}
```

幂等规则：**不幂等**——每次调用创建一条新菜单；重复挂接由前端"已挂 N 个菜单"提示 + 用户确认来控制。

#### 4.2.2 挂接菜单列表查询

```http
GET /api/v1/pages/{key}/menus
Response: {
  "items": [
    { "menuId": 100, "menuName": "人事请假", "path": "/page/leave-query", "parentId": 1, "permission": "page:read:leave-query", "status": 1 },
    { "menuId": 101, "menuName": "考勤请假", "path": "/page/leave-query", "parentId": 2, "permission": "page:read:leave-query", "status": 1 }
  ]
}
```

未挂接返回空数组；页面不存在/未发布 → 404。

#### 4.2.3 解除挂接（软删）

```http
DELETE /api/v1/pages/menus/{menuId}
```

不存在或已软删 → 404。解除不影响页面及其它关联菜单。

### 4.3 后端权限校验（OR 语义，共享 Guard）

`PageAccessGuard.assertPageAccess(pageKey)`：

```java
@Component
public class PageAccessGuard {
    // 注入 SysMenuRepository + @Component("pe") PermissionEvaluator

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

接入点：
- `PageDefinitionController.getByKey`：非 preview 分支调用 guard；preview=true 跳过（设计器预览畅通）
- `PageQueryController.query`：入口最前调用 guard

**依赖**：
- `SysMenuRepository.findByPathAndIsDeleted(String path, int isDeleted)` 返回 `List<SysMenu>`（新增）
- `PermissionEvaluator`（`@Component("pe")`）已有，含 admin 角色自动放行

### 4.4 前端设计器按钮

#### 4.4.1 按钮位置

- 视图设计器工具栏右上角，位置参考"发布"按钮
- 仅 `status=PUBLISHED` 显示

#### 4.4.2 按钮流程

```
[已发布] → [挂接菜单] → 弹窗（已挂 N 个菜单列表 + 防误操作提示）→ 填名称/选目录 → 确认 → 新增一条菜单 → 刷新列表
[已挂列表] → 每条菜单右侧"解除"按钮 → 确认 → 软删 → 刷新列表
```

#### 4.4.3 弹窗设计

```vue
<el-dialog title="挂接到系统菜单" v-model="showMountDialog" width="560px">
  <!-- 已挂列表（可解除） -->
  <div v-if="mountedMenus.length">
    <div class="text-sm text-gray-500 mb-1">该页面已在 {{ mountedMenus.length }} 个菜单中：</div>
    <el-tag v-for="m in mountedMenus" :key="m.menuId" closable @close="handleUnmount(m)" class="mr-1 mb-1">
      {{ m.menuName }}
    </el-tag>
  </div>
  <el-alert v-if="mountedMenus.length" type="warning" :closable="false" show-icon
    title="继续挂接将为该页面新增一条菜单" class="mb-3" />
  <el-form label-width="90px">
    <el-form-item label="菜单名称">
      <el-input v-model="mountForm.name" placeholder="默认使用页面名称" />
    </el-form-item>
    <el-form-item label="所属目录">
      <el-tree-select v-model="mountForm.parentId" :data="menuCategories"
        :props="{ label: 'menuName', children: 'children', value: 'id' }"
        check-strictly clearable placeholder="不选则挂到根目录" style="width: 100%" />
    </el-form-item>
  </el-form>
  <template #footer>
    <el-button @click="showMountDialog = false">取消</el-button>
    <el-button type="primary" :loading="mounting" @click="confirmMount">挂接</el-button>
  </template>
</el-dialog>
```

**menuCategories 数据来源**：`authStore.menus`（`/auth/menus` 返回的 MenuTree，类型见 `@/types/menu.ts`），过滤 `menuType === 1` 的目录节点作为父级候选，`parentId` 不选则挂到根。

### 4.5 多挂接与重复处理

| 场景 | 处理方式 |
|------|----------|
| 同一页面挂到多个目录 | 每次挂接创建新菜单（不同 parentId/name），列表展示全部 |
| 用户重复点击挂接 | 弹窗"该页面已在 N 个菜单中 + 继续将新增一条"提示，确认后才创建 |
| 挂接后页面名称修改 | 菜单名称不自动变更（保持历史） |
| 页面删除 | 不连带删菜单，由管理员在菜单管理页清理 |
| 菜单误挂 | 弹窗列表内直接"解除挂接"（软删） |

### 4.6 版本/发布处理

- 只能在 `status=PUBLISHED` 的页面挂接（DRAFT/ARCHIVED → 400）
- 挂接后若重新发布（key 不变），全部关联菜单不变
- 若 `key` 改变（重新生成），需重新挂接（设计器层面软约束限制 key 不可改）

## 5. 风险分析

### 5.1 权限穿透风险

**风险**：用户知道 `pageKey` 可直接访问页面，越过菜单控制。

**缓解措施**：
- 后端 `PageDefinitionController`/`PageQueryController` 加 OR 校验（见 4.3）
- 无任何关联菜单的页面返回 404，减少信息泄露

### 5.2 菜单冗余/误操作（多挂接特有）

**风险**：用户反复挂接产生冗余菜单。

**缓解措施**：
- 弹窗展示"已挂 N 个菜单" + 防误操作提示
- 提供列表管理与解除挂接，随时清理

### 5.3 菜单同步问题

**风险**：页面修改 `key` 后，旧菜单仍指向旧路径。

**缓解措施**：
- 限制 `key` 一旦创建不可修改（设计器层面）
- 或提供"同步菜单"接口

### 5.4 权限字段冲突

**风险**：假设后期页面需要更细粒度的权限（读/写/导出）。

**缓解措施**：
- 当前 `page:read:{key}` 可扩展为 `page:{key}:{action}`
- 设计留口（权限字段字符串），后期可通过 `MenuService` 更新

## 6. 验收标准

- [ ] 设计器页面发布后显示"挂接菜单"按钮
- [ ] 挂接按钮弹出表单，每次挂接创建一条新菜单
- [ ] 同一页面可挂接多个菜单（不同目录/名称），列表展示全部
- [ ] 弹窗展示"已挂 N 个菜单"提示 + 每条可解除挂接
- [ ] 侧边栏出现指向页面的多个菜单项
- [ ] 无任何关联菜单的页面访问 → 404
- [ ] 全部关联菜单均无权限 → 403；任一有权限（OR）→ 放行
- [ ] 重新发布（key 不变）不影响关联菜单

## 7. 依赖约束

- 依赖 `sys_menu` 表、`permission` 机制、`PageDefinitionService`、`PermissionEvaluator`
- 前端依赖 `MenuService`（获取用户菜单树）
- `SysMenuRepository` 需新增 `findByPathAndIsDeleted`（返回 List）

## 8. 参考路径

- `backend/src/main/java/com/workflow/api/controller/PageDefinitionController.java`
- `backend/src/main/java/com/workflow/api/controller/PageQueryController.java`
- `backend/src/main/java/com/workflow/api/controller/PageMenuController.java`（新增）
- `backend/src/main/java/com/workflow/engine/page/PageAccessGuard.java`（新增）
- `backend/src/main/java/com/workflow/system/domain/entity/SysMenu.java`
- `backend/src/main/java/com/workflow/system/repository/SysMenuRepository.java`（需新增 `findByPathAndIsDeleted`）
- `backend/src/main/java/com/workflow/framework/security/permission/PermissionEvaluator.java`
- `frontend/src/router/index.ts`
- `frontend/src/views/page/PageRenderer.vue`
- `frontend/src/views/page/PageDesignerRouter.vue`（挂接按钮入口）
- `frontend/src/stores/auth.ts`（menus 来源）
